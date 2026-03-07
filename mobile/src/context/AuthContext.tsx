import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

import { subscribeAuthSessionInvalidation } from "../auth/authSessionEvents";
import {
    clearPendingPath as clearPendingPathStorage,
    clearProfileNameSuggestion as clearProfileNameSuggestionStorage,
    getPendingPath,
    getProfileNameSuggestion,
    savePendingPath,
    saveProfileNameSuggestion,
    sanitizeInternalPath,
} from "../lib/authFlowStorage";
import { getToken, removeToken, saveToken } from "../lib/tokenStorage";

type AuthSessionStatus = "checking" | "authenticated" | "unauthenticated";

type SignInInput = {
    accessToken: string;
    profileNameSuggestion?: string | null;
};

interface AuthContextData {
    hasToken: boolean;
    authToken: string | null;
    isLoading: boolean;
    pendingPath: string | null;
    profileNameSuggestion: string | null;
    sessionStatus: AuthSessionStatus;
    signIn: (input: SignInInput) => Promise<void>;
    signOut: () => Promise<void>;
    rememberPendingPath: (path: string | null | undefined) => Promise<void>;
    clearPendingPath: () => Promise<void>;
    clearProfileNameSuggestion: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({
    hasToken: false,
    authToken: null,
    isLoading: true,
    pendingPath: null,
    profileNameSuggestion: null,
    sessionStatus: "checking",
    signIn: async () => {},
    signOut: async () => {},
    rememberPendingPath: async () => {},
    clearPendingPath: async () => {},
    clearProfileNameSuggestion: async () => {},
});

function normalizeProfileNameSuggestion(value: string | null | undefined) {
    if (!value) return null;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [pendingPath, setPendingPath] = useState<string | null>(null);
    const [profileNameSuggestion, setProfileNameSuggestion] = useState<string | null>(null);
    const [sessionStatus, setSessionStatus] =
        useState<AuthSessionStatus>("checking");
    const signOutInFlightRef = useRef<Promise<void> | null>(null);

    const clearPendingPath = useCallback(async () => {
        await clearPendingPathStorage();
        setPendingPath(null);
    }, []);

    const clearProfileNameSuggestion = useCallback(async () => {
        await clearProfileNameSuggestionStorage();
        setProfileNameSuggestion(null);
    }, []);

    const rememberPendingPath = useCallback(async (path: string | null | undefined) => {
        const nextPendingPath = sanitizeInternalPath(path);
        await savePendingPath(path);
        setPendingPath(nextPendingPath);
    }, []);

    const signIn = useCallback(async ({ accessToken, profileNameSuggestion }: SignInInput) => {
        const nextSuggestion = normalizeProfileNameSuggestion(profileNameSuggestion);

        await Promise.all([
            saveToken(accessToken),
            saveProfileNameSuggestion(nextSuggestion),
        ]);

        setAuthToken(accessToken);
        setProfileNameSuggestion(nextSuggestion);
        setSessionStatus("authenticated");
    }, []);

    const signOut = useCallback(async () => {
        if (signOutInFlightRef.current) {
            return await signOutInFlightRef.current;
        }

        const signOutPromise = (async () => {
            setAuthToken(null);
            setPendingPath(null);
            setProfileNameSuggestion(null);
            setSessionStatus("unauthenticated");

            try {
                await Promise.all([
                    removeToken(),
                    clearPendingPathStorage(),
                    clearProfileNameSuggestionStorage(),
                ]);
            } catch (error) {
                console.error("Failed to clear auth session", error);
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
                const [savedToken, savedPendingPath, savedSuggestion] = await Promise.all([
                    getToken(),
                    getPendingPath(),
                    getProfileNameSuggestion(),
                ]);
                if (!mounted) return;

                setAuthToken(savedToken);
                setPendingPath(savedPendingPath);
                setProfileNameSuggestion(savedSuggestion);
                setSessionStatus(savedToken ? "authenticated" : "unauthenticated");
            } catch (e) {
                console.error("Failed to load auth state", e);
                if (mounted) {
                    setAuthToken(null);
                    setPendingPath(null);
                    setProfileNameSuggestion(null);
                    setSessionStatus("unauthenticated");
                }
            }
        }

        void load();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        return subscribeAuthSessionInvalidation(() => {
            void signOut();
        });
    }, [signOut]);

    return (
        <AuthContext.Provider
            value={{
                hasToken: sessionStatus === "authenticated" && !!authToken,
                authToken,
                isLoading: sessionStatus === "checking",
                pendingPath,
                profileNameSuggestion,
                sessionStatus,
                signIn,
                signOut,
                rememberPendingPath,
                clearPendingPath,
                clearProfileNameSuggestion,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
