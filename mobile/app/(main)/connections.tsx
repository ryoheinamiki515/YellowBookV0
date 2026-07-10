import React, { useCallback } from "react";
import { Alert, Platform, Share } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { YStack, XStack, Text, View, ScrollView } from "tamagui";
import { useQueryClient } from "@tanstack/react-query";

import { PageContainer } from "../../src/components/PageContainer";
import { DetailFooterAction } from "../../src/components/DetailFooterAction";
import { useConfirm } from "../../src/components/ConfirmDialog";
import {
    useCreateConnectionInvite,
    useListConnections,
    useDeleteConnection,
    getListConnectionsQueryKey,
} from "../../src/api/generated/connections/connections";
import type { Connection } from "../../src/api/generated/model/connection";
import { Avatar } from "../../src/components/Avatar";
import { avatarProps, connectionToAvatarPerson } from "../../src/lib/avatarPerson";
import { getProblemDetail } from "../../src/lib/problemDetails";

function ConnectionRow({
    connection,
    onDelete,
}: {
    connection: Connection;
    onDelete: (id: string) => void;
}) {
    const name = connection.targetDisplayName ?? "Connected User";

    return (
        <XStack
            alignItems="center"
            gap="$3"
            paddingVertical="$3"
            paddingHorizontal="$4"
            borderRadius="$5"
            backgroundColor="$surface"
            borderWidth={1}
            borderColor="$borderColorSubtle"
        >
            <Avatar {...avatarProps(connectionToAvatarPerson(connection))} size={40} />

            <YStack flex={1}>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                >
                    {name}
                </Text>
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    color="$colorTertiary"
                >
                    Connected
                </Text>
            </YStack>

            <Text
                fontFamily="$body"
                fontSize="$2"
                color="$destructiveColor"
                onPress={() => onDelete(connection.id)}
                pressStyle={{ opacity: 0.7 }}
                cursor="pointer"
            >
                Remove
            </Text>
        </XStack>
    );
}

export default function ConnectionsScreen() {
    const router = useRouter();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    const { data: connectionsResponse, isLoading } = useListConnections();
    const connections: Connection[] =
        connectionsResponse?.data && "data" in connectionsResponse.data
            ? (connectionsResponse.data as { data: Connection[] }).data
            : [];

    const createInvite = useCreateConnectionInvite();
    const deleteConnection = useDeleteConnection();

    const handleInvite = useCallback(() => {
        createInvite.mutate(undefined, {
            onSuccess: (response) => {
                const data = response.data as any;
                const url = data?.data?.url;
                if (!url) return;

                if (Platform.OS === "web") {
                    navigator.clipboard?.writeText(url);
                    Alert.alert("Copied!", "Invite link copied to clipboard.");
                } else {
                    Share.share({
                        message: `Connect with me on YellowBook!\n${url}`,
                    });
                }
            },
            onError: (error) => {
                const detail = getProblemDetail(error);
                if (detail.includes("display_name_required")) {
                    router.push("/complete-profile" as any);
                    return;
                }

                Alert.alert("Error", detail || "Could not create invite link.");
            },
        });
    }, [createInvite, router]);

    const handleDeleteConnection = useCallback(
        async (connectionId: string) => {
            const confirmed = await confirm({
                title: "Remove connection?",
                message:
                    "You will no longer receive shared plans from this person. Their contact will remain in your People library.",
                confirmLabel: "Remove",
                destructive: true,
            });
            if (!confirmed) return;

            deleteConnection.mutate(
                { connectionId },
                {
                    onSettled: () => {
                        queryClient.invalidateQueries({
                            queryKey: getListConnectionsQueryKey(),
                        });
                    },
                }
            );
        },
        [confirm, deleteConnection, queryClient]
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <PageContainer backgroundColor="$background">
                <YStack flex={1}>
                    <XStack
                        alignItems="center"
                        paddingHorizontal="$6"
                        paddingTop="$6"
                        marginBottom="$4"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            color="$accentColor"
                            onPress={() => router.back()}
                            pressStyle={{ opacity: 0.7 }}
                            cursor="pointer"
                        >
                            Back
                        </Text>
                        <Text
                            fontFamily="$heading"
                            fontSize="$8"
                            color="$color"
                            flex={1}
                            textAlign="center"
                        >
                            Connections
                        </Text>
                        <View width={40} />
                    </XStack>

                    <YStack paddingHorizontal="$6" marginBottom="$4">
                        <DetailFooterAction
                            label="Invite a Friend"
                            onPress={handleInvite}
                            accessibilityLabel="Create and share an invite link"
                            tone="accent"
                            variant="filled"
                            disabled={createInvite.isPending}
                        />
                    </YStack>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{
                            paddingHorizontal: 24,
                            paddingBottom: 24,
                        }}
                    >
                        {isLoading ? (
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                color="$colorTertiary"
                                textAlign="center"
                                marginTop="$8"
                            >
                                Loading...
                            </Text>
                        ) : connections.length === 0 ? (
                            <YStack
                                alignItems="center"
                                paddingTop="$8"
                                gap="$3"
                            >
                                <Text
                                    fontFamily="$heading"
                                    fontSize="$7"
                                    color="$color"
                                    textAlign="center"
                                >
                                    No connections yet
                                </Text>
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    color="$colorSecondary"
                                    textAlign="center"
                                    lineHeight="$5"
                                >
                                    Invite friends to connect. Once connected,
                                    you can share plans directly.
                                </Text>
                            </YStack>
                        ) : (
                            <YStack gap="$2.5">
                                {connections.map((conn) => (
                                    <ConnectionRow
                                        key={conn.id}
                                        connection={conn}
                                        onDelete={handleDeleteConnection}
                                    />
                                ))}
                            </YStack>
                        )}
                    </ScrollView>
                </YStack>
            </PageContainer>
        </SafeAreaView>
    );
}
