import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { renderHook } from "../testing/renderHook";
import { useDeleteAccount } from "./useDeleteAccount";
import { useDeleteMe } from "../api/generated/system/system";
import { useAuth } from "../context/AuthContext";
import { unregisterPushTokenForSignOut } from "../lib/pushTokenStorage";

jest.mock("../api/generated/system/system", () => ({ useDeleteMe: jest.fn() }));
jest.mock("../context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../lib/pushTokenStorage", () => ({ unregisterPushTokenForSignOut: jest.fn() }));

const mockUseDeleteMe = useDeleteMe as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;
const mockUnregister = unregisterPushTokenForSignOut as jest.Mock;

function setup({ deleteFails = false } = {}) {
    const calls: string[] = [];
    mockUnregister.mockImplementation(async () => {
        calls.push("unregisterPushToken");
    });
    mockUseDeleteMe.mockReturnValue({
        isPending: false,
        mutateAsync: jest.fn(async () => {
            calls.push("deleteMe");
            if (deleteFails) throw new Error("HTTP 500");
        }),
    });
    mockUseAuth.mockReturnValue({
        signOut: jest.fn(async () => {
            calls.push("signOut");
        }),
    });
    const queryClient = new QueryClient();
    const wrapper = (children: ReactNode) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useDeleteAccount(), { initialProps: undefined, wrapper });
    return { calls, ...view };
}

describe("useDeleteAccount", () => {
    test("releases the push token before deleting, then signs out", async () => {
        const { calls, result } = setup();

        await result.current.deleteAccount();

        expect(calls).toEqual(["unregisterPushToken", "deleteMe", "signOut"]);
    });

    test("stays signed in when deletion fails", async () => {
        const { calls, result } = setup({ deleteFails: true });

        await expect(result.current.deleteAccount()).rejects.toThrow("HTTP 500");

        expect(calls).toEqual(["unregisterPushToken", "deleteMe"]);
    });
});
