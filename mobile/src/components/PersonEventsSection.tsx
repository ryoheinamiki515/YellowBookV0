import React, { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Animated, Easing, Platform } from "react-native";
import { Text, View, XStack, YStack } from "tamagui";

import { palette } from "../../tamagui.config";

import {
    getListPlansQueryKey,
    listPlans,
} from "../api/generated/plans/plans";
import type { ListPlansParams } from "../api/generated/model/listPlansParams";
import type { SocialPlan } from "../api/generated/model/socialPlan";
import { useReducedMotionPreference } from "../lib/planHelpers";
import { buildPersonEventSections } from "../lib/personPlanDerivations";
import { PlansSectionHeader } from "./plans/PlansSectionHeader";
import { PlanCard } from "./plans/PlanCard";

type PersonEventsSectionProps = {
    personId: string;
    onOpenPlan: (planId: string) => void;
};

const PERSON_EVENTS_PAGE_LIMIT = 200;
const PERSON_EVENTS_PAGE_CAP = 50;

const PERSON_EVENTS_STATES: NonNullable<ListPlansParams["state"]> = [
    "OPEN",
    "DONE",
    "DROPPED",
    "ARCHIVED",
];

type PersonPlansPage = {
    data: SocialPlan[];
    nextCursor: string | null;
};

function parsePersonPlansPage(response: Awaited<ReturnType<typeof listPlans>>): PersonPlansPage {
    if (!response?.data || typeof response.data !== "object" || !("data" in response.data)) {
        return { data: [], nextCursor: null };
    }

    const payload = response.data as {
        data?: SocialPlan[];
        page?: { nextCursor?: string | null };
    };

    return {
        data: Array.isArray(payload.data) ? payload.data : [],
        nextCursor: payload.page?.nextCursor ?? null,
    };
}

async function listAllPlansForPerson(params: {
    personId: string;
    signal?: AbortSignal;
}): Promise<SocialPlan[]> {
    const plans: SocialPlan[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;

    while (pageCount < PERSON_EVENTS_PAGE_CAP) {
        if (params.signal?.aborted) {
            return plans;
        }

        pageCount += 1;
        const response = await listPlans(
            {
                scope: "all",
                state: PERSON_EVENTS_STATES,
                participantPersonId: params.personId,
                sort: "-updatedAt",
                limit: PERSON_EVENTS_PAGE_LIMIT,
                ...(cursor ? { cursor } : {}),
            },
            { signal: params.signal }
        );

        const page = parsePersonPlansPage(response);
        plans.push(...page.data);

        if (!page.nextCursor) return plans;
        cursor = page.nextCursor;
    }

    throw new Error("Person events pagination safety cap reached");
}

function EventsSkeletonRows() {
    const pulseAnim = useRef(new Animated.Value(0.45)).current;

    React.useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.85,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.45,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
            ])
        ).start();
    }, [pulseAnim]);

    return (
        <YStack gap="$2">
            {[0, 1, 2].map((row) => (
                <Animated.View
                    key={row}
                    style={{
                        opacity: pulseAnim,
                        borderRadius: 14,
                        backgroundColor: palette.linen,
                        height: 76,
                    }}
                />
            ))}
        </YStack>
    );
}

export function PersonEventsSection({
    personId,
    onOpenPlan,
}: PersonEventsSectionProps) {
    const reducedMotion = useReducedMotionPreference();

    const queryKey = useMemo(
        () => [
            ...getListPlansQueryKey({
                scope: "all",
                state: PERSON_EVENTS_STATES,
                participantPersonId: personId,
                sort: "-updatedAt",
                limit: PERSON_EVENTS_PAGE_LIMIT,
            }),
            "person-events",
            personId,
        ],
        [personId]
    );

    const {
        data: plans = [],
        isLoading,
        isError,
        isFetching,
        refetch,
    } = useQuery({
        queryKey,
        queryFn: ({ signal }) => listAllPlansForPerson({ personId, signal }),
    });

    const { upcoming, history } = useMemo(
        () => buildPersonEventSections(plans),
        [plans]
    );

    const hasEvents = upcoming.length > 0 || history.length > 0;

    return (
        <YStack marginBottom="$5" gap="$2">
            <Text
                fontFamily="$body"
                fontSize={11}
                fontWeight="600"
                color="$colorTertiary"
                letterSpacing={1}
                textTransform="uppercase"
                marginBottom="$1"
            >
                Events
            </Text>

            {isLoading ? <EventsSkeletonRows /> : null}

            {!isLoading && isError ? (
                <YStack
                    borderRadius="$6"
                    borderWidth={1}
                    borderColor="$borderColorSubtle"
                    backgroundColor="$backgroundStrong"
                    padding="$3"
                    gap="$2"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        color="$colorSecondary"
                    >
                        Couldn't load events right now.
                    </Text>
                    <XStack
                        alignSelf="flex-start"
                        paddingHorizontal="$2.5"
                        paddingVertical="$1.5"
                        borderRadius="$4"
                        backgroundColor="$accentBackground"
                        onPress={() => refetch()}
                        pressStyle={{
                            scale: 0.98,
                            backgroundColor: "$accentBackgroundPress",
                        }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel="Retry loading events"
                        cursor="pointer"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$2"
                            fontWeight="600"
                            color="$accentColor"
                        >
                            {isFetching ? "Retrying..." : "Retry"}
                        </Text>
                    </XStack>
                </YStack>
            ) : null}

            {!isLoading && !isError && !hasEvents ? (
                <Text
                    fontFamily="$body"
                    fontSize="$3"
                    color="$colorSecondary"
                >
                    No events with this person yet.
                </Text>
            ) : null}

            {!isLoading && !isError && upcoming.length > 0 ? (
                <YStack>
                    <PlansSectionHeader title="Upcoming" count={upcoming.length} />
                    {upcoming.map((plan, index) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            onPress={(pressedPlan) => onOpenPlan(pressedPlan.id)}
                            variant="compact"
                            index={index}
                            reducedMotion={reducedMotion}
                        />
                    ))}
                </YStack>
            ) : null}

            {!isLoading && !isError && history.length > 0 ? (
                <YStack>
                    <PlansSectionHeader title="History" count={history.length} />
                    {history.map((plan, index) => (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            onPress={(pressedPlan) => onOpenPlan(pressedPlan.id)}
                            variant="compact"
                            index={index}
                            reducedMotion={reducedMotion}
                        />
                    ))}
                </YStack>
            ) : null}
        </YStack>
    );
}
