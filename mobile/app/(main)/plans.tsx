import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Platform, SectionList, type SectionListData } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { YStack, XStack, Text, View, useMedia } from "tamagui";
import { PageContainer } from "../../src/components/PageContainer";
import { AppSafeAreaView } from "../../src/components/AppSafeAreaView";
import { PlanDetailContent } from "../../src/components/plans/PlanDetailContent";
import { useConfirm } from "../../src/components/ConfirmDialog";

import {
    useListPlans,
    usePatchPlan,
} from "../../src/api/generated/plans/plans";
import { usePatchPlanMembership } from "../../src/api/generated/sharing/sharing";
import type { SocialPlan } from "../../src/api/generated/model/socialPlan";
import type { PlanQuickActionRowAction } from "../../src/components/plans/PlanQuickActionRow";
import { CreatePlanSheet } from "../../src/components/plans/CreatePlanSheet";
import { PlanDetailSheet } from "../../src/components/plans/PlanDetailSheet";
import { PlanCard } from "../../src/components/plans/PlanCard";
import { AgendaDayHeader } from "../../src/components/plans/AgendaDayHeader";
import { SwipeableRow } from "../../src/components/plans/SwipeableRow";
import { AgendaAttentionBanner } from "../../src/components/plans/AgendaAttentionBanner";
import { AgendaEmptyState } from "../../src/components/plans/AgendaEmptyState";
import { AgendaSkeletonRows } from "../../src/components/plans/AgendaSkeletonRows";
import { FloatingActionButton } from "../../src/components/plans/FloatingActionButton";
import { useAuth } from "../../src/context/AuthContext";
import type {
    DerivedPlanListItem,
    PlanQuickActionKind,
} from "../../src/lib/planListDerivations";
import { useReducedMotionPreference } from "../../src/lib/planHelpers";
import {
    getPlanQuickActionLabel,
    getPlanQuickActionTone,
} from "../../src/lib/planQuickActions";
import { planLifecycleText } from "../../src/lib/planFormatters";
import { invalidatePlanQueries } from "../../src/lib/queryInvalidation";
import {
    buildAgendaSections,
    getAttentionCount,
    findFirstAttentionIndex,
    type AgendaSection,
    type AgendaPlanRowData,
} from "../../src/lib/agendaGrouping";
import { useKeyboardShortcut } from "../../src/hooks/useKeyboardShortcut";
import { useDesktopResizableSplitView } from "../../src/hooks/useDesktopResizableSplitView";
import { useRefreshOnVisible } from "../../src/hooks/useRefreshOnVisible";

type PlanDetailFocusTarget = "when" | "people";

const DESKTOP_LIST_DEFAULT_WIDTH = 400;
const DESKTOP_LIST_MIN_WIDTH = 280;
const DESKTOP_DETAIL_MIN_WIDTH = 360;
const DESKTOP_SPLITTER_WIDTH = 16;

