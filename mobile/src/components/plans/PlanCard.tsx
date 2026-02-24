import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Text, View, XStack, YStack } from "tamagui";

import type { SocialPlan } from "../../api/generated/model/socialPlan";
import {
    getAttentionReason,
    getDaysDiff,
    type PlanAttentionReason,
} from "../../lib/planListDerivations";
import { getInitialColor } from "../../lib/planHelpers";
import {
    PlanQuickActionRow,
    type PlanQuickActionRowAction,
} from "./PlanQuickActionRow";

function formatRelativeDate(iso: string | null | undefined): string | null {
    const diffDays = getDaysDiff(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6) {
        return `${Math.abs(diffDays)} days ago`;
    }

    const date = new Date(iso!);
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function formatWhenBadge(plan: SocialPlan): string | null {
    if (plan.timePrecision === "NONE") return "Whenever";
    if (plan.timePrecision === "UNSPECIFIED" || !plan.anchorStart) return null;

    const start = formatRelativeDate(plan.anchorStart);
    if (!start) return null;

    if (plan.timePrecision === "EXACT") {
        const date = new Date(plan.anchorStart);
        const timeStr = date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
        });
        return `${start}, ${timeStr}`;
    }

    if (plan.anchorEnd) {
        const endDate = new Date(plan.anchorEnd);
        const startDate = new Date(plan.anchorStart);
        if (
            startDate.getFullYear() === endDate.getFullYear() &&
            startDate.getMonth() === endDate.getMonth() &&
            startDate.getDate() === endDate.getDate()
        ) {
            return start;
        }

        const endStr = endDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
        });
        return `${start} — ${endStr}`;
    }

    return start;
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

function notePreview(text: string | null | undefined, maxChars = 48): string | null {
    const normalized = text?.replace(/\s+/g, " ").trim();
    if (!normalized) return null;
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
}

function planSubtitleText(
    plan: SocialPlan,
    options?: { allowNoteFallback?: boolean }
): string {
    const allowNoteFallback = options?.allowNoteFallback ?? true;
    const people = participantNames(plan);
    const location = plan.locationText?.trim();
    const note = notePreview(plan.contextNote);

    if (people && location) return `${people} • at ${location}`;
    if (people) return people;
    if (location) return `at ${location}`;
    if (allowNoteFallback && note) return `Note: ${note}`;
    return "No people or place yet";
}

