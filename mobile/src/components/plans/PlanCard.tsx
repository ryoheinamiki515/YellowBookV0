import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Text, View, XStack, YStack, useTheme } from "tamagui";

import { palette } from "../../../tamagui.config";

import type { SocialPlan } from "../../api/generated/model/socialPlan";
import { DisclosureChevron } from "../DisclosureChevron";
import {
    getAttentionReason,
    type PlanAttentionReason,
} from "../../lib/planListDerivations";

import { getInitialColor } from "../../lib/planHelpers";
import {
    fromPlan,
    formatBadge,
    getBadgeTone,
    getDaysDiffFromIso,
    getStartAnchor,
    type WhenBadgeTone,
} from "../../lib/planWhen";
import {
    PlanQuickActionRow,
    type PlanQuickActionRowAction,
} from "./PlanQuickActionRow";
import { getSharedPeopleForDisplay } from "../../lib/sharedPeople";

function formatWhenBadge(plan: SocialPlan): string | null {
    return formatBadge(fromPlan(plan));
}

function getWhenBadgeTone(plan: SocialPlan): WhenBadgeTone {
    return getBadgeTone(fromPlan(plan));
}

function participantNames(plan: SocialPlan): string | null {
    const names = getSharedPeopleForDisplay(plan, {
        excludeViewer: plan.role === "member",
    }).map((person) => person.displayName);

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
    const diffDays = getDaysDiffFromIso(iso);
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
    if (plan.state === "ARCHIVED") return `Archived ${relativeLabel}`;

    const createdAt = new Date(plan.createdAt).getTime();
    const updatedAt = new Date(plan.updatedAt).getTime();
    const justCreated =
        !isNaN(createdAt) &&
        !isNaN(updatedAt) &&
        Math.abs(updatedAt - createdAt) < 60 * 1000;

    if (getDaysDiffFromIso(plan.updatedAt) === 0) return null;

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
    const theme = useTheme();
    const bgStrong = theme.backgroundStrong?.val ?? palette.linen;
    const textSecondary = theme.colorSecondary?.val ?? palette.charcoal;
    const toneStyles: Record<PillTone, { backgroundColor: string; color: string }> = {
        neutral: { backgroundColor: bgStrong, color: textSecondary },
        muted: { backgroundColor: palette.parchment, color: textSecondary },
        success: { backgroundColor: `rgba(125,174,120,0.22)`, color: palette.sageDark },
        warning: { backgroundColor: `rgba(212,149,106,0.25)`, color: palette.terracottaDark },
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

const whenBadgeToneStyles: Record<WhenBadgeTone, { bg: string; text: string }> = {
    today: { bg: "rgba(245,200,66,0.30)", text: "#6B5000" },
    tomorrow: { bg: "rgba(232,169,74,0.28)", text: "#6B4510" },
    soon: { bg: "rgba(212,128,90,0.25)", text: "#6B3818" },
    pastDue: { bg: "rgba(200,112,112,0.25)", text: "#6B2828" },
    neutral: { bg: "", text: "" },
};

function WhenBadge({
    label,
    compact = false,
    tone = "neutral",
}: {
    label: string;
    compact?: boolean;
    tone?: WhenBadgeTone;
}) {
    const toneStyle = whenBadgeToneStyles[tone];
    const hasCustomTone = tone !== "neutral";

    return (
        <View
            backgroundColor={hasCustomTone ? toneStyle.bg : "$backgroundStrong"}
            paddingHorizontal={compact ? "$1.5" : "$2"}
            paddingVertical={compact ? 2 : "$0.5"}
            borderRadius={compact ? "$3" : "$4"}
            flexShrink={0}
            maxWidth={compact ? 132 : undefined}
        >
            <Text
                fontFamily="$body"
                fontSize={compact ? 10 : "$1"}
                fontWeight={hasCustomTone ? "600" : "500"}
                color={hasCustomTone ? toneStyle.text : "$colorSecondary"}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
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
    if (plan.state === "DONE" || plan.state === "DROPPED" || plan.state === "ARCHIVED") {
        return "transparent";
    }
    const days = getDaysDiffFromIso(getStartAnchor(fromPlan(plan)));
    if (days === null) return palette.fog;
    if (days <= 1) return palette.honey;
    if (days <= 7) return palette.terracotta;
    return palette.fog;
}

function AvatarStack({
    plan,
    compact = false,
    inline = false,
    hero = false,
}: {
    plan: SocialPlan;
    compact?: boolean;
    inline?: boolean;
    hero?: boolean;
}) {
    const names = getSharedPeopleForDisplay(plan).map((person) => person.displayName);
    if (names.length === 0) return null;

    const displayed = names.slice(0, 4);
    const avatarSize = compact ? 24 : 28;
    const radius = avatarSize / 2;
    const overlap = compact ? -6 : -8;

    return (
        <XStack alignItems="center" marginTop={inline ? 0 : "$1"}>
            <XStack>
                {displayed.map((name, i) => {
                    const bgColor = getInitialColor(name);
                    return (
                        <View
                            key={name + i}
                            width={avatarSize}
                            height={avatarSize}
                            borderRadius={radius}
                            backgroundColor={bgColor}
                            justifyContent="center"
                            alignItems="center"
                            borderWidth={hero ? 2.5 : 2}
                            borderColor="$surface"
                            marginLeft={i === 0 ? 0 : overlap}
                            zIndex={displayed.length - i}
                            // @ts-ignore - shadow props for hero avatar glow
                            shadowColor={hero ? bgColor : undefined}
                            shadowOffset={hero ? { width: 0, height: 1 } : undefined}
                            shadowOpacity={hero ? 0.3 : 0}
                            shadowRadius={hero ? 4 : 0}
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
                    );
                })}
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
        outputRange: ["rgba(125,174,120,0)", "rgba(125,174,120,0.20)"],
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
    const isSubscribed = plan.role === "member";
    const compactWebMinHeight = !isHero && Platform.OS === "web" ? 72 : undefined;
    const when = formatWhenBadge(plan);
    const whenTone = getWhenBadgeTone(plan);
    const isDropped = plan.state === "DROPPED";
    const isArchived = plan.state === "ARCHIVED";
    const isInactive = plan.state === "DONE" || isDropped || isArchived;
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
                marginHorizontal: isHero ? 0 : 8,
            }}
        >
            <Animated.View style={{ backgroundColor: flashBg, borderRadius: cornerRadius }}>
                <YStack
                    backgroundColor={isHero ? "$surfaceWarm" : "$surface"}
                    borderRadius={isHero ? "$8" : "$7"}
                    borderWidth={1}
                    borderColor="$borderColorSubtle"
                    opacity={isInactive ? 0.68 : 1}
                    overflow="hidden"
                    // @ts-ignore - Tamagui animation prop
                    animation="fast"
                    // @ts-ignore - shadow props
                    shadowColor={isInactive ? undefined : "#2A2420"}
                    shadowOffset={isHero ? { width: 0, height: 4 } : (!isInactive ? { width: 0, height: 2 } : undefined)}
                    shadowOpacity={isHero ? 0.08 : (!isInactive ? 0.05 : 0)}
                    shadowRadius={isHero ? 12 : (!isInactive ? 6 : 0)}
                    elevation={isHero ? 4 : (!isInactive ? 2 : 0)}
                >
                    {/* Decorative warm glow — hero only */}
                    {isHero && !isInactive ? (
                        <View
                            position="absolute"
                            top={-20}
                            right={-20}
                            width={80}
                            height={80}
                            borderRadius={40}
                            backgroundColor={`${palette.honeyLight}2E`}
                            pointerEvents="none"
                        />
                    ) : null}

                    {!isInactive ? (
                        <View
                            position="absolute"
                            top={0}
                            left={0}
                            bottom={0}
                            width={isHero ? 5 : 4}
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
                        minHeight={compactWebMinHeight}
                        onPress={(event) => {
                            blurPressTargetOnWeb(event);
                            onPress(plan);
                        }}
                        hoverStyle={{ backgroundColor: "$surfaceHover" }}
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
                        <YStack>
                            <XStack
                                justifyContent="space-between"
                                alignItems={isHero ? "flex-start" : "center"}
                                gap={isHero ? "$3" : "$2"}
                            >
                                <Text
                                    fontFamily="$heading"
                                    fontSize={isHero ? "$9" : "$6"}
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
                                    {isSubscribed ? (
                                        <InfoPill label="Shared" tone="neutral" compact={!isHero} />
                                    ) : null}
                                    {when ? (
                                        <WhenBadge label={when} compact={!isHero} tone={whenTone} />
                                    ) : null}
                                    <DisclosureChevron
                                        size={isHero ? 16 : 14}
                                        endInset={isHero ? 4 : 6}
                                    />
                                </XStack>
                            </XStack>

                            <XStack
                                alignItems="center"
                                gap="$2"
                                marginTop={isHero ? "$2" : "$1"}
                            >
                                <AvatarStack plan={plan} compact={!isHero} inline hero={isHero} />
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
