import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Platform,
    Pressable,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { YStack, XStack, Text, View } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "../src/components/BottomSheetPrimitives";

import {
    useListPlans,
    useCreatePlan,
    usePatchPlan,
    getListPlansQueryKey,
    getGetPlanQueryKey,
} from "../src/api/generated/plans/plans";
import type { SocialPlan } from "../src/api/generated/model/socialPlan";
import type { SocialPlanState } from "../src/api/generated/model/socialPlanState";
import { PlanCard } from "../src/components/plans/PlanCard";
import type { PlanQuickActionRowAction } from "../src/components/plans/PlanQuickActionRow";
import { PlansSectionHeader } from "../src/components/plans/PlansSectionHeader";
import { useAuth } from "../src/context/AuthContext";
import {
    buildFilteredSectionItems,
    type DerivedPlanListItem,
    type PlanAttentionReason,
    type PlanListSectionItem,
    type PlanQuickActionKind,
} from "../src/lib/planListDerivations";
import { useReducedMotionPreference } from "../src/lib/planHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
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

// ---------------------------------------------------------------------------
// State filter chips
// ---------------------------------------------------------------------------

const STATE_FILTERS: { label: string; value: SocialPlanState[] }[] = [
    { label: "All", value: ["OPEN", "DONE", "DROPPED"] },
    { label: "Open", value: ["OPEN"] },
    { label: "Done", value: ["DONE"] },
];

type PlanDetailFocusTarget = "when" | "people";

function quickActionLabel(
    kind: PlanQuickActionKind,
    attentionReason: PlanAttentionReason | null
): string {
    switch (kind) {
        case "focus-people":
            return "Add who";
        case "focus-when":
            return attentionReason === "past-due" ? "Reschedule" : "Pick day";
        case "let-go":
            return "Let go";
        case "mark-done":
            return "Done";
        case "open":
        default:
            return "Open";
    }
}

