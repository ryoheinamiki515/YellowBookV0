import React, { useState, useCallback } from "react";
import { FlatList, Keyboard, Alert, Modal, Pressable } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6) return `${Math.abs(diffDays)} days ago`;

    // Fall back to a soft formatted date
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

// ---------------------------------------------------------------------------
// State filter chips
// ---------------------------------------------------------------------------

const STATE_FILTERS: { label: string; value: SocialPlanState[] }[] = [
    { label: "Open", value: ["OPEN"] },
    { label: "Done", value: ["DONE"] },
    { label: "All", value: ["OPEN", "DONE", "DROPPED"] },
];

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({
    plan,
    onMarkDone,
    isUpdating,
}: {
    plan: SocialPlan;
    onMarkDone: (plan: SocialPlan) => void;
    isUpdating: boolean;
}) {
    const people = participantNames(plan);
    const when = formatRelativeDate(plan.anchorStart);
    const isDone = plan.state === "DONE";
    const isDropped = plan.state === "DROPPED";

    return (
        <YStack
            backgroundColor="$surface"
            borderRadius="$6"
            padding="$4"
            marginBottom="$3"
            borderWidth={1}
            borderColor="$borderColorSubtle"
            opacity={isDone || isDropped ? 0.6 : 1}
            accessibilityRole="button"
            accessibilityLabel={`Plan: ${plan.intentText}`}
        >
            {/* Intent text — the plan itself */}
            <Text
                fontFamily="$heading"
                fontSize="$7"
                color="$color"
                numberOfLines={2}
                marginBottom={people || when ? "$1" : "$0"}
            >
                {plan.intentText}
            </Text>

            {/* Meta row: participants + time */}
            {(people || when) && (
                <XStack gap="$2" flexWrap="wrap" marginBottom="$2">
                    {people && (
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$colorSecondary"
                            numberOfLines={1}
                        >
                            {people}
                        </Text>
                    )}
                    {people && when && (
                        <Text fontSize="$3" color="$colorTertiary">
                            ·
                        </Text>
                    )}
                    {when && (
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$colorSecondary"
                            numberOfLines={1}
                        >
                            {when}
                        </Text>
                    )}
                </XStack>
            )}

            {/* Location, if present */}
            {plan.locationText && (
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    color="$colorTertiary"
                    numberOfLines={1}
                    marginBottom="$2"
                >
                    {plan.locationText}
                </Text>
            )}

            {/* Context note, if present */}
            {plan.contextNote && (
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    color="$colorTertiary"
                    numberOfLines={2}
                    marginBottom="$2"
                    lineHeight="$2"
                >
                    {plan.contextNote}
                </Text>
            )}

            {/* State badge + action */}
            <XStack justifyContent="space-between" alignItems="center" marginTop="$1">
                {/* State badge */}
                <View
                    backgroundColor={
                        isDone
                            ? "$successBackground"
                            : isDropped
                                ? "$destructiveBackground"
                                : "$backgroundStrong"
                    }
                    paddingHorizontal="$2"
                    paddingVertical="$0.5"
                    borderRadius="$12"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$1"
                        fontWeight="500"
                        color={
                            isDone
                                ? "$successColor"
                                : isDropped
                                    ? "$destructiveColor"
                                    : "$colorSecondary"
                        }
                    >
                        {plan.state === "OPEN"
                            ? "Open"
                            : plan.state === "DONE"
                                ? "Done"
                                : plan.state === "DROPPED"
                                    ? "Let go"
                                    : "Archived"}
                    </Text>
                </View>

                {/* Mark done — only for OPEN plans */}
                {plan.state === "OPEN" && (
                    <YStack
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius="$4"
                        backgroundColor="$successBackground"
                        onPress={() => onMarkDone(plan)}
                        disabled={isUpdating}
                        opacity={isUpdating ? 0.5 : 1}
                        pressStyle={{ opacity: 0.7 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark "${plan.intentText}" as done`}
                        cursor="pointer"
                        minHeight={36}
                        justifyContent="center"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$2"
                            fontWeight="500"
                            color="$successColor"
                        >
                            Done
                        </Text>
                    </YStack>
                )}
            </XStack>
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// Create plan sheet
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
            {/* Overlay — tap to dismiss */}
            <Pressable
                style={{ flex: 1, backgroundColor: "rgba(42,36,32,0.3)" }}
                onPress={() => {
                    Keyboard.dismiss();
                    onOpenChange(false);
                }}
            />

            {/* Bottom sheet frame */}
            <YStack
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                backgroundColor="$surface"
                borderTopLeftRadius="$8"
                borderTopRightRadius="$8"
                padding="$6"
                paddingBottom="$10"
            >
                {/* Handle */}
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
                    marginBottom="$4"
                >
                    New plan
                </Text>

                <Input
                    fontFamily="$body"
                    fontSize="$6"
                    color="$color"
                    backgroundColor="$inputBackground"
                    borderColor="$borderColor"
                    borderWidth={1}
                    borderRadius="$4"
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
                    }}
                    accessibilityLabel="What's the plan?"
                />

                {/* Save button — primary CTA of the sheet */}
                <YStack
                    height="$12"
                    borderRadius="$5"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    marginTop="$4"
                    onPress={handleCreate}
                    disabled={!intentText.trim() || createPlan.isPending}
                    opacity={!intentText.trim() || createPlan.isPending ? 0.5 : 1}
                    pressStyle={{
                        backgroundColor: "$accentBackgroundPress",
                        opacity: 0.95,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Save plan"
                    cursor="pointer"
                >
                    {createPlan.isPending ? (
                        <Spinner size="small" color="$accentColor" />
                    ) : (
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            fontWeight="500"
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
    const queryClient = useQueryClient();

    const [activeFilter, setActiveFilter] = useState(0);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);

    const {
        data: plansResponse,
        isLoading,
        isError,
        refetch,
    } = useListPlans({ state: STATE_FILTERS[activeFilter].value, sort: "-updatedAt" });

    const patchPlan = usePatchPlan();

    const responseData = plansResponse?.data;
    const plans: SocialPlan[] =
        responseData && "data" in responseData
            ? (responseData as { data: SocialPlan[] }).data
            : [];

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

    // ----- Render helpers -----

    const renderPlanCard = useCallback(
        ({ item }: { item: SocialPlan }) => (
            <PlanCard
                plan={item}
                onMarkDone={handleMarkDone}
                isUpdating={updatingPlanId === item.id}
            />
        ),
        [handleMarkDone, updatingPlanId]
    );

    const keyExtractor = useCallback((item: SocialPlan) => item.id, []);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack flex={1} backgroundColor="$background">
                {/* ---- Header ---- */}
                <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    paddingHorizontal="$6"
                    paddingTop="$4"
                    paddingBottom="$2"
                >
                    <Text fontFamily="$heading" fontSize="$9" color="$color">
                        Plans
                    </Text>
                    <YStack
                        paddingHorizontal="$3"
                        paddingVertical="$1.5"
                        borderRadius="$4"
                        onPress={handleSignOut}
                        pressStyle={{ opacity: 0.6 }}
                        accessibilityRole="button"
                        accessibilityLabel="Sign out"
                        cursor="pointer"
                        minHeight={36}
                        justifyContent="center"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$colorTertiary"
                        >
                            Sign Out
                        </Text>
                    </YStack>
                </XStack>

                {/* ---- Filter chips ---- */}
                <XStack
                    gap="$2"
                    paddingHorizontal="$6"
                    paddingBottom="$3"
                >
                    {STATE_FILTERS.map((filter, i) => {
                        const isActive = i === activeFilter;
                        return (
                            <YStack
                                key={filter.label}
                                paddingHorizontal="$3"
                                paddingVertical="$1.5"
                                borderRadius="$12"
                                backgroundColor={
                                    isActive ? "$accentBackground" : "$backgroundStrong"
                                }
                                onPress={() => setActiveFilter(i)}
                                pressStyle={{ opacity: 0.7 }}
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
                                    fontWeight="500"
                                    color={isActive ? "$accentColor" : "$colorSecondary"}
                                >
                                    {filter.label}
                                </Text>
                            </YStack>
                        );
                    })}
                </XStack>

                {/* ---- Content ---- */}
                {isLoading ? (
                    // Gentle loading — skeleton-style placeholders
                    <YStack flex={1} paddingHorizontal="$6" paddingTop="$4" gap="$3">
                        {[1, 2, 3].map((i) => (
                            <YStack
                                key={i}
                                backgroundColor="$backgroundStrong"
                                borderRadius="$6"
                                height={96}
                                opacity={0.5 - i * 0.1}
                            />
                        ))}
                    </YStack>
                ) : isError ? (
                    // Error state — warm, not alarming
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
                    // Empty state — warm invitation
                    <YStack
                        flex={1}
                        justifyContent="center"
                        alignItems="center"
                        paddingHorizontal="$8"
                    >
                        {/* Subtle decorative circle */}
                        <View
                            width={64}
                            height={64}
                            borderRadius={32}
                            backgroundColor="$accentBackground"
                            opacity={0.3}
                            marginBottom="$4"
                        />
                        <Text
                            fontFamily="$heading"
                            fontSize="$7"
                            color="$color"
                            textAlign="center"
                            marginBottom="$2"
                        >
                            {activeFilter === 1
                                ? "Nothing here yet"
                                : "What are you looking forward to?"}
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$5"
                            color="$colorSecondary"
                            textAlign="center"
                            lineHeight="$6"
                        >
                            {activeFilter === 1
                                ? "Plans you complete will show up here."
                                : "Jot down a plan with a friend — lunch,\na walk, a call. Keep it simple."}
                        </Text>
                    </YStack>
                ) : (
                    <FlatList
                        data={plans}
                        renderItem={renderPlanCard}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={{
                            paddingHorizontal: 24,
                            paddingTop: 8,
                            paddingBottom: 120,
                        }}
                        showsVerticalScrollIndicator={false}
                        onRefresh={handleRefresh}
                        refreshing={false}
                    />
                )}

                {/* ---- FAB: New Plan ---- */}
                <YStack
                    position="absolute"
                    bottom={32}
                    right={24}
                    height={56}
                    paddingHorizontal="$5"
                    borderRadius="$12"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    onPress={() => setSheetOpen(true)}
                    pressStyle={{
                        backgroundColor: "$accentBackgroundPress",
                        opacity: 0.95,
                    }}
                    elevation={4}
                    accessibilityRole="button"
                    accessibilityLabel="Add a new plan"
                    cursor="pointer"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        fontWeight="500"
                        color="$accentColor"
                    >
                        + New Plan
                    </Text>
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
