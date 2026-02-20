import React, { useState } from "react";
import { FlatList } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, Button, Input, Spinner, Theme } from "tamagui";

// names depend on operationIds; with yours it should be useListPlans/useCreatePlan
import { useListPlans, useCreatePlan, getListPlansQueryKey } from "../src/api/generated/plans/plans";
import { useAuth } from "../src/context/AuthContext";

export default function PlansScreen() {
    const { signOut } = useAuth();
    const qc = useQueryClient();
    const [intentText, setIntentText] = useState("");

    const plansQuery = useListPlans(
        { limit: 50 }, // params object depends on your spec
        {
            query: {
                // optional: keep it feeling snappy
                staleTime: 10_000,
            }
        }
    );

    const createPlan = useCreatePlan({
        mutation: {
            onSuccess: () => {
                // re-fetch list after create
                qc.invalidateQueries({ queryKey: getListPlansQueryKey({ limit: 50 }) });
                setIntentText("");
            },
        },
    });

    const resData = plansQuery.data;
    const items = resData?.status === 200 ? resData.data.data : [];

    return (
        <YStack flex={1} backgroundColor="$background" padding="$true" gap="$3" paddingTop="$10">
            <XStack justifyContent="space-between" alignItems="center" marginBottom="$4">
                <Text fontFamily="$heading" fontSize="$8" fontWeight="700" color="$color">
                    Plans
                </Text>
                <Button size="$3" theme="red" onPress={signOut}>
                    Sign Out
                </Button>
            </XStack>

            <XStack gap="$2" alignItems="center">
                <Input
                    flex={1}
                    size="$4"
                    value={intentText}
                    onChangeText={setIntentText}
                    placeholder="let’s do lunch Thursday?"
                    borderRadius="$true"
                    backgroundColor="$backgroundPress"
                />
                <Button
                    size="$4"
                    theme="active"
                    disabled={!intentText.trim() || createPlan.isPending}
                    icon={createPlan.isPending ? <Spinner /> : undefined}
                    onPress={() =>
                        createPlan.mutate({
                            data: {
                                intentText: intentText.trim(),
                                timePrecision: "UNSPECIFIED",
                            } as any,
                        })
                    }
                >
                    {!createPlan.isPending && "Add"}
                </Button>
            </XStack>

            {plansQuery.isLoading && (
                <Text textAlign="center" marginTop="$5" color="$color">
                    Loading…
                </Text>
            )}

            {plansQuery.isError && (
                <Theme name="red">
                    <YStack backgroundColor="$background" padding="$3" borderRadius="$true">
                        <Text color="$color">
                            {(plansQuery.error as any)?.problem?.title ||
                                (plansQuery.error as any)?.title ||
                                (plansQuery.error as any)?.message ||
                                "Failed to load plans"}
                        </Text>
                    </YStack>
                </Theme>
            )}

            <FlatList
                data={items}
                keyExtractor={(p: any) => p.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }: any) => (
                    <YStack paddingVertical="$3" borderBottomWidth={1} borderColor="$borderColor">
                        <Text fontFamily="$body" fontSize="$4" fontWeight="600" color="$color">
                            {item.intentText}
                        </Text>
                        {item.contextNote ? (
                            <Text color="$color" opacity={0.7} marginTop="$1">
                                {item.contextNote}
                            </Text>
                        ) : null}
                        <XStack marginTop="$2" gap="$2">
                            <YStack backgroundColor="$backgroundPress" paddingHorizontal="$2" paddingVertical="$1" borderRadius="$true">
                                <Text fontSize="$1" color="$color">
                                    {item.state}
                                </Text>
                            </YStack>
                        </XStack>
                    </YStack>
                )}
                ListEmptyComponent={
                    !plansQuery.isLoading ? (
                        <Text textAlign="center" color="$color" opacity={0.7} marginTop="$10">
                            No plans yet. Add one above!
                        </Text>
                    ) : null
                }
            />
        </YStack>
    );
}

