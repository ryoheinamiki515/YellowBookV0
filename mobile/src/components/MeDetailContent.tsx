import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Easing,
    Platform,
    Pressable,
    ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Settings, Camera } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View, useMedia } from "tamagui";
import type { PersonBirthday } from "../api/generated/model/personBirthday";
import {
    getGetMeQueryKey,
    usePatchMe,
    useCreateProfileImageUpload,
    useDeleteProfileImage,
} from "../api/generated/system/system";
import { useMeProfile } from "../hooks/useMeProfile";
import { useAuth } from "../context/AuthContext";
import { useConfirm } from "./ConfirmDialog";
import { ProfileFields } from "./ProfileFields";
import { Avatar } from "./Avatar";
import { avatarProps, meToAvatarPerson } from "../lib/avatarPerson";
import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetSecondaryButton,
} from "./BottomSheetPrimitives";
import { useReducedMotionPreference } from "../lib/planHelpers";
import { palette } from "../../tamagui.config";

type MeDetailContentProps = {
    onClose: () => void;
};

export function MeDetailContent({ onClose }: MeDetailContentProps) {
    const router = useRouter();
    const confirm = useConfirm();
    const media = useMedia();
    const isDesktopWeb = media.lg && Platform.OS === "web";
    const queryClient = useQueryClient();
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const { me, isLoading } = useMeProfile();
    const patchMe = usePatchMe();
    const createUpload = useCreateProfileImageUpload();
    const deleteImage = useDeleteProfileImage();
    const { signOut } = useAuth();

    const [accountSheetOpen, setAccountSheetOpen] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // Entrance animation
    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(
        new Animated.Value(reducedMotion ? 0 : 24)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    const handlePatchField = useCallback(
        (data: Record<string, unknown>) => {
            patchMe.mutate(
                { data },
                {
                    onSuccess: (response) => {
                        queryClient.setQueryData(getGetMeQueryKey(), response);
                    },
                }
            );
        },
        [patchMe, queryClient]
    );

    const handleSaveDisplayName = useCallback(
        (text: string) => handlePatchField({ displayName: text }),
        [handlePatchField]
    );

    const handleSaveBirthday = useCallback(
        (birthday: PersonBirthday | null) => {
            handlePatchField({ birthday });
        },
        [handlePatchField]
    );

    const handlePickAndUploadImage = useCallback(async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (result.canceled || !result.assets?.[0]) return;

        setIsUploadingImage(true);
        try {
            const manipulated = await manipulateAsync(
                result.assets[0].uri,
                [{ resize: { width: 512 } }],
                { compress: 0.85, format: SaveFormat.JPEG }
            );

            const uploadResponse = await createUpload.mutateAsync(undefined);
            const { uploadUrl, publicUrl } = (uploadResponse as any).data.data;

            const imageBlob = await fetch(manipulated.uri).then((r) => r.blob());
            const putResponse = await fetch(uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": "image/jpeg" },
                body: imageBlob,
            });

            if (!putResponse.ok) {
                throw new Error(`R2 upload failed: ${putResponse.status}`);
            }

            handlePatchField({ profileImageUrl: publicUrl });
        } catch {
            Alert.alert("Upload failed", "Could not upload your photo. Please try again.");
        } finally {
            setIsUploadingImage(false);
        }
    }, [createUpload, handlePatchField]);

    const handleRemoveImage = useCallback(async () => {
        const confirmed = await confirm({
            title: "Remove photo?",
            message: "Your profile will show your initials instead.",
            confirmLabel: "Remove",
            destructive: true,
        });
        if (!confirmed) return;

        handlePatchField({ profileImageUrl: null });
        deleteImage.mutate(undefined, {
            onSettled: () =>
                queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
        });
    }, [confirm, handlePatchField, deleteImage, queryClient]);

    const handleSignOut = useCallback(async () => {
        const confirmed = await confirm({
            title: "Sign out?",
            message: "You can always sign back in.",
            confirmLabel: "Sign Out",
            destructive: true,
        });
        if (confirmed) {
            setAccountSheetOpen(false);
            signOut();
        }
    }, [signOut, confirm]);

    // Loading state
    if (isLoading || !me) {
        return (
            <YStack
                flex={1}
                backgroundColor="$background"
                justifyContent="center"
                alignItems="center"
            >
                <Animated.View
                    style={{ opacity: 0.5, width: "85%", gap: 16 }}
                >
                    <View
                        width="40%"
                        height={16}
                        borderRadius={8}
                        backgroundColor={palette.sand}
                    />
                    <View
                        width="80%"
                        height={24}
                        borderRadius={12}
                        backgroundColor={palette.sand}
                    />
                    <View
                        width="60%"
                        height={14}
                        borderRadius={7}
                        backgroundColor={palette.sand}
                    />
                </Animated.View>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background" position="relative">
            {/* Navigation bar */}
            <XStack
                paddingHorizontal="$5"
                paddingVertical="$3"
                alignItems="center"
                justifyContent="space-between"
            >
                <Pressable
                    onPress={() => onClose()}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$accentColor"
                        fontWeight="500"
                    >
                        Back
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => setAccountSheetOpen(true)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Account settings"
                >
                    <Settings size={22} color={palette.walnut} strokeWidth={1.8} />
                </Pressable>
            </XStack>

            <ScrollView
                contentContainerStyle={{
                    paddingHorizontal: 24,
                    paddingBottom: isDesktopWeb ? 24 : 80,
                }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Animated.View
                    style={{
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                    }}
                >
                    {/* Profile avatar */}
                    <YStack alignItems="center" marginBottom="$5">
                        <Pressable
                            onPress={handlePickAndUploadImage}
                            disabled={isUploadingImage}
                            accessibilityRole="button"
                            accessibilityLabel="Change profile photo"
                        >
                            <View position="relative">
                                <Avatar
                                    {...avatarProps(meToAvatarPerson(me))}
                                    size={80}
                                />
                                {isUploadingImage ? (
                                    <View
                                        position="absolute"
                                        top={0}
                                        left={0}
                                        right={0}
                                        bottom={0}
                                        borderRadius={40}
                                        backgroundColor="rgba(0,0,0,0.3)"
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <ActivityIndicator color="white" />
                                    </View>
                                ) : (
                                    <View
                                        position="absolute"
                                        bottom={0}
                                        right={0}
                                        width={24}
                                        height={24}
                                        borderRadius={12}
                                        backgroundColor="$accentColor"
                                        justifyContent="center"
                                        alignItems="center"
                                        borderWidth={2}
                                        borderColor="$background"
                                    >
                                        <Camera size={12} color="white" />
                                    </View>
                                )}
                            </View>
                        </Pressable>
                        {me.profileImageUrl && !isUploadingImage && (
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$destructiveColor"
                                marginTop="$2"
                                onPress={handleRemoveImage}
                                pressStyle={{ opacity: 0.7 }}
                                cursor="pointer"
                            >
                                Remove photo
                            </Text>
                        )}
                    </YStack>

                    <ProfileFields
                        displayName={me.displayName ?? ""}
                        birthday={me.birthday as PersonBirthday | undefined}
                        onSaveDisplayName={handleSaveDisplayName}
                        onSaveBirthday={handleSaveBirthday}
                    />
                </Animated.View>
            </ScrollView>

            {/* Account settings sheet */}
            <BottomSheetModal
                open={accountSheetOpen}
                onOpenChange={setAccountSheetOpen}
            >
                <BottomSheetHeader title="Account" />
                <YStack gap="$3">
                    <BottomSheetPrimaryButton
                        label="Connections"
                        onPress={() => {
                            setAccountSheetOpen(false);
                            router.push("/connections" as any);
                        }}
                        accessibilityLabel="Manage connections"
                    />
                    <BottomSheetSecondaryButton
                        label="Sign Out"
                        onPress={() => {
                            void handleSignOut();
                        }}
                        accessibilityLabel="Sign out"
                    />
                </YStack>
            </BottomSheetModal>
        </YStack>
    );
}
