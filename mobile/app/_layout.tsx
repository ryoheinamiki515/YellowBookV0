import { Stack, useRouter, useSegments, SplashScreen } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect } from "react";
import { useFonts } from "expo-font";
import {
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";

// Prevent the splash screen from auto-hiding before fonts are loaded.
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
            router.replace('/login');
        } else if (hasToken && isLogin) {
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
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
            <AuthProvider>
                <QueryClientProvider client={queryClient}>
                    <ProtectedLayout />
                </QueryClientProvider>
            </AuthProvider>
        </TamaguiProvider>
    );
}
