import { Stack, useRouter, useSegments, SplashScreen } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { useFonts } from "expo-font";
import {
    DMSans_400Regular,
    DMSans_400Regular_Italic,
    DMSans_500Medium,
    DMSans_500Medium_Italic,
    DMSans_600SemiBold,
    DMSans_600SemiBold_Italic,
    DMSans_700Bold,
    DMSans_700Bold_Italic,
} from "@expo-google-fonts/dm-sans";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { View, ActivityIndicator } from "react-native";
import { TamaguiProvider } from "tamagui";
import tamaguiConfig from "../tamagui.config";

const queryClient = new QueryClient();

function ProtectedLayout() {
    const { hasToken, isLoading } = useAuth();
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;

        const isLogin = segments[0] === 'login';

        if (!hasToken && !isLogin) {
            // Redirect to login if accessing protected route without token
            router.replace('/login');
        } else if (hasToken && isLogin) {
            // Redirect to home if accessing login while authenticated
            router.replace('/plans');
        }
    }, [hasToken, isLoading, segments]);

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
    const [loaded, error] = useFonts({
        DMSans_400Regular,
        DMSans_400Regular_Italic,
        DMSans_500Medium,
        DMSans_500Medium_Italic,
        DMSans_600SemiBold,
        DMSans_600SemiBold_Italic,
        DMSans_700Bold,
        DMSans_700Bold_Italic,
    });

    useEffect(() => {
        if (loaded || error) {
            SplashScreen.hideAsync();
        }
    }, [loaded, error]);

    if (!loaded && !error) {
        return null;
    }

    return (
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
            <AuthProvider>
                <QueryClientProvider client={queryClient}>
                    <ProtectedLayout />
                </QueryClientProvider>
            </AuthProvider>
        </TamaguiProvider>
    );
}
