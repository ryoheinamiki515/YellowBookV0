import React, { createContext, useContext, useState, useEffect } from 'react';
import { getToken, saveToken, removeToken } from '../lib/tokenStorage';

interface AuthContextData {
    hasToken: boolean;
    authToken: string | null;
    isLoading: boolean;
    signIn: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({
    hasToken: false,
    authToken: null,
    isLoading: true,
    signIn: async () => { },
    signOut: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                const saved = await getToken();
                if (mounted) setAuthToken(saved);
            } catch (e) {
                console.error("Failed to load token", e);
            } finally {
                if (mounted) setIsLoading(false);
            }
        }
        load();

        return () => { mounted = false; };
    }, []);

    const signIn = async (token: string) => {
        await saveToken(token);
        setAuthToken(token);
    };

    const signOut = async () => {
        await removeToken();
        setAuthToken(null);
    };

    return (
        <AuthContext.Provider value={{
            hasToken: !!authToken,
            authToken,
            isLoading,
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
