import { Stack, SplashScreen, usePathname, useRouter } from "expo-router";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo } from "react";
import { useFonts } from "expo-font";
import {
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { GestureHandlerRootView } from "react-native-gesture-handler";

SplashScreen.preventAutoHideAsync();

import { ActivityIndicator, View } from "react-native";
import { TamaguiProvider, Text, YStack } from "tamagui";

import { DetailFooterAction } from "../src/components/DetailFooterAction";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { useMeProfile } from "../src/hooks/useMeProfile";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { getResumablePendingPath } from "../src/lib/authFlowStorage";
import { getProblemDetail } from "../src/lib/problemDetails";
import tamaguiConfig from "../tamagui.config";

const queryClient = new QueryClient();

function FullScreenSpinner() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <ActivityIndicator size="large" />
        </View>
    );
}

function BootstrapErrorScreen({
    detail,
    onRetry,
    onSignOut,
}: {
    detail: string;
    onRetry: () => void;
    onSignOut: () => void;
}) {
    return (
        <View style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack flex={1} justifyContent="center" padding="$6" gap="$4">
                <YStack gap="$2">
                    <Text fontFamily="$heading" fontSize="$9" color="$color">
                        We couldn't load your profile
                    </Text>
                    <Text fontFamily="$body" fontSize="$4" color="$colorSecondary">
                        {detail || "Check your connection and try again."}
                    </Text>
                </YStack>
                <DetailFooterAction
                    label="Try Again"
                    onPress={onRetry}
                    accessibilityLabel="Retry loading your profile"
                    tone="accent"
                    variant="filled"
                />
                <DetailFooterAction
                    label="Sign Out"
                    onPress={onSignOut}
                    accessibilityLabel="Sign out"
                    tone="danger"
                    variant="ghost"
                />
            </YStack>
        </View>
    );
}

function ProtectedLayout() {
    const {
        clearPendingPath,
        hasToken,
        isLoading,
        pendingPath,
        rememberPendingPath,
        signOut,
    } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const queryClient = useQueryClient();
    const meProfile = useMeProfile();

    usePushNotifications({
        isAuthenticated: hasToken,
        isReady: hasToken && meProfile.hasCompletedProfile,
    });

    const currentPath = pathname || "/";
    const isLogin = currentPath === "/login";
    const isCompleteProfile = currentPath === "/complete-profile";
    const resumablePendingPath = useMemo(
        () => getResumablePendingPath(pendingPath),
        [pendingPath]
    );
    const bootstrapError =
        hasToken && meProfile.error && (meProfile.error as { status?: number }).status !== 401
            ? meProfile.error
            : null;

    useEffect(() => {
        if (isLoading) return;

        if (!hasToken) {
            queryClient.clear();
        }
    }, [hasToken, isLoading, queryClient]);

    useEffect(() => {
        if (isLoading) return;

        if (!hasToken) {
            if (!isLogin) {
                void rememberPendingPath(currentPath);
                router.replace("/login");
            }
            return;
        }

        if (meProfile.isLoading || bootstrapError) {
            return;
        }

        if (!meProfile.hasCompletedProfile) {
            if (!isCompleteProfile) {
                if (!isLogin) {
                    void rememberPendingPath(currentPath);
                }
                router.replace("/complete-profile");
            }
            return;
        }

        if (isLogin || isCompleteProfile) {
            const nextPath = resumablePendingPath ?? "/(main)/plans";
            if (pendingPath) {
                void clearPendingPath();
            }
            router.replace(nextPath as any);
        }
    }, [
        bootstrapError,
        clearPendingPath,
        currentPath,
        hasToken,
        isCompleteProfile,
        isLoading,
        isLogin,
        meProfile.hasCompletedProfile,
        meProfile.isLoading,
        pendingPath,
        rememberPendingPath,
        resumablePendingPath,
        router,
    ]);

    if (isLoading || (hasToken && meProfile.isLoading)) {
        return <FullScreenSpinner />;
    }

    if (bootstrapError) {
        return (
            <BootstrapErrorScreen
                detail={getProblemDetail(bootstrapError)}
                onRetry={() => {
                    void meProfile.refetch();
                }}
                onSignOut={() => {
                    void signOut();
                }}
            />
        );
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        DMSans_400Regular,
        DMSans_500Medium,
        DMSans_600SemiBold,
        DMSans_700Bold,
    });

    useEffect(() => {
        if (fontsLoaded) {
            SplashScreen.hideAsync();
        }
    }, [fontsLoaded]);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
                <AuthProvider>
                    <QueryClientProvider client={queryClient}>
                        <ProtectedLayout />
                    </QueryClientProvider>
                </AuthProvider>
            </TamaguiProvider>
        </GestureHandlerRootView>
    );
}
