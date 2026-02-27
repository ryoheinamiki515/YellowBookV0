import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, ScrollView } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text, View, XStack, YStack } from "tamagui";

import { PageContainer } from "../../src/components/PageContainer";
import { TodayDateChip } from "../../src/components/DateChip";
import {
    getListPlansQueryKey,
    useListPlans,
} from "../../src/api/generated/plans/plans";
import { useListPeople } from "../../src/api/generated/people/people";
import type { Person } from "../../src/api/generated/model/person";
import type { SocialPlan } from "../../src/api/generated/model/socialPlan";
import {
    CreatePlanSheet,
    type CreatePlanParticipantPrefill,
} from "../../src/components/plans/CreatePlanSheet";
import { useAuth } from "../../src/context/AuthContext";
import { getInitialColor } from "../../src/lib/planHelpers";

type CreatePlanSeed = {
    intentText?: string;
    participants?: CreatePlanParticipantPrefill[];
};

function PersonStarterChip({
    person,
    onPress,
}: {
    person: Person;
    onPress: (person: Person) => void;
}) {
    const initial = person.displayName.charAt(0).toUpperCase();

    return (
        <YStack
            borderRadius="$10"
            borderWidth={1}
            borderColor="$borderColorSubtle"
            backgroundColor="$backgroundStrong"
            paddingHorizontal="$3"
            height={40}
            justifyContent="center"
            onPress={() => onPress(person)}
            pressStyle={{ scale: 0.98 }}
            // @ts-ignore
            animation="fast"
            accessibilityRole="button"
            accessibilityLabel={`Start plan with ${person.displayName}`}
            cursor="pointer"
        >
            <XStack alignItems="center" gap="$2">
                <View
                    width={22}
                    height={22}
                    borderRadius={11}
                    justifyContent="center"
                    alignItems="center"
                    backgroundColor={getInitialColor(person.displayName)}
                >
                    <Text
                        fontFamily="$body"
                        fontSize={11}
                        fontWeight="600"
                        color="white"
                    >
                        {initial}
                    </Text>
                </View>

                <Text
                    fontFamily="$body"
                    fontSize="$3"
                    color="$colorSecondary"
                    numberOfLines={1}
                >
                    {person.displayName}
                </Text>
            </XStack>
        </YStack>
    );
}

