import React from "react";
import { Text, View, XStack, YStack } from "tamagui";

import type { SharedPlanPerson } from "../../api/generated/model/sharedPlanPerson";
import type { SocialPlanState } from "../../api/generated/model/socialPlanState";
import type { SocialPlanTimePrecision } from "../../api/generated/model/socialPlanTimePrecision";
import { Avatar } from "../Avatar";
import { fromStorageFields, formatDisplay } from "../../lib/planWhen";
import { getSharedPeopleForDisplay } from "../../lib/sharedPeople";

type PlanReadOnlyParticipant = {
    id: string;
    displayName?: string | null;
};

export type PlanReadOnlyDetailData = {
    ownerDisplayName?: string | null;
    intentText: string;
    locationText?: string | null;
    state: SocialPlanState;
    timePrecision: SocialPlanTimePrecision;
    anchorStart?: string | null;
    anchorEnd?: string | null;
    participants: PlanReadOnlyParticipant[];
    sharedPeople?: SharedPlanPerson[] | null;
    createdAt: string;
    updatedAt: string;
};

export function formatPlanWhenDisplay(
    timePrecision: SocialPlanTimePrecision,
    anchorStart: string | null | undefined,
    anchorEnd: string | null | undefined
): { primary: string | null; secondary: string | null } {
    return formatDisplay(fromStorageFields({
        timePrecision,
        anchorStart: anchorStart ?? null,
        anchorEnd: anchorEnd ?? null,
        timezone: null,
    }));
}

function PlanSectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <Text
            fontFamily="$body"
            fontSize={11}
            fontWeight="600"
            color="$colorTertiary"
            letterSpacing={1}
            textTransform="uppercase"
        >
            {children}
        </Text>
    );
}

function formatMetadataDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return "Unknown";
    }

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function PlanStateBadge({ state }: { state: SocialPlanState }) {
    const isDone = state === "DONE";
    const isDropped = state === "DROPPED";

    return (
        <View
            alignSelf="flex-start"
            backgroundColor={
                isDone
                    ? "$successBackground"
                    : isDropped
                      ? "$destructiveBackground"
                      : "$backgroundStrong"
            }
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            borderRadius="$12"
        >
            <Text
                fontFamily="$body"
                fontSize="$2"
                fontWeight="600"
                color={
                    isDone
                        ? "$successColor"
                        : isDropped
                          ? "$destructiveColor"
                          : "$colorSecondary"
                }
            >
                {state === "OPEN" ? "Open" : isDone ? "Done" : "Let go"}
            </Text>
        </View>
    );
}

export function PlanReadOnlyDetails({
    plan,
    preface,
}: {
    plan: PlanReadOnlyDetailData;
    preface?: string | null;
}) {
    const whenDisplay = formatPlanWhenDisplay(
        plan.timePrecision,
        plan.anchorStart,
        plan.anchorEnd
    );
    const people = getSharedPeopleForDisplay(plan, {
        localizeViewer: true,
    });

    return (
        <YStack gap="$5">
            {preface ? (
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    color="$colorSecondary"
                >
                    {preface}
                </Text>
            ) : null}

            {plan.ownerDisplayName ? (
                <Text
                    fontFamily="$body"
                    fontSize="$3"
                    color="$colorSecondary"
                >
                    Shared by {plan.ownerDisplayName}
                </Text>
            ) : null}

            <PlanStateBadge state={plan.state} />

            <YStack>
                <Text fontFamily="$heading" fontSize={32} color="$color">
                    {plan.intentText || "Untitled plan"}
                </Text>
            </YStack>

            <YStack gap="$1">
                <PlanSectionLabel>When</PlanSectionLabel>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    color={whenDisplay.primary ? "$color" : "$colorTertiary"}
                    fontStyle={whenDisplay.primary ? "normal" : "italic"}
                >
                    {whenDisplay.primary || "Not set"}
                </Text>
                {whenDisplay.secondary ? (
                    <Text
                        fontFamily="$body"
                        fontSize="$2"
                        color="$colorTertiary"
                    >
                        {whenDisplay.secondary}
                    </Text>
                ) : null}
            </YStack>

            <YStack gap="$1">
                <PlanSectionLabel>Where</PlanSectionLabel>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    color={plan.locationText ? "$color" : "$colorTertiary"}
                    fontStyle={plan.locationText ? "normal" : "italic"}
                >
                    {plan.locationText || "Not set"}
                </Text>
            </YStack>

            <YStack gap="$2">
                <PlanSectionLabel>Who</PlanSectionLabel>
                {people.length > 0 ? (
                    <XStack flexWrap="wrap" gap="$2">
                        {people.map((person) => {
                            const name = person.label;

                            return (
                                <XStack
                                    key={person.key}
                                    alignItems="center"
                                    gap="$2"
                                    backgroundColor="$backgroundStrong"
                                    paddingHorizontal="$3"
                                    paddingVertical="$1.5"
                                    borderRadius="$10"
                                >
                                    <Avatar name={name} size={24} />
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$color"
                                    >
                                        {name}
                                    </Text>
                                </XStack>
                            );
                        })}
                    </XStack>
                ) : (
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$colorTertiary"
                        fontStyle="italic"
                    >
                        No one added yet
                    </Text>
                )}
            </YStack>

            <YStack
                paddingTop="$4"
                borderTopWidth={1}
                borderTopColor="$borderColorSubtle"
                gap="$1.5"
            >
                <Text fontFamily="$body" fontSize="$1" color="$colorTertiary">
                    Created {formatMetadataDate(plan.createdAt)}
                </Text>
                <Text fontFamily="$body" fontSize="$1" color="$colorTertiary">
                    Updated {formatMetadataDate(plan.updatedAt)}
                </Text>
            </YStack>
        </YStack>
    );
}
