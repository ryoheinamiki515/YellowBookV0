import React, { useCallback, useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Text, View, XStack, YStack } from "tamagui";

import { palette } from "../../../tamagui.config";

import type { SocialPlan } from "../../api/generated/model/socialPlan";
import type { PlanAttentionReason } from "../../lib/planListDerivations";
import {
    formatTimeOnly,
    notePreview,
    participantNames,
    planLifecycleText,
} from "../../lib/planFormatters";
import { Avatar } from "../Avatar";
import { avatarProps } from "../../lib/avatarPerson";
import { getSharedPeopleForDisplay } from "../../lib/sharedPeople";
import {
    PlanQuickActionRow,
    type PlanQuickActionRowAction,
} from "./PlanQuickActionRow";

type AgendaPlanRowProps = {
    plan: SocialPlan;
    attentionReason: PlanAttentionReason | null;
    isShared: boolean;
    isExpanded: boolean;
    onToggleExpand: (planId: string) => void;
    onNavigate: (planId: string) => void;
    quickActionItems: PlanQuickActionRowAction[];
    reducedMotion: boolean;
    isDoneView?: boolean;
    index?: number;
};

function getTimeLabel(plan: SocialPlan): string | null {
    if (plan.timePrecision === "EXACT" && plan.anchorStart) {
        return formatTimeOnly(plan.anchorStart);
    }
    return null;
}

function AvatarDots({ plan }: { plan: SocialPlan }) {
    const people = getSharedPeopleForDisplay(plan);
    if (people.length === 0) return null;

    const displayed = people.slice(0, 3);
    return (
        <XStack alignItems="center">
            {displayed.map((person, i) => (
                <View
                    key={person.key}
                    marginLeft={i === 0 ? 0 : -5}
                    zIndex={displayed.length - i}
                >
                    <Avatar
                        {...avatarProps(person)}
                        size={22}
                        borderWidth={2}
                        borderColor="$surface"
                    />
                </View>
            ))}
        </XStack>
    );
}

export function AgendaPlanRow({
    plan,
    attentionReason,
    isShared,
    isExpanded,
    onToggleExpand,
    onNavigate,
    quickActionItems,
    reducedMotion,
    isDoneView,
    index = 0,
}: AgendaPlanRowProps) {
    const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
    const useNativeDriver = Platform.OS !== "web";
    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(new Animated.Value(reducedMotion ? 0 : 12)).current;

    useEffect(() => {
        if (reducedMotion) return;
        const delay = Math.min(index * 40, 200);
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
    }, [reducedMotion]);

    useEffect(() => {
        if (reducedMotion) {
            expandAnim.setValue(isExpanded ? 1 : 0);
            return;
        }
        Animated.timing(expandAnim, {
            toValue: isExpanded ? 1 : 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [isExpanded, reducedMotion]);

    const handlePress = useCallback(() => {
        if (isExpanded) {
            onNavigate(plan.id);
        } else {
            onToggleExpand(plan.id);
        }
    }, [isExpanded, plan.id, onNavigate, onToggleExpand]);

    const subtitle = participantNames(plan);
    const location = plan.locationText?.trim() || null;
    const note = notePreview(plan.contextNote, 80);
    const timeLabel = getTimeLabel(plan);
    const lifecycle = isDoneView ? planLifecycleText(plan) : null;
    const hasAttention = Boolean(attentionReason) && !isDoneView;

    const expandedMaxHeight = expandAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 220],
    });
    const expandedOpacity = expandAnim.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0, 1],
    });

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                marginHorizontal: 8,
                marginBottom: 5,
            }}
        >
            <YStack
                backgroundColor="$surface"
                borderRadius={14}
                borderWidth={1}
                borderColor={isExpanded ? "$borderColorSubtle" : "transparent"}
                opacity={isDoneView ? 0.68 : 1}
                overflow="hidden"
                // @ts-ignore
                shadowColor="#2A2420"
                shadowOffset={{ width: 0, height: 1 }}
                shadowOpacity={isDoneView ? 0 : 0.04}
                shadowRadius={isDoneView ? 0 : 5}
                elevation={isDoneView ? 0 : 1}
            >
                <XStack
                    alignItems="center"
                    paddingVertical="$2.5"
                    paddingHorizontal="$3.5"
                    gap="$2.5"
                    onPress={handlePress}
                    hoverStyle={{ backgroundColor: "$surfaceHover" }}
                    pressStyle={{ scale: 0.985, backgroundColor: "$surfaceHover" }}
                    // @ts-ignore
                    animation="fast"
                    accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? "Open" : "Expand"} plan: ${plan.intentText}`}
                    cursor="pointer"
                    minHeight={62}
                    borderRadius={14}
                >
                    {hasAttention ? (
                        <View
                            width={7}
                            height={7}
                            borderRadius={3.5}
                            backgroundColor={palette.terracotta}
                            flexShrink={0}
                        />
                    ) : null}

                    <YStack flex={1} gap={3}>
                        <Text
                            fontFamily="$heading"
                            fontSize={16}
                            color="$color"
                            numberOfLines={1}
                        >
                            {plan.intentText}
                        </Text>
                        {subtitle || isShared ? (
                            <Text
                                fontFamily="$body"
                                fontSize={12}
                                color="$colorTertiary"
                                numberOfLines={1}
                            >
                                {subtitle}{subtitle && isShared ? " · " : ""}{isShared ? "Shared" : ""}
                            </Text>
                        ) : null}
                        {lifecycle ? (
                            <Text fontFamily="$body" fontSize={11} color="$colorTertiary">
                                {lifecycle}
                            </Text>
                        ) : null}
                    </YStack>

                    <XStack alignItems="center" gap="$2" flexShrink={0}>
                        <AvatarDots plan={plan} />
                        {timeLabel ? (
                            <Text fontFamily="$body" fontSize={12} color="$colorSecondary">
                                {timeLabel}
                            </Text>
                        ) : null}
                    </XStack>
                </XStack>

                {/* Expanded content */}
                <Animated.View
                    style={{
                        maxHeight: expandedMaxHeight,
                        opacity: expandedOpacity,
                        overflow: "hidden",
                    }}
                >
                    <View height={1} backgroundColor="$borderColorSubtle" marginHorizontal="$3" />
                    <YStack paddingHorizontal="$3.5" paddingVertical="$3" gap="$2">
                        {location ? (
                            <Text fontFamily="$body" fontSize={13} color="$colorSecondary">
                                {location}
                            </Text>
                        ) : null}
                        {note ? (
                            <Text
                                fontFamily="$body"
                                fontSize={13}
                                color="$colorTertiary"
                                numberOfLines={2}
                                lineHeight={18}
                            >
                                {note}
                            </Text>
                        ) : null}
                        {quickActionItems.length > 0 ? (
                            <YStack marginTop="$1">
                                <PlanQuickActionRow actions={quickActionItems} compact />
                            </YStack>
                        ) : null}
                    </YStack>
                </Animated.View>
            </YStack>
        </Animated.View>
    );
}
