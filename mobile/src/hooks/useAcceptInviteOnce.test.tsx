import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { renderHook } from "../testing/renderHook";
import { useAcceptInviteOnce } from "./useAcceptInviteOnce";
import { useAcceptConnectionInvite } from "../api/generated/connections/connections";

jest.mock("expo-router", () => ({
    useRouter: () => ({ replace: jest.fn() }),
}));
jest.mock("../api/generated/connections/connections", () => ({
    useAcceptConnectionInvite: jest.fn(),
    getListConnectionsQueryKey: () => ["connections"],
}));
jest.mock("../api/generated/people/people", () => ({
    getListPeopleQueryKey: () => ["people"],
}));

const mockUseAcceptConnectionInvite = useAcceptConnectionInvite as jest.Mock;

function wrapper(children: ReactNode) {
    const queryClient = new QueryClient();
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function setup(initialProps: { token: string | undefined; isAuthenticated: boolean }) {
    // A fresh object each render, mirroring react-query's mutation result, so a
    // regression that lets that object gate the effect would re-fire the accept.
    const mutate = jest.fn();
    mockUseAcceptConnectionInvite.mockImplementation(() => ({ mutate }));
    const view = renderHook((props) => useAcceptInviteOnce(props), {
        initialProps,
        wrapper,
    });
    return { mutate, ...view };
}

beforeEach(() => {
    mockUseAcceptConnectionInvite.mockReset();
});

describe("useAcceptInviteOnce", () => {
    test("fires the accept exactly once per token across re-renders", () => {
        const { mutate, rerender } = setup({ token: "tok-1", isAuthenticated: true });

        rerender({ token: "tok-1", isAuthenticated: true });
        rerender({ token: "tok-1", isAuthenticated: true });

        expect(mutate).toHaveBeenCalledTimes(1);
        expect(mutate).toHaveBeenCalledWith({ token: "tok-1" }, expect.any(Object));
    });

    test("fires again when the token changes", () => {
        const { mutate, rerender } = setup({ token: "tok-1", isAuthenticated: true });

        rerender({ token: "tok-2", isAuthenticated: true });

        expect(mutate).toHaveBeenCalledTimes(2);
        expect(mutate).toHaveBeenNthCalledWith(1, { token: "tok-1" }, expect.any(Object));
        expect(mutate).toHaveBeenNthCalledWith(2, { token: "tok-2" }, expect.any(Object));
    });

    test("does not fire while unauthenticated, then fires once after sign-in", () => {
        const { mutate, rerender } = setup({ token: "tok-1", isAuthenticated: false });
        expect(mutate).not.toHaveBeenCalled();

        rerender({ token: "tok-1", isAuthenticated: true });
        rerender({ token: "tok-1", isAuthenticated: true });

        expect(mutate).toHaveBeenCalledTimes(1);
    });

    test("does not fire without a token", () => {
        const { mutate, rerender } = setup({ token: undefined, isAuthenticated: true });
        rerender({ token: undefined, isAuthenticated: true });

        expect(mutate).not.toHaveBeenCalled();
    });
});
