import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Modal,
    Platform,
    Pressable,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { YStack, XStack, Text, View, Input, Spinner } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";

import {
    useListPlans,
    useCreatePlan,
    usePatchPlan,
    getListPlansQueryKey,
} from "../src/api/generated/plans/plans";
import type { SocialPlan } from "../src/api/generated/model/socialPlan";
import type { SocialPlanState } from "../src/api/generated/model/socialPlanState";
import { useAuth } from "../src/context/AuthContext";
import {
    getInitialColor,
    useReducedMotionPreference,
} from "../src/lib/planHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

function getDaysDiff(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    const now = new Date();
    return Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDate(iso: string | null | undefined): string | null {
    const diffDays = getDaysDiff(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6)
        return `${Math.abs(diffDays)} days ago`;

    const date = new Date(iso!);
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function participantNames(plan: SocialPlan): string | null {
    const names = plan.participants
        .map((p) => p.displayName)
        .filter(Boolean) as string[];
    if (names.length === 0) return null;
    if (names.length === 1) return `with ${names[0]}`;
    if (names.length === 2) return `with ${names[0]} & ${names[1]}`;
    return `with ${names[0]} & ${names.length - 1} others`;
}

function planCountLabel(count: number, filterLabel: string): string {
    if (count === 0) return "";
    if (filterLabel === "Done") {
        return count === 1 ? "1 completed" : `${count} completed`;
    }
    if (filterLabel === "Open") {
        return count === 1 ? "1 open plan" : `${count} open plans`;
    }
    return count === 1 ? "1 plan" : `${count} plans`;
}

function blurPressTargetOnWeb(event: unknown) {
    if (Platform.OS !== "web") return;
    const target =
        (event as { currentTarget?: { blur?: () => void } } | null)
            ?.currentTarget ??
        (event as { target?: { blur?: () => void } } | null)?.target;
    target?.blur?.();
}

// ---------------------------------------------------------------------------
// Layer helpers: accent colors, time grouping
// ---------------------------------------------------------------------------

function getAccentColor(plan: SocialPlan): string {
    if (plan.state === "DONE" || plan.state === "DROPPED") return "transparent";
    const days = getDaysDiff(plan.anchorStart);
    if (days === null) return "#E2D9CC"; // fog/border — no date
    if (days <= 1) return "#F5C842";     // honey gold — today/tomorrow
    if (days <= 7) return "#D4956A";     // terracotta light — this week
    return "#E2D9CC";                    // fog — later
}

type TimeSection = "Coming Up" | "This Week" | "Later" | "Someday";
type SectionItem =
    | { type: "section-header"; title: TimeSection; key: string }
    | { type: "hero"; plan: SocialPlan; key: string }
    | { type: "card"; plan: SocialPlan; key: string };

function getTimeSection(plan: SocialPlan): TimeSection {
    const days = getDaysDiff(plan.anchorStart);
    if (days === null) return "Someday";
    if (days <= 1) return "Coming Up";
    if (days <= 7) return "This Week";
    return "Later";
}

function groupPlansByTime(plans: SocialPlan[], filterLabel: string): SectionItem[] {
    if (plans.length === 0) return [];

    // For Done/All filters, don't group — just show cards
    if (filterLabel !== "Open") {
        return plans.map((plan) => ({
            type: "card" as const,
            plan,
            key: plan.id,
        }));
    }

    // Find the hero plan: first OPEN plan (soonest upcoming, or most recently updated)
    const openPlans = plans.filter((p) => p.state === "OPEN");
    const heroCandidate = openPlans.length > 0 ? openPlans[0] : null;

    const sections: TimeSection[] = ["Coming Up", "This Week", "Later", "Someday"];
    const grouped = new Map<TimeSection, SocialPlan[]>();
    for (const s of sections) grouped.set(s, []);

    for (const plan of plans) {
        const section = getTimeSection(plan);
        grouped.get(section)!.push(plan);
    }

    // Count how many sections actually have plans — if only one, skip headers
    const populatedSections = sections.filter((s) => grouped.get(s)!.length > 0);
    const showHeaders = populatedSections.length > 1;

    const items: SectionItem[] = [];
    for (const section of sections) {
        const sectionPlans = grouped.get(section)!;
        if (sectionPlans.length === 0) continue;

        if (showHeaders) {
            items.push({
                type: "section-header",
                title: section,
                key: `header-${section}`,
            });
        }

        for (const plan of sectionPlans) {
            if (heroCandidate && plan.id === heroCandidate.id) {
                items.push({ type: "hero", plan, key: plan.id });
            } else {
                items.push({ type: "card", plan, key: plan.id });
            }
        }
    }

    return items;
}

// ---------------------------------------------------------------------------
// Avatar Stack — overlapping initial circles
// ---------------------------------------------------------------------------

function AvatarStack({ plan }: { plan: SocialPlan }) {
    const names = plan.participants
        .map((p) => p.displayName)
        .filter(Boolean) as string[];
    if (names.length === 0) return null;

    const displayed = names.slice(0, 4);

    return (
        <XStack alignItems="center" marginTop="$1">
            <XStack>
                {displayed.map((name, i) => (
                    <View
                        key={name + i}
                        width={28}
                        height={28}
                        borderRadius={14}
                        backgroundColor={getInitialColor(name)}
                        justifyContent="center"
                        alignItems="center"
                        borderWidth={2}
                        borderColor="$surface"
                        marginLeft={i === 0 ? 0 : -8}
                        zIndex={displayed.length - i}
                    >
                        <Text
                            fontFamily="$body"
                            fontSize={12}
                            fontWeight="600"
                            color="white"
                        >
                            {name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                ))}
            </XStack>
            {names.length > 4 && (
                <Text
                    fontFamily="$body"
                    fontSize="$1"
                    color="$colorSecondary"
                    marginLeft="$1.5"
                >
                    +{names.length - 4}
                </Text>
            )}
        </XStack>
    );
}

// ---------------------------------------------------------------------------
// Section Header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
    return (
        <Text
            fontFamily="$body"
            fontSize={11}
            fontWeight="600"
            color="$colorTertiary"
            letterSpacing={1.2}
            textTransform="uppercase"
            marginTop="$4"
            marginBottom="$2"
        >
            {title}
        </Text>
    );
}

// ---------------------------------------------------------------------------
// State filter chips
// ---------------------------------------------------------------------------

const STATE_FILTERS: { label: string; value: SocialPlanState[] }[] = [
    { label: "All", value: ["OPEN", "DONE", "DROPPED"] },
    { label: "Open", value: ["OPEN"] },
    { label: "Done", value: ["DONE"] },
];

// ---------------------------------------------------------------------------
// Hero Card — spotlight treatment for first open plan
// ---------------------------------------------------------------------------

function HeroCard({
    plan,
    onMarkDone,
    onPress,
    isUpdating,
    reducedMotion,
}: {
    plan: SocialPlan;
    onMarkDone: (plan: SocialPlan) => void;
    onPress: (plan: SocialPlan) => void;
    isUpdating: boolean;
    reducedMotion: boolean;
}) {
    const when = formatRelativeDate(plan.anchorStart);
    const accentColor = getAccentColor(plan);
    const useNativeDriver = Platform.OS !== "web";

    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(new Animated.Value(reducedMotion ? 0 : 20)).current;

    useEffect(() => {
        if (reducedMotion) return;
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    // Mark-done success flash
    const flashAnim = useRef(new Animated.Value(0)).current;
    const prevStateRef = useRef(plan.state);
    useEffect(() => {
        if (prevStateRef.current === "OPEN" && plan.state === "DONE") {
            Animated.sequence([
                Animated.timing(flashAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: false,
                }),
                Animated.timing(flashAnim, {
                    toValue: 0,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                }),
            ]).start();
        }
        prevStateRef.current = plan.state;
    }, [plan.state]);

    const flashBg = flashAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["rgba(125,174,120,0)", "rgba(125,174,120,0.12)"],
    });

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                marginBottom: 16,
            }}
        >
            <Animated.View style={{ backgroundColor: flashBg, borderRadius: 16 }}>
                <YStack
                    backgroundColor="$surface"
                    borderRadius="$8"
                    padding="$5"
                    borderWidth={1}
                    borderColor="$borderColorSubtle"
                    overflow="hidden"
                    onPress={(event) => {
                        blurPressTargetOnWeb(event);
                        onPress(plan);
                    }}
                    pressStyle={{ scale: 0.985, backgroundColor: "$surfaceHover" }}
                    // @ts-ignore - web-only CSS property
                    style={
                        Platform.OS === "web"
                            ? { WebkitTapHighlightColor: "transparent" }
                            : undefined
                    }
                    focusStyle={{
                        borderColor: "$borderColorSubtle",
                        outlineWidth: 0,
                        outlineColor: "transparent",
                    }}
                    focusVisibleStyle={{
                        borderColor: "$borderColorFocus",
                        borderWidth: 2,
                        outlineWidth: 0,
                        outlineColor: "transparent",
                    }}
                    // @ts-ignore – Tamagui animation prop
                    animation="fast"
                    // @ts-ignore
                    shadowColor="rgba(42,36,32,0.10)"
                    shadowOffset={{ width: 0, height: 4 }}
                    shadowOpacity={1}
                    shadowRadius={16}
                    elevation={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Plan: ${plan.intentText}`}
                >
                    {/* Left accent bar */}
                    <View
                        position="absolute"
                        top={0}
                        left={0}
                        bottom={0}
                        width={4}
                        backgroundColor={accentColor}
                        borderTopLeftRadius={16}
                        borderBottomLeftRadius={16}
                    />

                    {/* Top row: intent + time badge */}
                    <XStack
                        justifyContent="space-between"
                        alignItems="flex-start"
                        gap="$3"
                    >
                        <Text
                            fontFamily="$heading"
                            fontSize="$8"
                            color="$color"
                            flex={1}
                        >
                            {plan.intentText}
                        </Text>

                        {when && (
                            <View
                                backgroundColor="$backgroundStrong"
                                paddingHorizontal="$2"
                                paddingVertical="$0.5"
                                borderRadius="$4"
                                flexShrink={0}
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$1"
                                    fontWeight="500"
                                    color="$colorSecondary"
                                >
                                    {when}
                                </Text>
                            </View>
                        )}
                    </XStack>

                    {/* Avatar stack */}
                    <AvatarStack plan={plan} />

                    {/* Location */}
                    {plan.locationText && (
                        <Text
                            fontFamily="$body"
                            fontSize="$2"
                            color="$colorTertiary"
                            marginTop="$1"
                        >
                            {plan.locationText}
                        </Text>
                    )}

                    {/* Context note — no truncation for hero */}
                    {plan.contextNote && (
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$colorTertiary"
                            lineHeight="$3"
                            marginTop="$2"
                        >
                            {plan.contextNote}
                        </Text>
                    )}

                    {/* Bottom row */}
                    <XStack
                        justifyContent="flex-end"
                        alignItems="center"
                        marginTop="$3"
                    >
                        <YStack
                            paddingHorizontal="$3"
                            paddingVertical="$1.5"
                            borderRadius="$5"
                            backgroundColor="$successBackground"
                            onPress={() => onMarkDone(plan)}
                            disabled={isUpdating}
                            opacity={isUpdating ? 0.5 : 1}
                            pressStyle={{
                                scale: 0.95,
                                backgroundColor: "$successColor",
                            }}
                            // @ts-ignore
                            animation="fast"
                            accessibilityRole="button"
                            accessibilityLabel={`Mark "${plan.intentText}" as done`}
                            cursor="pointer"
                            minHeight={36}
                            justifyContent="center"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$3"
                                fontWeight="500"
                                color="$successColor"
                            >
                                {isUpdating ? "Saving..." : "Mark Done"}
                            </Text>
                        </YStack>
                    </XStack>
                </YStack>
            </Animated.View>
        </Animated.View>
    );
}

// ---------------------------------------------------------------------------
// Compact Card — denser card for non-hero plans
// ---------------------------------------------------------------------------

function CompactCard({
    plan,
    onMarkDone,
    onPress,
    isUpdating,
    index,
    reducedMotion,
}: {
    plan: SocialPlan;
    onMarkDone: (plan: SocialPlan) => void;
    onPress: (plan: SocialPlan) => void;
    isUpdating: boolean;
    index: number;
    reducedMotion: boolean;
}) {
    const when = formatRelativeDate(plan.anchorStart);
    const isDone = plan.state === "DONE";
    const isDropped = plan.state === "DROPPED";
    const isOpen = plan.state === "OPEN";
    const isInactive = isDone || isDropped;
    const accentColor = getAccentColor(plan);
    const useNativeDriver = Platform.OS !== "web";

    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(
        new Animated.Value(reducedMotion ? 0 : 16)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;
        const delay = Math.min(index * 50, 250);
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 280,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 280,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    // Mark-done success flash
    const flashAnim = useRef(new Animated.Value(0)).current;
    const prevStateRef = useRef(plan.state);
    useEffect(() => {
        if (prevStateRef.current === "OPEN" && plan.state === "DONE") {
            Animated.sequence([
                Animated.timing(flashAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: false,
                }),
                Animated.timing(flashAnim, {
                    toValue: 0,
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: false,
                }),
            ]).start();
        }
        prevStateRef.current = plan.state;
    }, [plan.state]);

    const flashBg = flashAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["rgba(125,174,120,0)", "rgba(125,174,120,0.12)"],
    });

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                marginBottom: 10,
            }}
        >
            <Animated.View style={{ backgroundColor: flashBg, borderRadius: 14 }}>
                <YStack
                    backgroundColor="$surface"
                    borderRadius="$7"
                    paddingVertical="$3"
                    paddingLeft={isInactive ? "$4" : "$4"}
                    paddingRight="$3.5"
                    borderWidth={1}
                    borderColor="$borderColorSubtle"
                    opacity={isInactive ? 0.65 : 1}
                    overflow="hidden"
                    onPress={(event) => {
                        blurPressTargetOnWeb(event);
                        onPress(plan);
                    }}
                    pressStyle={{ scale: 0.985, backgroundColor: "$surfaceHover" }}
                    // @ts-ignore - web-only CSS property
                    style={
                        Platform.OS === "web"
                            ? { WebkitTapHighlightColor: "transparent" }
                            : undefined
                    }
                    focusStyle={{
                        borderColor: "$borderColorSubtle",
                        outlineWidth: 0,
                        outlineColor: "transparent",
                    }}
                    focusVisibleStyle={{
                        borderColor: "$borderColorFocus",
                        borderWidth: 2,
                        outlineWidth: 0,
                        outlineColor: "transparent",
                    }}
                    // @ts-ignore
                    animation="fast"
                    // @ts-ignore
                    shadowColor="rgba(42,36,32,0.05)"
                    shadowOffset={{ width: 0, height: 1 }}
                    shadowOpacity={1}
                    shadowRadius={6}
                    elevation={1}
                    accessibilityRole="button"
                    accessibilityLabel={`Plan: ${plan.intentText}`}
                >
                    {/* Left accent bar — only for active plans */}
                    {!isInactive && (
                        <View
                            position="absolute"
                            top={0}
                            left={0}
                            bottom={0}
                            width={4}
                            backgroundColor={accentColor}
                            borderTopLeftRadius={14}
                            borderBottomLeftRadius={14}
                        />
                    )}

                    <XStack
                        justifyContent="space-between"
                        alignItems="center"
                        gap="$2"
                    >
                        <YStack flex={1} gap="$0.5">
                            <XStack alignItems="center" gap="$2">
                                <Text
                                    fontFamily="$heading"
                                    fontSize="$6"
                                    color="$color"
                                    numberOfLines={1}
                                    flex={1}
                                >
                                    {plan.intentText}
                                </Text>
                                {when && (
                                    <View
                                        backgroundColor="$backgroundStrong"
                                        paddingHorizontal="$1.5"
                                        paddingVertical={2}
                                        borderRadius="$3"
                                        flexShrink={0}
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize={10}
                                            fontWeight="500"
                                            color="$colorSecondary"
                                        >
                                            {when}
                                        </Text>
                                    </View>
                                )}
                            </XStack>

                            {/* Compact metadata: avatars inline */}
                            <XStack alignItems="center" gap="$2">
                                <AvatarStack plan={plan} />
                                {plan.locationText && (
                                    <Text
                                        fontFamily="$body"
                                        fontSize={11}
                                        color="$colorTertiary"
                                        numberOfLines={1}
                                        flex={1}
                                    >
                                        {plan.locationText}
                                    </Text>
                                )}
                            </XStack>
                        </YStack>

                        {/* Right side: action button or status label */}
                        {isOpen ? (
                            <YStack
                                paddingHorizontal="$3"
                                paddingVertical="$1.5"
                                borderRadius="$5"
                                backgroundColor="$successBackground"
                                onPress={() => onMarkDone(plan)}
                                disabled={isUpdating}
                                opacity={isUpdating ? 0.5 : 1}
                                pressStyle={{
                                    scale: 0.95,
                                    backgroundColor: "$successColor",
                                }}
                                // @ts-ignore
                                animation="fast"
                                accessibilityRole="button"
                                accessibilityLabel={`Mark "${plan.intentText}" as done`}
                                cursor="pointer"
                                minHeight={36}
                                justifyContent="center"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    fontWeight="600"
                                    color="$successColor"
                                >
                                    {isUpdating ? "..." : "✓ Mark Done"}
                                </Text>
                            </YStack>
                        ) : (
                            <XStack alignItems="center" gap="$1">
                                <Text
                                    fontFamily="$body"
                                    fontSize={12}
                                    color="$colorTertiary"
                                >
                                    {isDone ? "✓" : "—"}
                                </Text>
                                <Text
                                    fontFamily="$body"
                                    fontSize={11}
                                    color="$colorTertiary"
                                >
                                    {isDone ? "Completed" : "Dropped"}
                                </Text>
                            </XStack>
                        )}
                    </XStack>
                </YStack>
            </Animated.View>
        </Animated.View>
    );
}

// ---------------------------------------------------------------------------
// Skeleton loading cards — multi-shape
// ---------------------------------------------------------------------------

function SkeletonCards() {
    const pulseAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.8,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.4,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
            ])
        ).start();
    }, []);

    const skeletonColor = "#EDE7DC";

    return (
        <YStack flex={1} paddingHorizontal="$6" paddingTop="$4" gap="$3">
            {/* Hero skeleton */}
            <Animated.View
                style={{
                    opacity: pulseAnim,
                    borderRadius: 16,
                    backgroundColor: skeletonColor,
                    padding: 20,
                    height: 140,
                }}
            >
                <View width="75%" height={18} borderRadius={9} backgroundColor="#E2D9CC" />
                <View width="50%" height={14} borderRadius={7} backgroundColor="#E2D9CC" marginTop={12} />
                <XStack marginTop={14} gap={-8}>
                    {[0, 1, 2].map((i) => (
                        <View
                            key={i}
                            width={28}
                            height={28}
                            borderRadius={14}
                            backgroundColor="#E2D9CC"
                            borderWidth={2}
                            borderColor={skeletonColor}
                        />
                    ))}
                </XStack>
                <View width="30%" height={10} borderRadius={5} backgroundColor="#E2D9CC" marginTop={12} />
            </Animated.View>

            {/* Compact skeletons */}
            {[72, 68].map((height, i) => (
                <Animated.View
                    key={i}
                    style={{
                        opacity: pulseAnim,
                        height,
                        borderRadius: 14,
                        backgroundColor: skeletonColor,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                    }}
                >
                    <View flex={1}>
                        <View width="60%" height={14} borderRadius={7} backgroundColor="#E2D9CC" />
                        <XStack marginTop={10} gap={-8}>
                            {[0, 1].map((j) => (
                                <View
                                    key={j}
                                    width={24}
                                    height={24}
                                    borderRadius={12}
                                    backgroundColor="#E2D9CC"
                                    borderWidth={2}
                                    borderColor={skeletonColor}
                                />
                            ))}
                        </XStack>
                    </View>
                    <View width={48} height={28} borderRadius={14} backgroundColor="#E2D9CC" />
                </Animated.View>
            ))}
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// Empty state — breathing animation on decorative circles
// ---------------------------------------------------------------------------

function EmptyState({
    filterLabel,
    onAddPlan,
    reducedMotion,
}: {
    filterLabel: string;
    onAddPlan: () => void;
    reducedMotion: boolean;
}) {
    const isDoneFilter = filterLabel === "Done";
    const breatheAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (reducedMotion) return;
        Animated.loop(
            Animated.sequence([
                Animated.timing(breatheAnim, {
                    toValue: 1.08,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
                Animated.timing(breatheAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
            ])
        ).start();
    }, [reducedMotion]);

    return (
        <YStack
            flex={1}
            justifyContent="center"
            alignItems="center"
            paddingHorizontal="$8"
        >
            {/* Decorative element — layered circles with breathing */}
            <Animated.View
                style={{
                    marginBottom: 24,
                    width: 80,
                    height: 80,
                    transform: [{ scale: breatheAnim }],
                }}
            >
                <View position="relative" width={80} height={80}>
                    <View
                        position="absolute"
                        top={0}
                        left={8}
                        width={64}
                        height={64}
                        borderRadius={32}
                        backgroundColor="$accentBackground"
                        opacity={0.15}
                    />
                    <View
                        position="absolute"
                        bottom={0}
                        right={8}
                        width={52}
                        height={52}
                        borderRadius={26}
                        backgroundColor="$accentBackground"
                        opacity={0.25}
                    />
                    <View
                        position="absolute"
                        top={16}
                        right={0}
                        width={36}
                        height={36}
                        borderRadius={18}
                        backgroundColor="$accentBackground"
                        opacity={0.4}
                    />
                </View>
            </Animated.View>

            <Text
                fontFamily="$heading"
                fontSize="$8"
                color="$color"
                textAlign="center"
                marginBottom="$2"
            >
                {isDoneFilter
                    ? "Nothing here yet"
                    : "What are you looking forward to?"}
            </Text>

            <Text
                fontFamily="$body"
                fontSize="$5"
                color="$colorSecondary"
                textAlign="center"
                lineHeight="$6"
                marginBottom="$6"
            >
                {isDoneFilter
                    ? "Plans you complete will show up here."
                    : "Jot down a plan with a friend — lunch,\na walk, a call. Keep it simple."}
            </Text>

            {!isDoneFilter && (
                <YStack
                    height="$11"
                    paddingHorizontal="$6"
                    borderRadius="$6"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    onPress={onAddPlan}
                    pressStyle={{
                        scale: 0.97,
                        backgroundColor: "$accentBackgroundPress",
                    }}
                    // @ts-ignore
                    animation="fast"
                    accessibilityRole="button"
                    accessibilityLabel="Add your first plan"
                    cursor="pointer"
                    // @ts-ignore
                    shadowColor="#B8860B"
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={8}
                    elevation={3}
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        fontWeight="600"
                        color="$accentColor"
                    >
                        Add Your First Plan
                    </Text>
                </YStack>
            )}
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// Create plan bottom sheet
// ---------------------------------------------------------------------------

function CreatePlanSheet({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [intentText, setIntentText] = useState("");
    const createPlan = useCreatePlan();

    const handleCreate = useCallback(() => {
        const trimmed = intentText.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        createPlan.mutate(
            { data: { intentText: trimmed } },
            {
                onSuccess: () => {
                    setIntentText("");
                    onOpenChange(false);
                    onCreated();
                },
                onError: () => {
                    Alert.alert(
                        "Couldn't save that",
                        "Something went wrong — try again?"
                    );
                },
            }
        );
    }, [intentText, createPlan, onOpenChange, onCreated]);

    return (
        <Modal
            visible={open}
            transparent
            animationType="slide"
            onRequestClose={() => onOpenChange(false)}
        >
            {/* Overlay */}
            <Pressable
                style={{ flex: 1, backgroundColor: "rgba(42,36,32,0.35)" }}
                onPress={() => {
                    Keyboard.dismiss();
                    onOpenChange(false);
                }}
            />

            {/* Sheet frame */}
            <YStack
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                backgroundColor="$surface"
                borderTopLeftRadius="$8"
                borderTopRightRadius="$8"
                padding="$6"
                paddingBottom="$11"
                // @ts-ignore
                shadowColor="rgba(0,0,0,0.15)"
                shadowOffset={{ width: 0, height: -4 }}
                shadowOpacity={1}
                shadowRadius={20}
                elevation={12}
            >
                {/* Drag handle */}
                <XStack justifyContent="center" marginBottom="$4">
                    <View
                        width={36}
                        height={4}
                        borderRadius="$12"
                        backgroundColor="$borderColor"
                    />
                </XStack>

                <Text
                    fontFamily="$heading"
                    fontSize="$8"
                    color="$color"
                    marginBottom="$1"
                >
                    New plan
                </Text>
                <Text
                    fontFamily="$body"
                    fontSize="$3"
                    color="$colorTertiary"
                    marginBottom="$4"
                >
                    What would you like to do with someone?
                </Text>

                <Input
                    fontFamily="$body"
                    fontSize="$6"
                    color="$color"
                    backgroundColor="$inputBackground"
                    borderColor="$borderColor"
                    borderWidth={1}
                    borderRadius="$5"
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    placeholder="Lunch with Sam, gym Monday, call Dad..."
                    placeholderTextColor="$placeholderColor"
                    value={intentText}
                    onChangeText={setIntentText}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                    focusStyle={{
                        borderColor: "$borderColorFocus",
                        borderWidth: 2,
                    }}
                    accessibilityLabel="What's the plan?"
                />

                {/* Save button */}
                <YStack
                    height="$12"
                    borderRadius="$6"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    marginTop="$4"
                    onPress={handleCreate}
                    disabled={!intentText.trim() || createPlan.isPending}
                    opacity={
                        !intentText.trim() || createPlan.isPending ? 0.45 : 1
                    }
                    pressStyle={{
                        scale: 0.98,
                        backgroundColor: "$accentBackgroundPress",
                    }}
                    // @ts-ignore
                    animation="fast"
                    accessibilityRole="button"
                    accessibilityLabel="Save plan"
                    cursor="pointer"
                    // @ts-ignore
                    shadowColor="#B8860B"
                    shadowOffset={{ width: 0, height: 3 }}
                    shadowOpacity={0.12}
                    shadowRadius={8}
                    elevation={3}
                >
                    {createPlan.isPending ? (
                        <XStack alignItems="center" gap="$2">
                            <Spinner size="small" color="$accentColor" />
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                fontWeight="600"
                                color="$accentColor"
                            >
                                Saving...
                            </Text>
                        </XStack>
                    ) : (
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            fontWeight="600"
                            color="$accentColor"
                        >
                            Save Plan
                        </Text>
                    )}
                </YStack>
            </YStack>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PlansScreen() {
    const { signOut } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const [activeFilter, setActiveFilter] = useState(1); // Default to "Open"
    const [sheetOpen, setSheetOpen] = useState(false);
    const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);

    const {
        data: plansResponse,
        isLoading,
        isError,
        refetch,
    } = useListPlans({
        state: STATE_FILTERS[activeFilter].value,
        sort: "-updatedAt",
    });

    const patchPlan = usePatchPlan();

    const responseData = plansResponse?.data;
    const plans: SocialPlan[] =
        responseData && "data" in responseData
            ? (responseData as { data: SocialPlan[] }).data
            : [];

    // Group plans into section items
    const sectionItems = useMemo(
        () => groupPlansByTime(plans, STATE_FILTERS[activeFilter].label),
        [plans, activeFilter]
    );

    // Scroll-based header compression
    const scrollY = useRef(new Animated.Value(0)).current;
    const greetingOpacity = scrollY.interpolate({
        inputRange: [0, 50],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });
    const headerScale = scrollY.interpolate({
        inputRange: [0, 80],
        outputRange: [1, 0.92],
        extrapolate: "clamp",
    });
    const headerTranslateY = scrollY.interpolate({
        inputRange: [0, 80],
        outputRange: [0, -6],
        extrapolate: "clamp",
    });

    // Header entrance animation
    const headerFade = useRef(
        new Animated.Value(reducedMotion ? 1 : 0)
    ).current;
    const headerSlide = useRef(
        new Animated.Value(reducedMotion ? 0 : -12)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;
        Animated.parallel([
            Animated.timing(headerFade, {
                toValue: 1,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(headerSlide, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    const handleRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

    const handleCreated = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
    }, [queryClient]);

    const handleMarkDone = useCallback(
        (plan: SocialPlan) => {
            setUpdatingPlanId(plan.id);
            patchPlan.mutate(
                { planId: plan.id, data: { state: "DONE" } },
                {
                    onSettled: () => {
                        setUpdatingPlanId(null);
                        queryClient.invalidateQueries({
                            queryKey: getListPlansQueryKey(),
                        });
                    },
                }
            );
        },
        [patchPlan, queryClient]
    );

    const handleSignOut = useCallback(() => {
        Alert.alert("Sign out?", "You can always sign back in.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Out", style: "destructive", onPress: signOut },
        ]);
    }, [signOut]);

    const handlePlanPress = useCallback(
        (plan: SocialPlan) => {
            router.push(`/plan/${plan.id}`);
        },
        [router]
    );

    // Track card index for staggered animations (excluding section headers)
    const cardIndexRef = useRef(0);

    const renderSectionItem = useCallback(
        ({ item }: { item: SectionItem }) => {
            if (item.type === "section-header") {
                cardIndexRef.current = 0;
                return <SectionHeader title={item.title} />;
            }

            if (item.type === "hero") {
                return (
                    <HeroCard
                        plan={item.plan}
                        onMarkDone={handleMarkDone}
                        onPress={handlePlanPress}
                        isUpdating={updatingPlanId === item.plan.id}
                        reducedMotion={reducedMotion}
                    />
                );
            }

            const idx = cardIndexRef.current++;
            return (
                <CompactCard
                    plan={item.plan}
                    onMarkDone={handleMarkDone}
                    onPress={handlePlanPress}
                    isUpdating={updatingPlanId === item.plan.id}
                    index={idx}
                    reducedMotion={reducedMotion}
                />
            );
        },
        [handleMarkDone, handlePlanPress, updatingPlanId, reducedMotion]
    );

    const keyExtractor = useCallback((item: SectionItem) => item.key, []);

    const countLabel = planCountLabel(
        plans.length,
        STATE_FILTERS[activeFilter].label
    );

    const onScroll = useMemo(
        () =>
            Animated.event(
                [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                { useNativeDriver }
            ),
        [scrollY, useNativeDriver]
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack flex={1} backgroundColor="$background">
                {/* ---- Header ---- */}
                <Animated.View
                    style={{
                        opacity: headerFade,
                        transform: [
                            { translateY: headerSlide },
                            { translateY: headerTranslateY },
                            { scale: headerScale },
                        ],
                        zIndex: 1,
                    }}
                >
                    <YStack paddingHorizontal="$6" paddingTop="$4" paddingBottom="$1">
                        <XStack
                            justifyContent="space-between"
                            alignItems="flex-start"
                        >
                            <YStack flex={1}>
                                <Animated.View style={{ opacity: greetingOpacity }}>
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$colorTertiary"
                                        marginBottom="$0.5"
                                    >
                                        {getGreeting()}
                                    </Text>
                                </Animated.View>
                                <Text
                                    fontFamily="$heading"
                                    fontSize="$9"
                                    color="$color"
                                >
                                    Your Plans
                                </Text>
                            </YStack>

                            <View
                                width={36}
                                height={36}
                                borderRadius={18}
                                backgroundColor="$colorTertiary"
                                justifyContent="center"
                                alignItems="center"
                                onPress={handleSignOut}
                                pressStyle={{ opacity: 0.7, scale: 0.95 }}
                                accessibilityRole="button"
                                accessibilityLabel="Account menu"
                                cursor="pointer"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize={14}
                                    fontWeight="600"
                                    color="white"
                                >
                                    Y
                                </Text>
                            </View>
                        </XStack>

                        {/* Plan count subtitle */}
                        {!isLoading && countLabel ? (
                            <Animated.View style={{ opacity: greetingOpacity }}>
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    color="$colorTertiary"
                                    marginTop="$1"
                                >
                                    {countLabel}
                                </Text>
                            </Animated.View>
                        ) : null}
                    </YStack>

                    {/* ---- Segmented filter control ---- */}
                    <XStack
                        paddingHorizontal="$6"
                        paddingTop="$2"
                        paddingBottom="$3"
                    >
                        <XStack
                            backgroundColor="$backgroundStrong"
                            borderRadius="$12"
                            padding={2}
                        >
                            {STATE_FILTERS.map((filter, i) => {
                                const isActive = i === activeFilter;
                                return (
                                    <YStack
                                        key={filter.label}
                                        paddingHorizontal="$4"
                                        paddingVertical="$1.5"
                                        borderRadius="$12"
                                        backgroundColor={
                                            isActive
                                                ? "$accentBackground"
                                                : "transparent"
                                        }
                                        onPress={() => setActiveFilter(i)}
                                        pressStyle={{
                                            scale: 0.95,
                                            opacity: 0.8,
                                        }}
                                        // @ts-ignore
                                        animation="fast"
                                        accessibilityRole="button"
                                        accessibilityLabel={`Filter by ${filter.label}`}
                                        accessibilityState={{ selected: isActive }}
                                        cursor="pointer"
                                        minHeight={32}
                                        justifyContent="center"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$3"
                                            fontWeight={isActive ? "600" : "500"}
                                            color={
                                                isActive
                                                    ? "$accentColor"
                                                    : "$colorSecondary"
                                            }
                                        >
                                            {filter.label}
                                        </Text>
                                    </YStack>
                                );
                            })}
                        </XStack>
                    </XStack>
                </Animated.View>

                {/* Subtle divider line */}
                <View
                    height={1}
                    backgroundColor="$borderColorSubtle"
                    marginHorizontal="$6"
                />

                {/* ---- Content ---- */}
                {isLoading ? (
                    <SkeletonCards />
                ) : isError ? (
                    <YStack
                        flex={1}
                        justifyContent="center"
                        alignItems="center"
                        paddingHorizontal="$6"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$6"
                            color="$colorSecondary"
                            textAlign="center"
                            lineHeight="$7"
                        >
                            Something went wrong.{"\n"}Pull down to try again.
                        </Text>
                    </YStack>
                ) : plans.length === 0 ? (
                    <EmptyState
                        filterLabel={STATE_FILTERS[activeFilter].label}
                        onAddPlan={() => setSheetOpen(true)}
                        reducedMotion={reducedMotion}
                    />
                ) : (
                    <Animated.FlatList
                        data={sectionItems}
                        renderItem={renderSectionItem}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={{
                            paddingHorizontal: 24,
                            paddingTop: 12,
                            paddingBottom: 16,
                        }}
                        showsVerticalScrollIndicator={false}
                        onRefresh={handleRefresh}
                        refreshing={false}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                    />
                )}

                {/* ---- Bottom bar: New Plan CTA ---- */}
                <YStack
                    paddingHorizontal="$6"
                    paddingTop="$3"
                    paddingBottom="$2"
                    backgroundColor="$background"
                    borderTopWidth={1}
                    borderTopColor="$borderColorSubtle"
                >
                    <YStack
                        height={48}
                        borderRadius="$6"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                        onPress={() => setSheetOpen(true)}
                        pressStyle={{
                            scale: 0.98,
                            backgroundColor: "$accentBackgroundPress",
                        }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel="Add a new plan"
                        cursor="pointer"
                        // @ts-ignore
                        shadowColor="#B8860B"
                        shadowOffset={{ width: 0, height: 3 }}
                        shadowOpacity={0.12}
                        shadowRadius={8}
                        elevation={3}
                    >
                        <XStack alignItems="center" gap="$1.5">
                            <Text
                                fontFamily="$heading"
                                fontSize="$7"
                                color="$accentColor"
                                marginTop={-1}
                            >
                                +
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                fontWeight="600"
                                color="$accentColor"
                            >
                                New Plan
                            </Text>
                        </XStack>
                    </YStack>
                </YStack>

                {/* ---- Create sheet ---- */}
                <CreatePlanSheet
                    open={sheetOpen}
                    onOpenChange={setSheetOpen}
                    onCreated={handleCreated}
                />
            </YStack>
        </SafeAreaView>
    );
}