function formatRelativePastLabel(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const diffDays = getDaysDiff(iso);
    if (diffDays === null) return null;

    if (diffDays === 0) return "today";
    if (diffDays === -1) return "yesterday";
    if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)}d ago`;

    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

function planLifecycleText(plan: SocialPlan): string | null {
    const relative = formatRelativePastLabel(plan.updatedAt);
    const relativeLabel = relative ?? "recently";

    if (plan.state === "DONE") return `Completed ${relativeLabel}`;
    if (plan.state === "DROPPED") return `Dropped ${relativeLabel}`;

    const createdAt = new Date(plan.createdAt).getTime();
    const updatedAt = new Date(plan.updatedAt).getTime();
    const justCreated =
        !isNaN(createdAt) &&
        !isNaN(updatedAt) &&
        Math.abs(updatedAt - createdAt) < 60 * 1000;

    if (getDaysDiff(plan.updatedAt) === 0) return null;

    return `${justCreated ? "Added" : "Updated"} ${relativeLabel}`;
}

type PillTone = "neutral" | "success" | "warning" | "muted";

type PlanSignal = {
    label: string;
    tone: PillTone;
};

function getPlanSignal(
    plan: SocialPlan,
    attentionReason?: PlanAttentionReason | null
): PlanSignal | null {
    if (plan.state !== "OPEN") return null;

    const reason = attentionReason ?? getAttentionReason(plan);
    if (reason) {
        switch (reason) {
            case "missing-people-and-date":
                return { label: "Needs people + date", tone: "warning" };
            case "missing-people":
                return { label: "Needs people", tone: "warning" };
            case "missing-date":
                return { label: "Needs date", tone: "warning" };
            case "past-due":
                return { label: "Past due", tone: "warning" };
            case "stale-open":
                return { label: "Drifting", tone: "muted" };
            default:
                break;
        }
    }
    return null;
}

function InfoPill({
    label,
    tone = "neutral",
    compact = false,
}: {
    label: string;
    tone?: PillTone;
    compact?: boolean;
}) {
    const toneStyles: Record<PillTone, { backgroundColor: string; color: string }> = {
        neutral: { backgroundColor: "#F0ECE4", color: "#6E6258" },
        muted: { backgroundColor: "#F5F2EC", color: "#8D8176" },
        success: { backgroundColor: "rgba(125,174,120,0.14)", color: "#4E7A4A" },
        warning: { backgroundColor: "rgba(212,149,106,0.16)", color: "#8E5532" },
    };
    const styles = toneStyles[tone];

    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            paddingHorizontal={compact ? "$1.5" : "$2"}
            paddingVertical={compact ? 2 : 4}
            borderRadius={compact ? "$3" : "$4"}
            backgroundColor={styles.backgroundColor}
        >
            <Text
                fontFamily="$body"
                fontSize={compact ? 10 : 11}
                fontWeight="600"
                color={styles.color}
            >
                {label}
            </Text>
        </XStack>
    );
}

function WhenBadge({ label, compact = false }: { label: string; compact?: boolean }) {
    return (
        <View
            backgroundColor="$backgroundStrong"
            paddingHorizontal={compact ? "$1.5" : "$2"}
            paddingVertical={compact ? 2 : "$0.5"}
            borderRadius={compact ? "$3" : "$4"}
            flexShrink={0}
            maxWidth={compact ? 132 : undefined}
        >
            <Text
                fontFamily="$body"
                fontSize={compact ? 10 : "$1"}
                fontWeight="500"
                color="$colorSecondary"
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

function RowChevron({ compact = false }: { compact?: boolean }) {
    return (
        <Text
            fontFamily="$body"
            fontSize={compact ? 16 : 18}
            fontWeight="600"
            color="$colorTertiary"
            opacity={0.7}
            marginTop={compact ? -1 : 0}
        >
            ›
        </Text>
    );
}

function PlanMetaFooter({
    plan,
    attentionReason,
    compact = false,
    marginTop,
}: {
    plan: SocialPlan;
    attentionReason?: PlanAttentionReason | null;
    compact?: boolean;
    marginTop?: string | number;
}) {
    const signal = getPlanSignal(plan, attentionReason);
    const lifecycleText = planLifecycleText(plan);

    if (!signal && !lifecycleText) return null;

    return (
        <XStack
            alignItems="center"
            gap={compact ? "$1.5" : "$2"}
            flexWrap="wrap"
            marginTop={marginTop ?? (compact ? "$1.5" : "$3")}
        >
            {signal ? (
                <InfoPill label={signal.label} tone={signal.tone} compact={compact} />
            ) : null}
            {lifecycleText ? (
                <Text
                    fontFamily="$body"
                    fontSize={compact ? 11 : "$2"}
                    color="$colorTertiary"
                >
                    {lifecycleText}
                </Text>
            ) : null}
        </XStack>
    );
}

function blurPressTargetOnWeb(event: unknown) {
    if (Platform.OS !== "web") return;
    const target =
        (event as { currentTarget?: { blur?: () => void } } | null)
            ?.currentTarget ??
        (event as { target?: { blur?: () => void } } | null)?.target;
    target?.blur?.();
}

function getAccentColor(plan: SocialPlan): string {
    if (plan.state === "DONE" || plan.state === "DROPPED") return "transparent";
    const days = getDaysDiff(plan.anchorStart);
    if (days === null) return "#E2D9CC";
    if (days <= 1) return "#F5C842";
    if (days <= 7) return "#D4956A";
    return "#E2D9CC";
}

function AvatarStack({
    plan,
    compact = false,
    inline = false,
}: {
    plan: SocialPlan;
    compact?: boolean;
    inline?: boolean;
}) {
    const names = plan.participants
        .map((p) => p.displayName)
        .filter(Boolean) as string[];
    if (names.length === 0) return null;

    const displayed = names.slice(0, 4);
    const avatarSize = compact ? 24 : 28;
    const radius = avatarSize / 2;
    const overlap = compact ? -6 : -8;

    return (
        <XStack alignItems="center" marginTop={inline ? 0 : "$1"}>
            <XStack>
                {displayed.map((name, i) => (
                    <View
                        key={name + i}
                        width={avatarSize}
                        height={avatarSize}
                        borderRadius={radius}
                        backgroundColor={getInitialColor(name)}
                        justifyContent="center"
                        alignItems="center"
                        borderWidth={2}
                        borderColor="$surface"
                        marginLeft={i === 0 ? 0 : overlap}
                        zIndex={displayed.length - i}
                    >
                        <Text
                            fontFamily="$body"
                            fontSize={compact ? 10 : 12}
                            fontWeight="600"
                            color="white"
                        >
                            {name.charAt(0).toUpperCase()}
                        </Text>
                    </View>
                ))}
            </XStack>
            {names.length > 4 ? (
                <Text
                    fontFamily="$body"
                    fontSize={compact ? 10 : "$1"}
                    color="$colorSecondary"
                    marginLeft="$1.5"
                >
                    +{names.length - 4}
                </Text>
            ) : null}
        </XStack>
    );
}

export type PlanCardVariant = "hero" | "compact";

function usePlanCardAnimations({
    state,
    variant,
    reducedMotion,
    index = 0,
}: {
    state: SocialPlan["state"];
    variant: PlanCardVariant;
    reducedMotion: boolean;
    index?: number;
}) {
    const useNativeDriver = Platform.OS !== "web";
    const entranceOffset = variant === "hero" ? 20 : 16;
    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(
        new Animated.Value(reducedMotion ? 0 : entranceOffset)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;

        const duration = variant === "hero" ? 350 : 280;
        const delay = variant === "compact" ? Math.min(index * 50, 250) : 0;

        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, [reducedMotion, variant, index, fadeAnim, slideAnim, useNativeDriver]);

    const flashAnim = useRef(new Animated.Value(0)).current;
    const prevStateRef = useRef(state);
    useEffect(() => {
        if (prevStateRef.current === "OPEN" && state === "DONE") {
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
        prevStateRef.current = state;
    }, [state, flashAnim]);

    const flashBg = flashAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["rgba(125,174,120,0)", "rgba(125,174,120,0.12)"],
    });

    return { fadeAnim, slideAnim, flashBg };
}

export function PlanCard({
    plan,
    onPress,
    variant,
    reducedMotion,
    attentionReason,
    quickActions = [],
    index = 0,
}: {
    plan: SocialPlan;
    onPress: (plan: SocialPlan) => void;
    variant: PlanCardVariant;
    reducedMotion: boolean;
    attentionReason?: PlanAttentionReason | null;
    quickActions?: PlanQuickActionRowAction[];
    index?: number;
}) {
    const isHero = variant === "hero";
    const when = formatWhenBadge(plan);
    const isDropped = plan.state === "DROPPED";
    const isInactive = plan.state === "DONE" || isDropped;
    const accentColor = getAccentColor(plan);
    const { fadeAnim, slideAnim, flashBg } = usePlanCardAnimations({
        state: plan.state,
        variant,
        reducedMotion,
        index,
    });

    const cornerRadius = isHero ? 16 : 14;
    const subtitle = planSubtitleText(plan, { allowNoteFallback: !isHero });
    const showNote = isHero && !!plan.contextNote?.trim();

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                marginBottom: isHero ? 16 : 10,
            }}
        >
            <Animated.View style={{ backgroundColor: flashBg, borderRadius: cornerRadius }}>
                <YStack
                    backgroundColor="$surface"
                    borderRadius={isHero ? "$8" : "$7"}
                    borderWidth={1}
                    borderColor="$borderColorSubtle"
                    opacity={isInactive ? 0.68 : 1}
                    overflow="hidden"
                    // @ts-ignore - Tamagui animation prop
                    animation="fast"
                >
                    {!isInactive ? (
                        <View
                            position="absolute"
                            top={0}
                            left={0}
                            bottom={0}
                            width={4}
                            backgroundColor={accentColor}
                            borderTopLeftRadius={cornerRadius}
                            borderBottomLeftRadius={cornerRadius}
                        />
                    ) : null}

                    <YStack
                        padding={isHero ? "$5" : undefined}
                        paddingVertical={isHero ? undefined : "$3"}
                        paddingLeft={isHero ? undefined : "$4"}
                        paddingRight={isHero ? undefined : "$3.5"}
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
                            outlineWidth: 0,
                            outlineColor: "transparent",
                        }}
                        focusVisibleStyle={{
                            backgroundColor: "$surfaceHover",
                            outlineWidth: 0,
                            outlineColor: "transparent",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Open plan: ${plan.intentText}`}
                    >
                        <YStack flex={1}>
                            <XStack
                                justifyContent="space-between"
                                alignItems={isHero ? "flex-start" : "center"}
                                gap={isHero ? "$3" : "$2"}
                            >
                                <Text
                                    fontFamily="$heading"
                                    fontSize={isHero ? "$8" : "$6"}
                                    color="$color"
                                    numberOfLines={isHero ? 2 : 1}
                                    flex={1}
                                >
                                    {plan.intentText}
                                </Text>

                                <XStack
                                    alignItems="center"
                                    gap={isHero ? "$2" : "$1.5"}
                                    flexShrink={0}
                                >
                                    {when ? (
                                        <WhenBadge label={when} compact={!isHero} />
                                    ) : null}
                                    <RowChevron compact={!isHero} />
                                </XStack>
                            </XStack>

                            <XStack
                                alignItems="center"
                                gap="$2"
                                marginTop={isHero ? "$2" : "$1"}
                            >
                                <AvatarStack plan={plan} compact={!isHero} inline />
                                <Text
                                    fontFamily="$body"
                                    fontSize={isHero ? "$2" : 11}
                                    color="$colorTertiary"
                                    numberOfLines={isHero ? 2 : 1}
                                    flex={1}
                                >
                                    {subtitle}
                                </Text>
                            </XStack>

                            {showNote ? (
                                <Text
                                    fontFamily="$body"
                                    fontSize="$3"
                                    color="$colorTertiary"
                                    lineHeight="$3"
                                    marginTop="$2"
                                    numberOfLines={3}
                                >
                                    {plan.contextNote}
                                </Text>
                            ) : null}

                            <PlanMetaFooter
                                plan={plan}
                                attentionReason={attentionReason}
                                compact={!isHero}
                            />
                        </YStack>
                    </YStack>

                    {quickActions.length > 0 ? (
                        <>
                            <View
                                height={1}
                                backgroundColor="$borderColorSubtle"
                                marginLeft={!isInactive ? 4 : 0}
                            />
                            <YStack
                                paddingHorizontal={isHero ? "$5" : "$4"}
                                paddingTop={isHero ? "$3" : "$2.5"}
                                paddingBottom={isHero ? "$4" : "$3"}
                            >
                                <PlanQuickActionRow actions={quickActions} compact={!isHero} />
                            </YStack>
                        </>
                    ) : null}
                </YStack>
            </Animated.View>
        </Animated.View>
    );
}