function quickActionTone(kind: PlanQuickActionKind): PlanQuickActionRowAction["tone"] {
    switch (kind) {
        case "focus-people":
        case "focus-when":
            return "accent";
        case "mark-done":
            return "success";
        case "let-go":
            return "danger";
        case "open":
        default:
            return "neutral";
    }
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
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader
                title="New plan"
                subtitle="What would you like to do with someone?"
            />

            <BottomSheetTextField
                placeholder="Lunch with Sam, gym Monday, call Dad..."
                placeholderTextColor="$placeholderColor"
                value={intentText}
                onChangeText={setIntentText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                accessibilityLabel="What's the plan?"
            />

            <BottomSheetPrimaryButton
                label="Save Plan"
                loadingLabel="Saving..."
                loading={createPlan.isPending}
                onPress={handleCreate}
                disabled={!intentText.trim() || createPlan.isPending}
                accessibilityLabel="Save plan"
            />
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PlansScreen() {
    const { signOut } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const patchPlan = usePatchPlan();
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const [activeFilter, setActiveFilter] = useState(1); // Default to "Open"
    const [sheetOpen, setSheetOpen] = useState(false);
    const [pendingListMutation, setPendingListMutation] = useState<{
        planId: string;
        kind: PlanQuickActionKind;
    } | null>(null);

    const {
        data: plansResponse,
        isLoading,
        isError,
        isRefetching,
        refetch,
    } = useListPlans({
        state: STATE_FILTERS[activeFilter].value,
        sort: "-updatedAt",
    });

    const responseData = plansResponse?.data;
    const plans: SocialPlan[] =
        responseData && "data" in responseData
            ? (responseData as { data: SocialPlan[] }).data
            : [];

    // Group plans into section items
    const sectionItems = useMemo(
        () => buildFilteredSectionItems(plans, STATE_FILTERS[activeFilter].label),
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

    const invalidatePlanCaches = useCallback(
        (planId?: string) => {
            queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
            if (planId) {
                queryClient.invalidateQueries({
                    queryKey: getGetPlanQueryKey(planId),
                });
            }
        },
        [queryClient]
    );

    const handleCreated = useCallback(() => {
        invalidatePlanCaches();
    }, [invalidatePlanCaches]);

    const handleSignOut = useCallback(() => {
        Alert.alert("Sign out?", "You can always sign back in.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Out", style: "destructive", onPress: signOut },
        ]);
    }, [signOut]);

    const handleOpenPlan = useCallback(
        (planId: string, focus?: PlanDetailFocusTarget) => {
            const query = focus ? `?focus=${focus}` : "";
            router.push(`/plan/${planId}${query}`);
        },
        [router]
    );

    const handlePlanPress = useCallback(
        (plan: SocialPlan) => {
            handleOpenPlan(plan.id);
        },
        [handleOpenPlan]
    );

    const mutatePlanStateFromList = useCallback(
        (planId: string, state: "DONE" | "DROPPED", kind: PlanQuickActionKind) => {
            setPendingListMutation({ planId, kind });
            patchPlan.mutate(
                { planId, data: { state } },
                {
                    onSettled: () => {
                        invalidatePlanCaches(planId);
                        setPendingListMutation((current) =>
                            current?.planId === planId ? null : current
                        );
                    },
                }
            );
        },
        [patchPlan, invalidatePlanCaches]
    );

    const handleMarkDoneFromList = useCallback(
        (planId: string) => {
            mutatePlanStateFromList(planId, "DONE", "mark-done");
        },
        [mutatePlanStateFromList]
    );

    const handleLetGoFromList = useCallback(
        (planId: string) => {
            Alert.alert("Let go of this plan?", "You can always find it later.", [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Let Go",
                    style: "destructive",
                    onPress: () => {
                        mutatePlanStateFromList(planId, "DROPPED", "let-go");
                    },
                },
            ]);
        },
        [mutatePlanStateFromList]
    );

    const handleQuickAction = useCallback(
        (derived: DerivedPlanListItem, kind: PlanQuickActionKind) => {
            switch (kind) {
                case "focus-people":
                    handleOpenPlan(derived.plan.id, "people");
                    return;
                case "focus-when":
                    handleOpenPlan(derived.plan.id, "when");
                    return;
                case "let-go":
                    handleLetGoFromList(derived.plan.id);
                    return;
                case "mark-done":
                    handleMarkDoneFromList(derived.plan.id);
                    return;
                case "open":
                default:
                    handleOpenPlan(derived.plan.id);
            }
        },
        [handleOpenPlan, handleLetGoFromList, handleMarkDoneFromList]
    );

    const buildQuickActionItems = useCallback(
        (derived: DerivedPlanListItem): PlanQuickActionRowAction[] => {
            if (derived.quickActions.length === 0) return [];

            const isBusyPlan =
                patchPlan.isPending && pendingListMutation?.planId === derived.plan.id;

            return derived.quickActions.map((kind) => {
                const isLoading =
                    isBusyPlan && pendingListMutation?.kind === kind;
                const label = quickActionLabel(kind, derived.attentionReason);
                return {
                    key: `${derived.plan.id}-${kind}`,
                    label,
                    tone: quickActionTone(kind),
                    accessibilityLabel: `${label} for ${derived.plan.intentText}`,
                    onPress: () => handleQuickAction(derived, kind),
                    disabled: isBusyPlan,
                    loading: isLoading,
                };
            });
        },
        [handleQuickAction, patchPlan.isPending, pendingListMutation]
    );

    // Track card index for staggered animations (excluding section headers)
    const cardIndexRef = useRef(0);

    const renderSectionItem = useCallback(
        ({ item }: { item: PlanListSectionItem }) => {
            if (item.type === "section-header") {
                cardIndexRef.current = 0;
                return <PlansSectionHeader title={item.title} count={item.count} />;
            }

            const derived = item.derived;
            const plan = derived.plan;
            const quickActions = buildQuickActionItems(derived);

            if (derived.isHeroCandidate) {
                return (
                    <PlanCard
                        plan={plan}
                        onPress={handlePlanPress}
                        variant="hero"
                        reducedMotion={reducedMotion}
                        attentionReason={derived.attentionReason}
                        quickActions={quickActions}
                    />
                );
            }

            const idx = cardIndexRef.current++;
            return (
                <PlanCard
                    plan={plan}
                    onPress={handlePlanPress}
                    variant="compact"
                    index={idx}
                    reducedMotion={reducedMotion}
                    attentionReason={derived.attentionReason}
                    quickActions={quickActions}
                />
            );
        },
        [buildQuickActionItems, handlePlanPress, reducedMotion]
    );

    const keyExtractor = useCallback((item: PlanListSectionItem) => item.key, []);

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

                            <XStack alignItems="center" gap="$2">
                                <Pressable
                                    onPress={() => router.push("/people")}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Go to People"
                                >
                                    <View
                                        paddingHorizontal="$3"
                                        paddingVertical="$1.5"
                                        borderRadius="$10"
                                        backgroundColor="$backgroundStrong"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$3"
                                            fontWeight="500"
                                            color="$colorSecondary"
                                        >
                                            People
                                        </Text>
                                    </View>
                                </Pressable>

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
                        refreshing={Boolean(isRefetching && !isLoading)}
                        onScroll={onScroll}
                        scrollEventThrottle={16}
                    />
                )}

                {/* ---- Bottom bar: New Plan CTA ---- */}
                <YStack position="relative">
                    {/* Fade overlay above the bar */}
                    <View
                        position="absolute"
                        top={-16}
                        left={0}
                        right={0}
                        height={16}
                        backgroundColor="$background"
                        opacity={0.85}
                        pointerEvents="none"
                    />
                    <YStack
                        paddingHorizontal="$6"
                        paddingTop="$3"
                        paddingBottom="$2"
                        backgroundColor="$background"
                    >
                    <YStack
                        height={48}
                        borderRadius="$6"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                        onPress={() => setSheetOpen(true)}
                        pressStyle={{
                            scale: 0.96,
                            backgroundColor: "$accentBackgroundPress",
                        }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel="Add a new plan"
                        cursor="pointer"
                        // @ts-ignore
                        shadowColor="#B8860B"
                        shadowOffset={{ width: 0, height: 4 }}
                        shadowOpacity={0.18}
                        shadowRadius={12}
                        elevation={5}
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
