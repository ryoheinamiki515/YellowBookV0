import { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import {
    AccessibilityInfo,
    Alert,
    Animated,
    Easing,
    Platform,
} from "react-native";
import { useAuthRequest, makeRedirectUri, ResponseType } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../src/context/AuthContext";
import { View, Text, YStack, XStack, Spinner } from "tamagui";
import { PageContainer } from "../src/components/PageContainer";
import { SafeAreaView } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

const discovery = {
    authorizationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/authorize`,
    tokenEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/token`,
    revocationEndpoint: `https://${process.env.EXPO_PUBLIC_AUTH0_DOMAIN}/oauth/revoke`,
};

type IdTokenPayload = {
    name?: string;
    nickname?: string;
    given_name?: string;
};

function parseJwtPayload<T>(token: string | undefined): T | null {
    if (!token) return null;

    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;

    try {
        const normalized = encodedPayload
            .replace(/-/g, "+")
            .replace(/_/g, "/")
            .padEnd(Math.ceil(encodedPayload.length / 4) * 4, "=");

        return JSON.parse(Buffer.from(normalized, "base64").toString("utf-8")) as T;
    } catch {
        return null;
    }
}

function getProfileNameSuggestion(idToken: string | undefined): string | null {
    const payload = parseJwtPayload<IdTokenPayload>(idToken);
    if (!payload) return null;

    for (const candidate of [payload.name, payload.nickname, payload.given_name]) {
        const trimmed = candidate?.trim();
        if (trimmed) {
            return trimmed;
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Staggered entrance animation hook
// ---------------------------------------------------------------------------

function useReducedMotionPreference() {
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        let mounted = true;

        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((enabled) => {
                if (mounted) {
                    setReducedMotion(Boolean(enabled));
                }
            })
            .catch(() => {
                // Ignore unsupported platforms / implementations.
            });

        const subscription = AccessibilityInfo.addEventListener?.(
            "reduceMotionChanged",
            (enabled) => {
                setReducedMotion(Boolean(enabled));
            }
        );

        return () => {
            mounted = false;
            subscription?.remove?.();
        };
    }, []);

    return reducedMotion;
}

function useStaggeredEntrance(count: number, baseDelay = 80) {
    const reducedMotion = useReducedMotionPreference();
    const anims = useRef(
        Array.from({ length: count }, () => new Animated.Value(0))
    ).current;

    useEffect(() => {
        if (reducedMotion) {
            anims.forEach((a) => a.setValue(1));
            return;
        }

        const sequence = anims.map((anim, i) =>
            Animated.timing(anim, {
                toValue: 1,
                duration: 350,
                delay: i * baseDelay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: Platform.OS !== "web",
            })
        );

        Animated.stagger(baseDelay, sequence).start();
    }, [anims, baseDelay, reducedMotion]);

    return anims.map((anim) => ({
        opacity: anim,
        transform: [
            {
                translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                }),
            },
        ],
    }));
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LoginScreen() {
    const { signIn } = useAuth();
    const [isExchanging, setIsExchanging] = useState(false);
    const isWeb = Platform.OS === "web";

    const logoA11yProps: any = isWeb
        ? { "aria-label": "YellowBook logo" }
        : { accessibilityLabel: "YellowBook logo" };
    const signInA11yProps: any = isWeb
        ? { role: "button", "aria-label": "Sign in to YellowBook" }
        : {
              accessibilityRole: "button",
              accessibilityLabel: "Sign in to YellowBook",
          };
    const signUpA11yProps: any = isWeb
        ? { role: "button", "aria-label": "Create a new YellowBook account" }
        : {
              accessibilityRole: "button",
              accessibilityLabel: "Create a new YellowBook account",
          };

    // 5 animated groups: logo, headline, tagline, buttons, footer
    const entrance = useStaggeredEntrance(5);

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
                prompt: "login",
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
                await signIn({
                    accessToken: data.access_token,
                    profileNameSuggestion: getProfileNameSuggestion(data.id_token),
                });
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
        const authUrl = request?.url;
        if (!authUrl) return;

        const signupUrl = new URL(authUrl);
        signupUrl.searchParams.set("screen_hint", "signup");
        // Keep audience explicit in case the generated URL is reused across environments.
        signupUrl.searchParams.set(
            "audience",
            process.env.EXPO_PUBLIC_AUTH0_AUDIENCE!
        );

        promptAsync({ url: signupUrl.toString() });
    };

    const isLoading = isExchanging || !request;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer
                backgroundColor="$background"
                justifyContent="center"
                alignItems="center"
                paddingHorizontal="$6"
            >
                {/* Top spacer */}
                <View flex={1} />

                {/* Logo mark — embossed Moleskine feel with shadow */}
                <Animated.View style={entrance[0]}>
                    <View
                        width={80}
                        height={80}
                        borderRadius="$9"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                        marginBottom="$4"
                        // @ts-ignore – RN shadow props
                        shadowColor="#B8860B"
                        shadowOffset={{ width: 0, height: 6 }}
                        shadowOpacity={0.18}
                        shadowRadius={16}
                        style={{ elevation: 8 }}
                    >
                        <Text
                            fontFamily="$heading"
                            fontSize="$11"
                            color="$accentColor"
                            {...logoA11yProps}
                        >
                            Y
                        </Text>
                    </View>
                </Animated.View>

                {/* Headline */}
                <Animated.View style={entrance[1]}>
                    <Text
                        fontFamily="$heading"
                        fontSize="$12"
                        color="$color"
                        textAlign="center"
                        marginBottom="$1"
                    >
                        YellowBook
                    </Text>
                </Animated.View>

                {/* Tagline */}
                <Animated.View style={entrance[2]}>
                    <YStack alignItems="center" marginBottom="$10">
                        {/* Decorative golden divider */}
                        <View
                            width={40}
                            height={2}
                            borderRadius="$12"
                            backgroundColor="$accentBackground"
                            opacity={0.5}
                            marginBottom="$4"
                        />
                        <Text
                            fontFamily="$body"
                            fontSize="$7"
                            color="$colorSecondary"
                            textAlign="center"
                            lineHeight="$8"
                            paddingHorizontal="$2"
                        >
                            A calm place to nurture the{"\n"}relationships that
                            matter most.
                        </Text>
                    </YStack>
                </Animated.View>

                {/* Action area */}
                <Animated.View
                    style={[entrance[3], { width: "100%", maxWidth: 360 }]}
                >
                    <YStack gap="$3">
                        {/* Primary CTA — warm shadow for depth */}
                        <YStack
                            height="$13"
                            borderRadius="$6"
                            backgroundColor="$accentBackground"
                            justifyContent="center"
                            alignItems="center"
                            onPress={handleSignIn}
                            disabled={isLoading}
                            opacity={isLoading ? 0.5 : 1}
                            pressStyle={{
                                backgroundColor: "$accentBackgroundPress",
                                scale: 0.98,
                            }}
                            animation="fast"
                            {...signInA11yProps}
                            cursor="pointer"
                            // @ts-ignore
                            shadowColor="#B8860B"
                            shadowOffset={{ width: 0, height: 4 }}
                            shadowOpacity={0.15}
                            shadowRadius={12}
                            elevation={4}
                        >
                            {isExchanging ? (
                                <XStack alignItems="center" gap="$2">
                                    <Spinner
                                        size="small"
                                        color="$accentColor"
                                    />
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$5"
                                        fontWeight="600"
                                        color="$accentColor"
                                    >
                                        Signing you in...
                                    </Text>
                                </XStack>
                            ) : (
                                <Text
                                    fontFamily="$body"
                                    fontSize="$5"
                                    fontWeight="600"
                                    color="$accentColor"
                                >
                                    Sign In
                                </Text>
                            )}
                        </YStack>

                        {/* Secondary CTA */}
                        <YStack
                            height="$12"
                            borderRadius="$6"
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
                                scale: 0.98,
                            }}
                            animation="fast"
                            {...signUpA11yProps}
                            cursor="pointer"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$5"
                                fontWeight="500"
                                color="$color"
                            >
                                Create Account
                            </Text>
                        </YStack>
                    </YStack>
                </Animated.View>

                {/* Bottom spacer */}
                <View flex={1.4} />

                {/* Footer */}
                <Animated.View style={entrance[4]}>
                    <Text
                        fontFamily="$body"
                        fontSize="$2"
                        color="$colorTertiary"
                        textAlign="center"
                        lineHeight="$3"
                    >
                        By continuing, you agree to our Terms of{"\n"}Service
                        and Privacy Policy.
                    </Text>
                </Animated.View>
            </PageContainer>
        </SafeAreaView>
    );
}
