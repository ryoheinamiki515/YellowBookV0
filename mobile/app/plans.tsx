import React, { useState } from "react";
import { View, Text, TextInput, Button, FlatList } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

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

    // note: Orval fetch wrapper returns { status, data, headers }
    // Our SocialPlanListResponse has a 'data' field containing the array of SocialPlan
    const resData = plansQuery.data;
    const items = resData?.status === 200 ? resData.data.data : [];

    return (
        <View style={{ padding: 16, gap: 12, paddingTop: 60 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={{ fontSize: 24, fontWeight: "700" }}>Plans</Text>
                <Button title="Sign Out" onPress={signOut} color="#ef4444" />
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                    value={intentText}
                    onChangeText={setIntentText}
                    placeholder="let’s do lunch Thursday?"
                    style={{ flex: 1, borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 10, backgroundColor: "#f9f9f9" }}
                />
                <View style={{ borderRadius: 10, overflow: 'hidden' }}>
                    <Button
                        title={createPlan.isPending ? "…" : "Add"}
                        disabled={!intentText.trim() || createPlan.isPending}
                        onPress={() =>
                            createPlan.mutate({
                                data: {
                                    intentText: intentText.trim(),
                                    timePrecision: "UNSPECIFIED",
                                } as any,
                            })
                        }
                    />
                </View>
            </View>

            {plansQuery.isLoading ? <Text style={{ textAlign: 'center', marginTop: 20 }}>Loading…</Text> : null}

            {plansQuery.isError ? (
                <View style={{ backgroundColor: "#fee2e2", padding: 12, borderRadius: 8 }}>
                    <Text style={{ color: "#b91c1c" }}>
                        {(plansQuery.error as any)?.problem?.title ||
                            (plansQuery.error as any)?.title ||
                            (plansQuery.error as any)?.message ||
                            "Failed to load plans"}
                    </Text>
                </View>
            ) : null}

            <FlatList
                data={items}
                keyExtractor={(p: any) => p.id}
                contentContainerStyle={{ paddingBottom: 40 }}
                renderItem={({ item }: any) => (
                    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
                        <Text style={{ fontSize: 16, fontWeight: "600", color: "#111" }}>{item.intentText}</Text>
                        {item.contextNote ? <Text style={{ color: "#666", marginTop: 4 }}>{item.contextNote}</Text> : null}
                        <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                            <View style={{ backgroundColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 12, color: '#4b5563' }}>{item.state}</Text>
                            </View>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    !plansQuery.isLoading ? (
                        <Text style={{ textAlign: 'center', color: '#999', marginTop: 40 }}>No plans yet. Add one above!</Text>
                    ) : null
                }
            />
        </View>
    );
}
