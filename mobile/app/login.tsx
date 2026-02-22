import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useAuthRequest, makeRedirectUri, ResponseType } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../src/context/AuthContext";
import { useRouter } from "expo-router";
import { View, Text, YStack, XStack, Spinner } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const discovery = {
    authorizationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/authorize`,
    tokenEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/token`,
    revocationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/revoke`,
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LoginScreen() {
    const { signIn } = useAuth();
    const router = useRouter();
    const [isExchanging, setIsExchanging] = useState(false);

    const redirectUri = makeRedirectUri({
        scheme: "yellowbook",
        path: "login",
    });

    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID!,
            responseType: ResponseType.Code,
            scopes: [
                "openid",
                "profile",
                "email",
                "offline_access",
                "create:socialplans",
                "read:socialplans",
            ],
            redirectUri,
            extraParams: {
                audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE!,
            },
        },
        discovery
    );

    useEffect(() => {
        if (response?.type === "success") {
            const { code } = response.params;
            exchangeCodeForToken(code);
        } else if (response?.type === "error") {
            Alert.alert(
                "Hmm, something went wrong",
                response.error?.message || "We couldn't sign you in — try again?"
            );
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
                    code,
                    redirect_uri: redirectUri,
                    code_verifier: request?.codeVerifier || "",
                }).toString(),
            });

            const data = await tokenResponse.json();

            if (tokenResponse.ok && data.access_token) {
                await signIn(data.access_token);
            } else {
                Alert.alert(
                    "Couldn't sign you in",
                    data.error_description || "Something went wrong — try again?"
                );
            }
        } catch (e: any) {
            Alert.alert(
                "Connection trouble",
                "We couldn't reach the server — check your connection and try again?"
            );
        } finally {
            setIsExchanging(false);
        }
    };

    const handleSignIn = () => {
        promptAsync();
    };

    const handleSignUp = () => {
        promptAsync({
            extraParams: {
                screen_hint: "signup",
                audience: process.env.EXPO_PUBLIC_AUTH0_AUDIENCE!,
            },
        });
    };

    const isLoading = isExchanging || !request;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack
                flex={1}
                backgroundColor="$background"
                justifyContent="center"
                alignItems="center"
                paddingHorizontal="$6"
            >
                {/* Top spacer — pushes content slightly above true center */}
                <View flex={1} />

                {/* Brand mark */}
                <View
                    width={72}
                    height={72}
                    borderRadius="$8"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    marginBottom="$6"
                >
                    <Text
                        fontFamily="$heading"
                        fontSize="$10"
                        color="$accentColor"
                        accessibilityLabel="YellowBook logo"
                    >
                        Y
                    </Text>
                </View>

                {/* Headline — center-aligned (allowed for onboarding) */}
                <Text
                    fontFamily="$heading"
                    fontSize="$11"
                    color="$color"
                    textAlign="center"
                    marginBottom="$2"
                >
                    YellowBook
                </Text>

                {/* Tagline */}
                <Text
                    fontFamily="$body"
                    fontSize="$6"
                    color="$colorSecondary"
                    textAlign="center"
                    lineHeight="$7"
                    marginBottom="$10"
                    paddingHorizontal="$4"
                >
                    A calm place to nurture the{"\n"}relationships that matter most.
                </Text>

                {/* Action area */}
                <YStack width="100%" gap="$3" maxWidth={360}>
                    {/* Primary CTA */}
                    <YStack
                        height="$12"
                        borderRadius="$5"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                        onPress={handleSignIn}
                        disabled={isLoading}
                        opacity={isLoading ? 0.5 : 1}
                        pressStyle={{
                            backgroundColor: "$accentBackgroundPress",
                            opacity: 0.95,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Sign in to YellowBook"
                        cursor="pointer"
                    >
                        {isExchanging ? (
                            <XStack alignItems="center" gap="$2">
                                <Spinner size="small" color="$accentColor" />
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    fontWeight="500"
                                    color="$accentColor"
                                >
                                    Signing you in...
                                </Text>
                            </XStack>
                        ) : (
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                fontWeight="500"
                                color="$accentColor"
                            >
                                Sign In
                            </Text>
                        )}
                    </YStack>

                    {/* Secondary CTA */}
                    <YStack
                        height="$11"
                        borderRadius="$5"
                        backgroundColor="transparent"
                        borderWidth={1.5}
                        borderColor="$borderColor"
                        justifyContent="center"
                        alignItems="center"
                        onPress={handleSignUp}
                        disabled={isLoading}
                        opacity={isLoading ? 0.5 : 1}
                        pressStyle={{
                            backgroundColor: "$backgroundPress",
                            borderColor: "$borderColorPress",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Create a new YellowBook account"
                        cursor="pointer"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            fontWeight="500"
                            color="$color"
                        >
                            Create Account
                        </Text>
                    </YStack>
                </YStack>

                {/* Bottom spacer — slightly larger than top for visual balance */}
                <View flex={1.4} />

                {/* Footer */}
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    color="$colorTertiary"
                    textAlign="center"
                    lineHeight="$2"
                >
                    By continuing, you agree to our Terms of{"\n"}Service and
                    Privacy Policy.
                </Text>
            </YStack>
        </SafeAreaView>
    );
}
