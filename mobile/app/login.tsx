import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useAuthRequest, makeRedirectUri, ResponseType } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../src/context/AuthContext";
import { useRouter } from "expo-router";

WebBrowser.maybeCompleteAuthSession();

// Hardcode discovery for Auth0
const discovery = {
    authorizationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/authorize`,
    tokenEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/token`,
    revocationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/revoke`,
};

export default function LoginScreen() {
    const { signIn } = useAuth();
    const router = useRouter();
    const [isExchanging, setIsExchanging] = useState(false);

    const redirectUri = makeRedirectUri({
        scheme: "yellowbook",
        path: "login",
    });

    console.log("Redirect URI:", redirectUri);

    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID!,
            responseType: ResponseType.Code, // PKCE flow
            scopes: ["openid", "profile", "email", "offline_access", "create:socialplans", "read:socialplans"],
            redirectUri,
            extraParams: {
                audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE!,
            },
        },
        discovery
    );

    // Handle Auth0 Code Exchange
    useEffect(() => {
        if (response?.type === "success") {
            const { code } = response.params;
            exchangeCodeForToken(code);
        } else if (response?.type === "error") {
            Alert.alert("Authentication Error", response.error?.message || "Something went wrong.");
        }
    }, [response]);

    const exchangeCodeForToken = async (code: string) => {
        setIsExchanging(true);
        try {
            const tokenResponse = await fetch(discovery.tokenEndpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "authorization_code",
                    client_id: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID!,
                    code: code,
                    redirect_uri: redirectUri,
                    code_verifier: request?.codeVerifier || "",
                }).toString(),
            });

            const data = await tokenResponse.json();

            if (tokenResponse.ok && data.access_token) {
                await signIn(data.access_token);
                // Router redirect handled by layout
            } else {
                Alert.alert("Login Failed", data.error_description || "Could not exchange token.");
            }
        } catch (e: any) {
            Alert.alert("Network Error", e.message);
        } finally {
            setIsExchanging(false);
        }
    };

    const handleSignUp = () => {
        promptAsync({ extraParams: { screen_hint: "signup", audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE! } });
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.container}
        >
            <View style={styles.card}>
                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subtitle}>Sign in to your account</Text>

                <TouchableOpacity
                    style={[styles.primaryButton, (!request || isExchanging) && styles.disabledButton]}
                    onPress={() => promptAsync()}
                    disabled={!request || isExchanging}
                >
                    {isExchanging ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.primaryButtonText}>Log In</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.secondaryButton, (!request || isExchanging) && styles.disabledButton]}
                    onPress={handleSignUp}
                    disabled={!request || isExchanging}
                >
                    <Text style={styles.secondaryButtonText}>Create Account</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#f5f5f5",
        justifyContent: "center",
        padding: 20,
    },
    card: {
        backgroundColor: "#fff",
        borderRadius: 16,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        color: "#111",
        textAlign: "center",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#666",
        textAlign: "center",
        marginBottom: 32,
    },
    primaryButton: {
        backgroundColor: "#2563eb",
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: "center",
        marginBottom: 12,
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    secondaryButton: {
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#d1d5db",
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    secondaryButtonText: {
        color: "#374151",
        fontSize: 15,
        fontWeight: "500",
    },
    disabledButton: {
        opacity: 0.5,
    },
});