export default function PlansScreen() {
    const { signOut } = useAuth();
    const router = useRouter();
    const confirm = useConfirm();
    const media = useMedia();
    const hasDesktopSidebar = media.lg && Platform.OS === "web";
    const queryClient = useQueryClient();
    const patchPlan = usePatchPlan();
    const membershipMutation = usePatchPlanMembership();
    const reducedMotion = useReducedMotionPreference();

    const [viewMode, setViewMode] = useState<"open" | "done">("open");
    const [sheetOpen, setSheetOpen] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [selectedPlanFocus, setSelectedPlanFocus] = useState<PlanDetailFocusTarget | undefined>(undefined);
    const [detailSheetPlanId, setDetailSheetPlanId] = useState<string | null>(null);
    const [detailSheetFocus, setDetailSheetFocus] = useState<PlanDetailFocusTarget | undefined>(undefined);
    const [pendingListMutation, setPendingListMutation] = useState<{
        planId: string;
        kind: PlanQuickActionKind;
    } | null>(null);

    const sectionListRef = useRef<SectionList<AgendaPlanRowData, AgendaSection>>(null);

    const {
        listWidth: desktopListWidth,
        isResizing: isDesktopResizing,
        handleContainerLayout: handleDesktopContainerLayout,
        handleSplitterPressIn: handleDesktopSplitterPressIn,
    } = useDesktopResizableSplitView({
        enabled: hasDesktopSidebar,
        defaultListWidth: DESKTOP_LIST_DEFAULT_WIDTH,
        minListWidth: DESKTOP_LIST_MIN_WIDTH,
        detailMinWidth: DESKTOP_DETAIL_MIN_WIDTH,
        splitterWidth: DESKTOP_SPLITTER_WIDTH,
    });

    const {
        data: plansResponse,
        isLoading,
        isError,
        isRefetching,
    } = useListPlans({
        state: viewMode === "open" ? ["OPEN"] : ["DONE", "DROPPED"],
        sort: "-updatedAt",
        scope: "owned",
    });

    const {
        data: subscribedPlansResponse,
        isRefetching: isSubscribedPlansRefetching,
    } = useListPlans({
        scope: "subscribed",
        sort: "-updatedAt",
    });

    const refreshPlans = useCallback(() => {
        return invalidatePlanQueries(queryClient);
    }, [queryClient]);

    useRefreshOnVisible(refreshPlans);

    const responseData = plansResponse?.data;
    const plans: SocialPlan[] =
        responseData && "data" in responseData
            ? (responseData as { data: SocialPlan[] }).data
            : [];

    const subscribedPlans: SocialPlan[] =
        subscribedPlansResponse?.data && "data" in subscribedPlansResponse.data
            ? (subscribedPlansResponse.data as { data: SocialPlan[] }).data
            : [];

    const agendaSections = useMemo<AgendaSection[]>(() => {
        if (viewMode !== "open") return [];
        return buildAgendaSections(plans, subscribedPlans);
    }, [plans, subscribedPlans, viewMode]);

    const attentionCount = useMemo(() => getAttentionCount(agendaSections), [agendaSections]);

    const handleRefresh = useCallback(() => {
        void refreshPlans();
    }, [refreshPlans]);

    const invalidatePlanCaches = useCallback(
        (_planId?: string) => {
            void invalidatePlanQueries(queryClient);
        },
        [queryClient]
    );

    const handleCreated = useCallback(() => {
        invalidatePlanCaches();
    }, [invalidatePlanCaches]);

    const handleSignOut = useCallback(async () => {
        const confirmed = await confirm({
            title: "Sign out?",
            message: "You can always sign back in.",
            confirmLabel: "Sign Out",
            destructive: true,
        });
        if (confirmed) signOut();
    }, [signOut, confirm]);

    const handleOpenPlan = useCallback(
        (planId: string, focus?: PlanDetailFocusTarget) => {
            if (hasDesktopSidebar) {
                setSelectedPlanId(planId);
                setSelectedPlanFocus(focus);
            } else {
                setDetailSheetPlanId(planId);
                setDetailSheetFocus(focus);
            }
        },
        [hasDesktopSidebar]
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
            const plan = [...plans, ...subscribedPlans].find((p) => p.id === planId);
            if (!plan) return;

            setPendingListMutation({ planId, kind: "mark-done" });
            const onSettled = () => {
                invalidatePlanCaches(planId);
                setPendingListMutation((c) => (c?.planId === planId ? null : c));
            };

            if (plan.role === "owner") {
                patchPlan.mutate({ planId, data: { state: "DONE" } }, { onSettled });
            } else {
                membershipMutation.mutate(
                    { planId, data: { markedDoneAt: new Date().toISOString() } },
                    { onSettled }
                );
            }
        },
        [plans, subscribedPlans, patchPlan, membershipMutation, invalidatePlanCaches]
    );

    const handleLetGoFromList = useCallback(
        async (planId: string) => {
            const confirmed = await confirm({
                title: "Let go of this plan?",
                message: "You can always find it later.",
                confirmLabel: "Let Go",
                destructive: true,
            });
            if (confirmed) {
                mutatePlanStateFromList(planId, "DROPPED", "let-go");
            }
        },
        [mutatePlanStateFromList, confirm]
    );

    const handleQuickAction = useCallback(
        (plan: SocialPlan, kind: PlanQuickActionKind, attentionReason: any) => {
            switch (kind) {
                case "focus-people":
                    handleOpenPlan(plan.id, "people");
                    return;
                case "focus-when":
                    handleOpenPlan(plan.id, "when");
                    return;
                case "let-go":
                    handleLetGoFromList(plan.id);
                    return;
                case "mark-done":
                    handleMarkDoneFromList(plan.id);
                    return;
                case "open":
                default:
                    handleOpenPlan(plan.id);
            }
        },
        [handleOpenPlan, handleLetGoFromList, handleMarkDoneFromList]
    );

    const buildQuickActionItems = useCallback(
        (row: AgendaPlanRowData): PlanQuickActionRowAction[] => {
            if (row.quickActions.length === 0) return [];

            const isBusyPlan =
                patchPlan.isPending && pendingListMutation?.planId === row.plan.id;

            return row.quickActions.map((kind) => {
                const isLoading =
                    isBusyPlan && pendingListMutation?.kind === kind;
                const label = getPlanQuickActionLabel(kind, row.attentionReason);
                return {
                    key: `${row.plan.id}-${kind}`,
                    label,
                    tone: getPlanQuickActionTone(kind),
                    accessibilityLabel: `${label} for ${row.plan.intentText}`,
                    onPress: () => handleQuickAction(row.plan, kind, row.attentionReason),
                    disabled: isBusyPlan,
                    loading: isLoading,
                };
            });
        },
        [handleQuickAction, patchPlan.isPending, pendingListMutation]
    );

    const handleAttentionBannerPress = useCallback(() => {
        const target = findFirstAttentionIndex(agendaSections);
        if (target && sectionListRef.current) {
            sectionListRef.current.scrollToLocation({
                sectionIndex: target.sectionIndex,
                itemIndex: target.itemIndex,
                animated: true,
            });
        }
    }, [agendaSections]);

    useKeyboardShortcut({ key: "n" }, () => setSheetOpen(true));

    const toggleViewMode = useCallback(() => {
        setViewMode((v) => (v === "open" ? "done" : "open"));
    }, []);

    const renderSectionHeader = useCallback(
        ({ section }: { section: SectionListData<AgendaPlanRowData, AgendaSection> }) => (
            <AgendaDayHeader
                label={section.label}
                isToday={section.isToday}
                count={section.data.length}
            />
        ),
        []
    );

    const itemIndexRef = useRef(0);
    // Reset index counter when sections change
    useEffect(() => { itemIndexRef.current = 0; }, [agendaSections]);

    const renderItem = useCallback(
        ({ item }: { item: AgendaPlanRowData }) => {
            const idx = itemIndexRef.current++;
            const card = (
                <PlanCard
                    plan={item.plan}
                    variant="compact"
                    onPress={(plan) => handleOpenPlan(plan.id)}
                    attentionReason={item.attentionReason}
                    quickActions={buildQuickActionItems(item)}
                    reducedMotion={reducedMotion}
                    index={idx}
                />
            );

            if (Platform.OS === "web") return card;

            return (
                <SwipeableRow
                    onSwipeRight={() => handleMarkDoneFromList(item.plan.id)}
                    onSwipeLeft={() => handleLetGoFromList(item.plan.id)}
                    reducedMotion={reducedMotion}
                >
                    {card}
                </SwipeableRow>
            );
        },
        [
            handleOpenPlan,
            buildQuickActionItems,
            reducedMotion,
            handleMarkDoneFromList,
            handleLetGoFromList,
        ]
    );

    const renderDoneItem = useCallback(
        ({ item }: { item: SocialPlan }) => (
            <PlanCard
                plan={item}
                variant="compact"
                onPress={(plan) => handleOpenPlan(plan.id)}
                reducedMotion={reducedMotion}
            />
        ),
        [handleOpenPlan, reducedMotion]
    );

    const keyExtractor = useCallback((item: AgendaPlanRowData) => item.plan.id, []);
    const doneKeyExtractor = useCallback((item: SocialPlan) => item.id, []);

    const header = (
        <YStack backgroundColor="$background">
            <XStack
                paddingHorizontal="$5"
                paddingTop="$4"
                paddingBottom="$3"
                alignItems="center"
                justifyContent="space-between"
            >
                <Text fontFamily="$heading" fontSize="$9" color="$color">
                    Plans
                </Text>
                <XStack alignItems="center" gap="$3">
                    <View
                        backgroundColor="$backgroundStrong"
                        paddingHorizontal={10}
                        paddingVertical={5}
                        borderRadius={10}
                        onPress={toggleViewMode}
                        pressStyle={{ scale: 0.96, opacity: 0.7 }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel={viewMode === "open" ? "Show completed plans" : "Show upcoming plans"}
                        cursor="pointer"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize={12}
                            fontWeight="500"
                            color="$colorSecondary"
                        >
                            {viewMode === "open" ? "Show completed" : "Show upcoming"}
                        </Text>
                    </View>
                    {!hasDesktopSidebar && (
                        <View
                            width={36}
                            height={36}
                            borderRadius={18}
                            backgroundColor="$colorTertiary"
                            justifyContent="center"
                            alignItems="center"
                            onPress={() => router.push("/settings" as any)}
                            pressStyle={{ opacity: 0.7, scale: 0.95 }}
                            accessibilityRole="button"
                            accessibilityLabel="Settings"
                            cursor="pointer"
                        >
                            <Text fontFamily="$body" fontSize={14} fontWeight="600" color="white">
                                Y
                            </Text>
                        </View>
                    )}
                </XStack>
            </XStack>
            <View height={1} backgroundColor="$borderColorSubtle" marginHorizontal="$5" opacity={0.6} />
        </YStack>
    );

    const listHeaderComponent = useMemo(() => {
        if (viewMode !== "open" || attentionCount === 0) return null;
        return (
            <AgendaAttentionBanner
                count={attentionCount}
                onPress={handleAttentionBannerPress}
                reducedMotion={reducedMotion}
            />
        );
    }, [viewMode, attentionCount, handleAttentionBannerPress, reducedMotion]);

    const listContent = (
        <>
            {header}

            {isLoading ? (
                <AgendaSkeletonRows />
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
                        Something went wrong.{"\n"}{Platform.OS === "web" ? "Try again." : "Pull down to try again."}
                    </Text>
                </YStack>
            ) : viewMode === "done" ? (
                plans.length === 0 ? (
                    <YStack flex={1} justifyContent="center" alignItems="center" paddingHorizontal="$8">
                        <Text fontFamily="$heading" fontSize="$8" color="$color" textAlign="center" marginBottom="$2">
                            Nothing here yet
                        </Text>
                        <Text fontFamily="$body" fontSize="$5" color="$colorSecondary" textAlign="center" lineHeight="$6">
                            Plans you complete will show up here.
                        </Text>
                    </YStack>
                ) : (
                    <SectionList
                        sections={[{ data: plans, dayKey: "done", label: "Completed", isToday: false }]}
                        renderItem={renderDoneItem as any}
                        renderSectionHeader={() => null}
                        keyExtractor={doneKeyExtractor}
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        onRefresh={Platform.OS !== "web" ? handleRefresh : undefined}
                        refreshing={
                            Platform.OS !== "web"
                                ? Boolean((isRefetching || isSubscribedPlansRefetching) && !isLoading)
                                : false
                        }
                    />
                )
            ) : agendaSections.length === 0 ? (
                <AgendaEmptyState reducedMotion={reducedMotion} />
            ) : (
                <View flex={1} position="relative">
                    <SectionList
                        ref={sectionListRef}
                        sections={agendaSections}
                        renderItem={renderItem}
                        renderSectionHeader={renderSectionHeader}
                        keyExtractor={keyExtractor}
                        stickySectionHeadersEnabled
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={listHeaderComponent}
                        onRefresh={Platform.OS !== "web" ? handleRefresh : undefined}
                        refreshing={
                            Platform.OS !== "web"
                                ? Boolean((isRefetching || isSubscribedPlansRefetching) && !isLoading)
                                : false
                        }
                    />
                    <FloatingActionButton onPress={() => setSheetOpen(true)} />
                </View>
            )}

            <CreatePlanSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                onCreated={handleCreated}
            />

            <PlanDetailSheet
                planId={detailSheetPlanId}
                open={detailSheetPlanId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetailSheetPlanId(null);
                        setDetailSheetFocus(undefined);
                    }
                }}
                focusTarget={detailSheetFocus}
            />
        </>
    );

    if (!hasDesktopSidebar) {
        return (
            <AppSafeAreaView>
                <PageContainer backgroundColor="$background">
                    {listContent}
                </PageContainer>
            </AppSafeAreaView>
        );
    }

    return (
        <AppSafeAreaView>
            <XStack
                flex={1}
                backgroundColor="$background"
                onLayout={handleDesktopContainerLayout}
            >
                <YStack width={desktopListWidth}>
                    {listContent}
                </YStack>
                <YStack
                    width={DESKTOP_SPLITTER_WIDTH}
                    justifyContent="center"
                    alignItems="center"
                    cursor="col-resize"
                    backgroundColor={isDesktopResizing ? "$backgroundStrong" : "transparent"}
                    hoverStyle={{ backgroundColor: "$backgroundStrong" }}
                    accessibilityRole="adjustable"
                    accessibilityLabel="Resize plans panel"
                    onPressIn={handleDesktopSplitterPressIn}
                >
                    <View
                        width={3}
                        height={48}
                        borderRadius={999}
                        backgroundColor="$borderColorSubtle"
                    />
                </YStack>
                <YStack flex={1}>
                    {selectedPlanId ? (
                        <PlanDetailContent
                            key={selectedPlanId}
                            planId={selectedPlanId}
                            focusTarget={selectedPlanFocus}
                            onClose={() => {
                                setSelectedPlanId(null);
                                setSelectedPlanFocus(undefined);
                            }}
                        />
                    ) : (
                        <YStack flex={1} justifyContent="center" alignItems="center" padding="$8">
                            <Text
                                fontFamily="$body"
                                fontSize="$6"
                                color="$colorTertiary"
                                textAlign="center"
                            >
                                Select a plan to view details
                            </Text>
                        </YStack>
                    )}
                </YStack>
            </XStack>
        </AppSafeAreaView>
    );
}
