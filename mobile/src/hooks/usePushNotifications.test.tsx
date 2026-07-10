import type { ReactNode } from "react";
import { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { renderHook } from "../testing/renderHook";
import { usePushNotifications } from "./usePushNotifications";
import * as Notifications from "expo-notifications";
import { useRegisterPushToken } from "../api/generated/system/system";
import { invalidatePlanQueries } from "../lib/queryInvalidation";

jest.mock("expo-notifications", () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
    getExpoPushTokenAsync: jest.fn(async () => ({ data: "ExpoPushToken[abc]" })),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock("expo-constants", () => ({
    __esModule: true,
    default: { expoConfig: { extra: { eas: { projectId: "pid" } } } },
}));
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));
const mockRememberPendingPath = jest.fn();
jest.mock("../context/AuthContext", () => ({
    useAuth: () => ({ rememberPendingPath: mockRememberPendingPath }),
}));
jest.mock("../api/generated/system/system", () => ({
    useRegisterPushToken: jest.fn(),
}));
jest.mock("../lib/queryInvalidation", () => ({
    invalidatePlanQueries: jest.fn(),
}));
jest.mock("../lib/pushTokenStorage", () => ({
    saveRegisteredPushToken: jest.fn(),
}));

const mockUseRegisterPushToken = useRegisterPushToken as jest.Mock;

function wrapper(children: ReactNode) {
    const queryClient = new QueryClient();
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function flush() {
    // Let the async registration effect (permission + token acquisition) settle.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function setup(initialProps: { isAuthenticated: boolean; isReady: boolean }) {
    const mutate = jest.fn((_args, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    mockUseRegisterPushToken.mockImplementation(() => ({ mutate }));
    const view = renderHook((props) => usePushNotifications(props), { initialProps, wrapper });
    return { mutate, ...view };
}

beforeEach(() => {
    mockUseRegisterPushToken.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRememberPendingPath.mockReset();
    (invalidatePlanQueries as jest.Mock).mockReset();
    (Notifications.addNotificationResponseReceivedListener as jest.Mock).mockClear();
});

describe("usePushNotifications", () => {
    test("registers the token once after sign-in, with the ios platform", async () => {
        const { mutate, rerender } = setup({ isAuthenticated: true, isReady: true });
        await flush();

        rerender({ isAuthenticated: true, isReady: true });
        await flush();

        expect(mutate).toHaveBeenCalledTimes(1);
        expect(mutate).toHaveBeenCalledWith(
            { data: { token: "ExpoPushToken[abc]", platform: "ios" } },
            expect.any(Object)
        );
    });

    test("retries after a transient registration failure, then succeeds", async () => {
        jest.useFakeTimers();
        try {
            const mutate = jest
                .fn()
                .mockImplementationOnce((_a, opts?: { onError?: () => void }) => opts?.onError?.())
                .mockImplementationOnce((_a, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
            mockUseRegisterPushToken.mockImplementation(() => ({ mutate }));
            renderHook((props) => usePushNotifications(props), {
                initialProps: { isAuthenticated: true, isReady: true },
                wrapper,
            });

            await flush();
            expect(mutate).toHaveBeenCalledTimes(1); // first attempt failed → retry scheduled

            await act(async () => {
                jest.advanceTimersByTime(1000); // attempt-0 backoff elapses
            });
            await flush(); // effect re-runs and re-registers

            expect(mutate).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });

    test("does not register while unauthenticated", async () => {
        const { mutate } = setup({ isAuthenticated: false, isReady: false });
        await flush();
        expect(mutate).not.toHaveBeenCalled();
    });

    test("pushes a plan_shared tap onto the plan detail screen when ready", async () => {
        setup({ isAuthenticated: true, isReady: true });
        await flush();

        const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
            .calls[0][0] as (response: unknown) => void;
        act(() => {
            listener({
                notification: {
                    request: { content: { data: { type: "plan_shared", planId: "plan-1" } } },
                },
            });
        });

        expect(mockPush).toHaveBeenCalledWith("/plan/plan-1");
        expect(mockReplace).not.toHaveBeenCalled();
        expect(mockRememberPendingPath).not.toHaveBeenCalled();
    });

    test("defers a tap via pendingPath when not yet bootstrapped", async () => {
        setup({ isAuthenticated: false, isReady: false });
        await flush();

        const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
            .calls[0][0] as (response: unknown) => void;
        act(() => {
            listener({
                notification: {
                    request: { content: { data: { type: "plan_shared", planId: "plan-9" } } },
                },
            });
        });

        expect(mockRememberPendingPath).toHaveBeenCalledWith("/plan/plan-9");
        expect(mockPush).not.toHaveBeenCalled();
        expect(mockReplace).not.toHaveBeenCalled();
    });
});
