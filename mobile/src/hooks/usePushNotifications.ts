import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

import { useRegisterPushToken } from "../api/generated/system/system";
import { useAuth } from "../context/AuthContext";
import { invalidatePlanQueries } from "../lib/queryInvalidation";
import { notificationRouteForData } from "../lib/notificationRouting";
import { pushRegistrationRetryDelayMs } from "../lib/pushRegistrationRetry";
import { saveRegisteredPushToken } from "../lib/pushTokenStorage";

// Show a banner + play a sound even when the app is foregrounded.
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

function resolveProjectId(): string | undefined {
    return (
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
    );
}

async function acquireExpoPushToken(): Promise<string | null> {
    let settings = await Notifications.getPermissionsAsync();
    if (!settings.granted && settings.canAskAgain) {
        settings = await Notifications.requestPermissionsAsync();
    }
    if (!settings.granted) return null;

    const projectId = resolveProjectId();
    const { data } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
    );
    return data;
}

/**
 * Registers this device's Expo push token after sign-in and routes notification
 * taps to the relevant screen. Mount once inside the authenticated tree.
 *
 * @param isAuthenticated whether a session token is present (drives registration)
 * @param isReady whether the app is bootstrapped enough to navigate immediately
 *   (authenticated + profile complete); otherwise a tap is deferred via pendingPath.
 */
export function usePushNotifications({
    isAuthenticated,
    isReady,
}: {
    isAuthenticated: boolean;
    isReady: boolean;
}) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { rememberPendingPath } = useAuth();
    const registerToken = useRegisterPushToken();
    const registeredTokenRef = useRef<string | null>(null);
    const [registrationAttempt, setRegistrationAttempt] = useState(0);

    // Keep the latest navigation decision in a ref so listeners can be attached
    // once yet always read current auth/router state when a tap arrives.
    const navigateForResponseRef = useRef<(data: unknown) => void>(() => {});
    navigateForResponseRef.current = (data: unknown) => {
        const path = notificationRouteForData(data);
        if (!path) return;
        if (isReady) {
            router.replace(path as never);
        } else {
            void rememberPendingPath(path);
        }
    };

    // Register whenever a session begins, retrying transient failures (offline,
    // 5xx) with capped exponential backoff — bumping registrationAttempt re-runs
    // this effect. The token is only marked registered on success, so a failed
    // attempt is always retried. Resetting on sign-out means the next sign-in
    // re-registers, re-associating a shared device's token with the new user.
    useEffect(() => {
        if (Platform.OS === "web") return;
        if (!isAuthenticated) {
            registeredTokenRef.current = null;
            if (registrationAttempt !== 0) setRegistrationAttempt(0);
            return;
        }

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | undefined;

        const scheduleRetry = () => {
            if (cancelled) return;
            retryTimer = setTimeout(
                () => setRegistrationAttempt((n) => n + 1),
                pushRegistrationRetryDelayMs(registrationAttempt)
            );
        };

        (async () => {
            try {
                const token = await acquireExpoPushToken();
                if (cancelled) return;
                if (!token) return; // permission denied — not a transient failure
                if (registeredTokenRef.current === token) return; // already registered

                registerToken.mutate(
                    { data: { token, platform: Platform.OS === "android" ? "android" : "ios" } },
                    {
                        onSuccess: () => {
                            registeredTokenRef.current = token;
                            void saveRegisteredPushToken(token);
                        },
                        onError: scheduleRetry,
                    }
                );
            } catch (err) {
                console.warn("Failed to register for push notifications", err);
                scheduleRetry();
            }
        })();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [isAuthenticated, registrationAttempt]);

    // Foreground receipt: refresh the plans/feed list so a shared plan appears live.
    useEffect(() => {
        const sub = Notifications.addNotificationReceivedListener(() => {
            invalidatePlanQueries(queryClient);
        });
        return () => sub.remove();
    }, [queryClient]);

    // Taps (background) + cold start from a killed app (getLastNotificationResponseAsync).
    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            navigateForResponseRef.current(response.notification.request.content.data);
        });

        let handledColdStart = false;
        void Notifications.getLastNotificationResponseAsync().then((response) => {
            if (response && !handledColdStart) {
                handledColdStart = true;
                navigateForResponseRef.current(response.notification.request.content.data);
            }
        });

        return () => sub.remove();
    }, []);
}