export default function FeedScreen() {
    const { signOut } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [planSheetOpen, setPlanSheetOpen] = useState(false);
    const [planSeed, setPlanSeed] = useState<CreatePlanSeed | null>(null);

    const {
        data: peopleResponse,
        isLoading: isPeopleLoading,
        isError: isPeopleError,
        isRefetching: isPeopleRefetching,
        refetch: refetchPeople,
    } = useListPeople(undefined);
    const {
        data: plansResponse,
        isLoading: isPlansLoading,
        isRefetching: isPlansRefetching,
        refetch: refetchPlans,
    } = useListPlans({
        state: ["OPEN"],
        sort: "-updatedAt",
    });

    const peopleData = peopleResponse?.data;
    const people: Person[] =
        peopleData && "data" in peopleData
            ? (peopleData as { data: Person[] }).data
            : [];
    const plansData = plansResponse?.data;
    const openPlans: SocialPlan[] =
        plansData && "data" in plansData
            ? (plansData as { data: SocialPlan[] }).data
            : [];

    const activePeople = useMemo(
        () => people.filter((person) => !person.archivedAt),
        [people]
    );
    const starterPeople = useMemo(
        () => activePeople.slice(0, 4),
        [activePeople]
    );
    const missingTimePlans = useMemo(
        () =>
            openPlans.filter(
                (plan) =>
                    !plan.anchorStart ||
                    plan.timePrecision === "UNSPECIFIED" ||
                    plan.timePrecision === "WINDOW" ||
                    plan.timePrecision === "NONE"
            ),
        [openPlans]
    );
    const missingTimeCandidate = missingTimePlans[0];
    const missingTimeCount = missingTimePlans.length;
    const missingTimeLabel =
        missingTimeCount === 1
            ? "Set time on 1 plan"
            : `Set time on ${missingTimeCount} plans`;

    const peopleSummary = isPeopleLoading
        ? "Loading people..."
        : activePeople.length === 0
          ? "Add someone to make your first plan."
          : `${activePeople.length} people ready`;

    const openCreatePlanSheet = useCallback((seed?: CreatePlanSeed) => {
        setPlanSeed(seed ?? null);
        setPlanSheetOpen(true);
    }, []);

    const handlePlanSheetOpenChange = useCallback((open: boolean) => {
        setPlanSheetOpen(open);
        if (!open) {
            setPlanSeed(null);
        }
    }, []);

    const handlePlanCreated = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
    }, [queryClient]);

    const handleSignOut = useCallback(() => {
        Alert.alert("Sign out?", "You can always sign back in.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign Out", style: "destructive", onPress: signOut },
        ]);
    }, [signOut]);

    const handleStartWithPerson = useCallback(
        (person: Person) => {
            openCreatePlanSheet({
                intentText: `Catch up with ${person.displayName}`,
                participants: [
                    {
                        personId: person.id,
                        displayName: person.displayName,
                        isPrimary: true,
                    },
                ],
            });
        },
        [openCreatePlanSheet]
    );

    const handleSetMissingTime = useCallback(() => {
        if (!missingTimeCandidate) return;
        router.push(`/plan/${missingTimeCandidate.id}?focus=when`);
    }, [missingTimeCandidate, router]);

    const handleRefresh = useCallback(() => {
        void refetchPeople();
        void refetchPlans();
    }, [refetchPeople, refetchPlans]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <YStack paddingHorizontal="$6" paddingTop="$4" paddingBottom="$3">
                    <XStack justifyContent="space-between" alignItems="flex-start">
                        <YStack flex={1}>
                            <Text
                                fontFamily="$heading"
                                fontSize="$9"
                                color="$color"
                            >
                                Feed
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$3"
                                color="$colorSecondary"
                                marginTop="$1"
                            >
                                Keep this simple. Start one plan.
                            </Text>
                        </YStack>

                        <XStack alignItems="center" gap="$2">
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

                    <XStack alignItems="center" gap="$2" marginTop="$1" flexWrap="wrap">
                        <TodayDateChip />
                        <Text
                            fontFamily="$body"
                            fontSize="$2"
                            color="$colorTertiary"
                        >
                            {peopleSummary}
                        </Text>
                    </XStack>
                </YStack>

                <View
                    height={1}
                    backgroundColor="$borderColorSubtle"
                    marginHorizontal="$6"
                />

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingTop: 16,
                        paddingBottom: 24,
                    }}
                    refreshControl={
                        <RefreshControl
                            refreshing={Boolean(
                                isPeopleRefetching || isPlansRefetching
                            )}
                            onRefresh={handleRefresh}
                        />
                    }
                >
                    <YStack
                        backgroundColor="$surface"
                        borderRadius="$8"
                        borderWidth={1}
                        borderColor="$borderColorSubtle"
                        padding="$5"
                        gap="$4"
                    >
                        <YStack gap="$2">
                            <Text
                                fontFamily="$heading"
                                fontSize="$8"
                                color="$color"
                            >
                                Ready for the next touchpoint?
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                color="$colorSecondary"
                                lineHeight="$5"
                            >
                                Start a plan now and fill in details as you go.
                            </Text>
                        </YStack>

                        <YStack
                            height={48}
                            borderRadius="$6"
                            backgroundColor="$accentBackground"
                            justifyContent="center"
                            alignItems="center"
                            onPress={() => openCreatePlanSheet()}
                            pressStyle={{
                                scale: 0.98,
                                backgroundColor: "$accentBackgroundPress",
                            }}
                            // @ts-ignore
                            animation="fast"
                            accessibilityRole="button"
                            accessibilityLabel="Start a new plan"
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
                                Start a new plan
                            </Text>
                        </YStack>

                        {!isPlansLoading && missingTimeCount > 0 ? (
                            <YStack
                                minHeight={48}
                                borderRadius="$6"
                                borderWidth={1}
                                borderColor="$borderColorSubtle"
                                backgroundColor="$backgroundStrong"
                                justifyContent="center"
                                paddingHorizontal="$4"
                                onPress={handleSetMissingTime}
                                pressStyle={{ scale: 0.98 }}
                                // @ts-ignore
                                animation="fast"
                                accessibilityRole="button"
                                accessibilityLabel={missingTimeLabel}
                                cursor="pointer"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$3"
                                    fontWeight="600"
                                    color="$colorSecondary"
                                >
                                    {missingTimeLabel}
                                </Text>
                                {missingTimeCandidate ? (
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$2"
                                        color="$colorTertiary"
                                        marginTop="$1"
                                        numberOfLines={1}
                                    >
                                        Next: {missingTimeCandidate.intentText}
                                    </Text>
                                ) : null}
                            </YStack>
                        ) : null}

                        {starterPeople.length > 0 ? (
                            <YStack gap="$2">
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    color="$colorTertiary"
                                >
                                    Start with someone
                                </Text>
                                <XStack flexWrap="wrap" gap="$2">
                                    {starterPeople.map((person) => (
                                        <PersonStarterChip
                                            key={person.id}
                                            person={person}
                                            onPress={handleStartWithPerson}
                                        />
                                    ))}
                                </XStack>
                            </YStack>
                        ) : (
                            <YStack
                                minHeight={40}
                                borderRadius="$6"
                                borderWidth={1}
                                borderColor="$borderColorSubtle"
                                justifyContent="center"
                                alignItems="center"
                                onPress={() => router.push("/people")}
                                pressStyle={{ scale: 0.98 }}
                                // @ts-ignore
                                animation="fast"
                                accessibilityRole="button"
                                accessibilityLabel="Add someone first"
                                cursor="pointer"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$3"
                                    fontWeight="600"
                                    color="$colorSecondary"
                                >
                                    Add someone first
                                </Text>
                            </YStack>
                        )}

                        {isPeopleError ? (
                            <YStack alignItems="flex-start" gap="$2">
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    color="$colorTertiary"
                                >
                                    Couldn't refresh people right now.
                                </Text>
                                <YStack
                                    minHeight={34}
                                    paddingHorizontal="$3"
                                    borderRadius="$6"
                                    backgroundColor="$backgroundStrong"
                                    justifyContent="center"
                                    alignItems="center"
                                    onPress={handleRefresh}
                                    pressStyle={{ scale: 0.98 }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Retry loading people"
                                    cursor="pointer"
                                >
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$2"
                                        fontWeight="600"
                                        color="$colorSecondary"
                                    >
                                        Retry
                                    </Text>
                                </YStack>
                            </YStack>
                        ) : null}
                    </YStack>
                </ScrollView>

                <CreatePlanSheet
                    open={planSheetOpen}
                    onOpenChange={handlePlanSheetOpenChange}
                    onCreated={handlePlanCreated}
                    initialIntentText={planSeed?.intentText}
                    initialParticipants={planSeed?.participants}
                    subtitle="What would you like to do?"
                />
            </PageContainer>
        </SafeAreaView>
    );
}
