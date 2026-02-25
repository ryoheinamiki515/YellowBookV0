import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { getToken, saveToken, removeToken } from "../lib/tokenStorage";
import { getMe } from "../api/generated/system/system";
import { subscribeAuthSessionInvalidation } from "../auth/authSessionEvents";

type AuthSessionStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthContextData {
    hasToken: boolean;
    authToken: string | null;
    isLoading: boolean;
    sessionStatus: AuthSessionStatus;
    signIn: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({
    hasToken: false,
    authToken: null,
    isLoading: true,
    sessionStatus: "checking",
    signIn: async () => { },
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [sessionStatus, setSessionStatus] =
        useState<AuthSessionStatus>("checking");
    const signOutInFlightRef = useRef<Promise<void> | null>(null);

    const signIn = useCallback(async (token: string) => {
        await saveToken(token);
        setAuthToken(token);
        setSessionStatus("authenticated");
    }, []);

    const signOut = useCallback(async () => {
        if (signOutInFlightRef.current) {
            return await signOutInFlightRef.current;
        }

        const signOutPromise = (async () => {
            setAuthToken(null);
            setSessionStatus("unauthenticated");
            try {
                await removeToken();
            } catch (error) {
                console.error("Failed to remove token", error);
            }
        })();

        signOutInFlightRef.current = signOutPromise;
        try {
            await signOutPromise;
        } finally {
            signOutInFlightRef.current = null;
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                const saved = await getToken();
                if (!mounted) return;

                if (!saved) {
                    setAuthToken(null);
                    setSessionStatus("unauthenticated");
                    return;
                }

                // Keep the token in memory while we verify it before rendering protected UI.
                setAuthToken(saved);

                try {
                    await getMe();
                    if (!mounted) return;
                    setSessionStatus("authenticated");
                } catch (error: any) {
                    if (!mounted) return;

                    if (error?.status === 401) {
                        await signOut();
                        return;
                    }

                    // Network/transient failures should not force-logout; runtime requests can retry.
                    console.warn("Session validation failed, keeping local session", error);
                    setSessionStatus("authenticated");
                }
            } catch (e) {
                console.error("Failed to load token", e);
                if (mounted) {
                    setAuthToken(null);
                    setSessionStatus("unauthenticated");
                }
            }
        }
        load();

        return () => { mounted = false; };
    }, [signOut]);

    useEffect(() => {
        return subscribeAuthSessionInvalidation(() => {
            void signOut();
        });
    }, [signOut]);

    return (
        <AuthContext.Provider value={{
            hasToken: sessionStatus === "authenticated" && !!authToken,
            authToken,
            isLoading: sessionStatus === "checking",
            sessionStatus,
            signIn,
            signOut
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
