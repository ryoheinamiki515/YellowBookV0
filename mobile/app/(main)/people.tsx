import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Platform,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { palette } from "../../tamagui.config";
import { YStack, XStack, Text, View, Input, useMedia } from "tamagui";
import { PageContainer } from "../../src/components/PageContainer";
import { PersonDetailContent } from "../../src/components/PersonDetailContent";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "../../src/components/BottomSheetPrimitives";
import { useNativeKeyboardAppearance } from "../../src/components/AppTextInput";

import {
    useListPeople,
    useCreatePerson,
    getListPeopleQueryKey,
} from "../../src/api/generated/people/people";
import type { Person } from "../../src/api/generated/model/person";
import {
    getInitialColor,
    useReducedMotionPreference,
} from "../../src/lib/planHelpers";
import { useDesktopResizableSplitView } from "../../src/hooks/useDesktopResizableSplitView";
import { useSheetSessionState } from "../../src/hooks/useSheetSessionState";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBirthday(person: Person): string | null {
    if (!person.birthday) return null;
    const { month, day, year } = person.birthday;
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthStr = monthNames[month - 1] || `${month}`;
    if (year) return `${monthStr} ${day}, ${year}`;
    return `${monthStr} ${day}`;
}

const DESKTOP_LIST_DEFAULT_WIDTH = 400;
const DESKTOP_LIST_MIN_WIDTH = 340;
const DESKTOP_LIST_MAX_WIDTH = 480;
const DESKTOP_DETAIL_MIN_WIDTH = 360;
const DESKTOP_SPLITTER_WIDTH = 16;

// ---------------------------------------------------------------------------
// Person Card
// ---------------------------------------------------------------------------

function PersonCard({
    person,
    onPress,
    index,
    reducedMotion,
}: {
    person: Person;
    onPress: (person: Person) => void;
    index: number;
    reducedMotion: boolean;
}) {
    const isArchived = !!person.archivedAt;
    const birthday = formatBirthday(person);
    const useNativeDriver = Platform.OS !== "web";

    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(
        new Animated.Value(reducedMotion ? 0 : 16)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;
        const delay = Math.min(index * 50, 250);
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 280,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 280,
                delay,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={{
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
                marginBottom: 10,
            }}
        >
            <XStack
                backgroundColor="$surface"
                borderRadius="$7"
                paddingVertical="$3"
                paddingHorizontal="$4"
                borderWidth={1}
                borderColor="$borderColorSubtle"
                opacity={isArchived ? 0.55 : 1}
                alignItems="center"
                gap="$3"
                onPress={() => onPress(person)}
                hoverStyle={{ backgroundColor: "$surfaceHover" }}
                pressStyle={{ scale: 0.985, backgroundColor: "$surfaceHover" }}
                // @ts-ignore - web-only CSS property
                style={
                    Platform.OS === "web"
                        ? { WebkitTapHighlightColor: "transparent" }
                        : undefined
                }
                focusStyle={{
                    borderColor: "$borderColorSubtle",
                    outlineWidth: 0,
                    outlineColor: "transparent",
                }}
                focusVisibleStyle={{
                    borderColor: "$borderColorFocus",
                    borderWidth: 2,
                    outlineWidth: 0,
                    outlineColor: "transparent",
                }}
                // @ts-ignore
                animation="fast"
                // @ts-ignore
                shadowColor="rgba(42,36,32,0.05)"
                shadowOffset={{ width: 0, height: 1 }}
                shadowOpacity={1}
                shadowRadius={6}
                elevation={1}
                accessibilityRole="button"
                accessibilityLabel={`Person: ${person.displayName}`}
            >
                {/* Avatar circle */}
                <View
                    width={40}
                    height={40}
                    borderRadius={20}
                    backgroundColor={getInitialColor(person.displayName)}
                    justifyContent="center"
                    alignItems="center"
                    flexShrink={0}
                >
                    <Text
                        fontFamily="$body"
                        fontSize={16}
                        fontWeight="600"
                        color="white"
                    >
                        {person.displayName.charAt(0).toUpperCase()}
                    </Text>
                </View>

                {/* Info */}
                <YStack flex={1} gap="$0.5">
                    <XStack alignItems="center" gap="$2">
                        <Text
                            fontFamily="$heading"
                            fontSize="$6"
                            color="$color"
                            numberOfLines={1}
                            flex={1}
                        >
                            {person.displayName}
                        </Text>
                        {person.pronouns && (
                            <View
                                backgroundColor="$backgroundStrong"
                                paddingHorizontal="$1.5"
                                paddingVertical={2}
                                borderRadius="$3"
                                flexShrink={0}
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize={10}
                                    fontWeight="500"
                                    color="$colorSecondary"
                                >
                                    {person.pronouns}
                                </Text>
                            </View>
                        )}
                    </XStack>

                    <XStack alignItems="center" gap="$2">
                        {person.neighborhood && (
                            <Text
                                fontFamily="$body"
                                fontSize={11}
                                color="$colorTertiary"
                                numberOfLines={1}
                            >
                                {person.neighborhood}
                            </Text>
                        )}
                        {person.neighborhood && birthday && (
                            <Text
                                fontFamily="$body"
                                fontSize={11}
                                color="$colorTertiary"
                            >
                                ·
                            </Text>
                        )}
                        {birthday && (
                            <Text
                                fontFamily="$body"
                                fontSize={11}
                                color="$colorTertiary"
                                numberOfLines={1}
                            >
                                {birthday}
                            </Text>
                        )}
                        {isArchived && (
                            <Text
                                fontFamily="$body"
                                fontSize={10}
                                color="$colorTertiary"
                                fontStyle="italic"
                            >
                                archived
                            </Text>
                        )}
                    </XStack>
                </YStack>
            </XStack>
        </Animated.View>
    );
}

// ---------------------------------------------------------------------------
// Skeleton loading cards
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

    const skeletonColor = palette.linen;

    return (
        <YStack flex={1} paddingHorizontal="$6" paddingTop="$4" gap="$3">
            {[0, 1, 2, 3].map((i) => (
                <Animated.View
                    key={i}
                    style={{
                        opacity: pulseAnim,
                        height: 68,
                        borderRadius: 14,
                        backgroundColor: skeletonColor,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                    }}
                >
                    <View
                        width={40}
                        height={40}
                        borderRadius={20}
                        backgroundColor={palette.fog}
                    />
                    <View flex={1}>
                        <View
                            width="60%"
                            height={14}
                            borderRadius={7}
                            backgroundColor={palette.fog}
                        />
                        <View
                            width="40%"
                            height={10}
                            borderRadius={5}
                            backgroundColor={palette.fog}
                            marginTop={8}
                        />
                    </View>
                </Animated.View>
            ))}
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
    onAddPerson,
    reducedMotion,
}: {
    onAddPerson: () => void;
    reducedMotion: boolean;
}) {
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
                Who matters to you?
            </Text>

            <Text
                fontFamily="$body"
                fontSize="$5"
                color="$colorSecondary"
                textAlign="center"
                lineHeight="$6"
                marginBottom="$6"
            >
                Add the people you want to stay{"\n"}connected with.
            </Text>

            <YStack
                height="$11"
                paddingHorizontal="$6"
                borderRadius="$6"
                backgroundColor="$accentBackground"
                justifyContent="center"
                alignItems="center"
                onPress={onAddPerson}
                pressStyle={{
                    scale: 0.97,
                    backgroundColor: "$accentBackgroundPress",
                }}
                // @ts-ignore
                animation="fast"
                accessibilityRole="button"
                accessibilityLabel="Add your first person"
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
                    Add Your First Person
                </Text>
            </YStack>
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// Create person bottom sheet
// ---------------------------------------------------------------------------

function CreatePersonSheet({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [draft, setDraft] = useSheetSessionState(open, () => ({
        displayName: "",
    }));
    const createPerson = useCreatePerson();

    const handleDisplayNameChange = useCallback(
        (value: string) => {
            setDraft((currentDraft) => ({
                ...currentDraft,
                displayName: value,
            }));
        },
        [setDraft]
    );

    const handleCreate = useCallback(() => {
        const trimmed = draft.displayName.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        createPerson.mutate(
            { data: { displayName: trimmed } },
            {
                onSuccess: () => {
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
    }, [draft.displayName, createPerson, onOpenChange, onCreated]);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader
                title="New person"
                subtitle="Who would you like to remember?"
            />

            <BottomSheetTextField
                placeholder="Their name..."
                placeholderTextColor="$placeholderColor"
                value={draft.displayName}
                onChangeText={handleDisplayNameChange}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                accessibilityLabel="Person's name"
            />

            <BottomSheetPrimaryButton
                label="Save Person"
                loadingLabel="Saving..."
                loading={createPerson.isPending}
                onPress={handleCreate}
                disabled={!draft.displayName.trim() || createPerson.isPending}
                accessibilityLabel="Save person"
            />
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PeopleScreen() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const media = useMedia();
    const hasDesktopSidebar = media.lg && Platform.OS === "web";
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";
    const keyboardAppearance = useNativeKeyboardAppearance();

    const [sheetOpen, setSheetOpen] = useState(false);
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [searchText, setSearchText] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
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
        maxListWidth: DESKTOP_LIST_MAX_WIDTH,
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQ(searchText.trim());
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    const {
        data: peopleResponse,
        isLoading,
        isError,
        refetch,
    } = useListPeople(debouncedQ ? { q: debouncedQ } : undefined);

    const people: Person[] =
        peopleResponse?.data && "data" in peopleResponse.data
            ? (peopleResponse.data as { data: Person[] }).data
            : [];

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

    const handleCreated = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
    }, [queryClient]);

    const handlePersonPress = useCallback(
        (person: Person) => {
            if (hasDesktopSidebar) {
                setSelectedPersonId(person.id);
            } else {
                router.push(
                    `/person/${person.id}?returnTo=${encodeURIComponent("/people")}`
                );
            }
        },
        [router, hasDesktopSidebar]
    );

    const handleRefresh = useCallback(() => {
        refetch();
    }, [refetch]);

    const countLabel =
        !isLoading && people.length > 0
            ? people.length === 1
                ? "1 person"
                : `${people.length} people`
            : "";

    const renderPersonCard = useCallback(
        ({ item, index }: { item: Person; index: number }) => (
            <PersonCard
                person={item}
                onPress={handlePersonPress}
                index={index}
                reducedMotion={reducedMotion}
            />
        ),
        [handlePersonPress, reducedMotion]
    );

    const keyExtractor = useCallback((item: Person) => item.id, []);

    const listContent = (
            <>
                {/* ---- Header ---- */}
                <Animated.View
                    style={{
                        opacity: headerFade,
                        transform: [{ translateY: headerSlide }],
                        zIndex: 1,
                    }}
                >
                    <YStack
                        paddingHorizontal="$6"
                        paddingTop="$4"
                        paddingBottom="$1"
                    >
                        <XStack
                            justifyContent="space-between"
                            alignItems="flex-start"
                        >
                            <YStack flex={1}>
                                <Text
                                    fontFamily="$heading"
                                    fontSize="$9"
                                    color="$color"
                                >
                                    Your People
                                </Text>
                            </YStack>

                        </XStack>

                        {countLabel ? (
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                {countLabel}
                            </Text>
                        ) : null}
                    </YStack>

                    {/* Search bar */}
                    <YStack paddingHorizontal="$6" paddingTop="$2" paddingBottom="$3">
                        <Input
                            fontFamily="$body"
                            fontSize="$4"
                            color="$color"
                            backgroundColor="$backgroundStrong"
                            borderColor="$borderColorSubtle"
                            borderWidth={1}
                            borderRadius="$5"
                            paddingHorizontal="$4"
                            paddingVertical="$2.5"
                            placeholder="Search people..."
                            placeholderTextColor="$placeholderColor"
                            value={searchText}
                            onChangeText={setSearchText}
                            keyboardAppearance={keyboardAppearance}
                            focusStyle={{
                                borderColor: "$borderColorFocus",
                                borderWidth: 2,
                            }}
                            accessibilityLabel="Search people"
                        />
                    </YStack>
                </Animated.View>

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
                            Something went wrong.{"\n"}{Platform.OS === "web" ? "Try again." : "Pull down to try again."}
                        </Text>
                    </YStack>
                ) : people.length === 0 && !debouncedQ ? (
                    <EmptyState
                        onAddPerson={() => setSheetOpen(true)}
                        reducedMotion={reducedMotion}
                    />
                ) : people.length === 0 && debouncedQ ? (
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
                        >
                            No one found for "{debouncedQ}"
                        </Text>
                    </YStack>
                ) : (
                    <Animated.FlatList
                        data={people}
                        renderItem={renderPersonCard}
                        keyExtractor={keyExtractor}
                        contentContainerStyle={{
                            paddingHorizontal: 24,
                            paddingTop: 12,
                            paddingBottom: 16,
                        }}
                        showsVerticalScrollIndicator={false}
                        onRefresh={Platform.OS !== "web" ? handleRefresh : undefined}
                        refreshing={false}
                    />
                )}

                {/* ---- Bottom bar: New Person CTA ---- */}
                <YStack
                    paddingHorizontal="$6"
                    paddingTop="$3"
                    paddingBottom="$2"
                    backgroundColor="$background"
                    borderTopWidth={1}
                    borderTopColor="$borderColorSubtle"
                >
                    <YStack
                        height={48}
                        borderRadius="$6"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                        onPress={() => setSheetOpen(true)}
                        pressStyle={{
                            scale: 0.98,
                            backgroundColor: "$accentBackgroundPress",
                        }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel="Add a new person"
                        cursor="pointer"
                        // @ts-ignore
                        shadowColor="#B8860B"
                        shadowOffset={{ width: 0, height: 3 }}
                        shadowOpacity={0.12}
                        shadowRadius={8}
                        elevation={3}
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
                                New Person
                            </Text>
                        </XStack>
                    </YStack>
                </YStack>

                <CreatePersonSheet
                    open={sheetOpen}
                    onOpenChange={setSheetOpen}
                    onCreated={handleCreated}
                />
            </>
    );

    if (!hasDesktopSidebar) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <PageContainer backgroundColor="$background">
                    {listContent}
                </PageContainer>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
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
                    accessibilityLabel="Resize people panel"
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
                    {selectedPersonId ? (
                        <PersonDetailContent
                            personId={selectedPersonId}
                            onClose={() => setSelectedPersonId(null)}
                        />
                    ) : (
                        <YStack flex={1} justifyContent="center" alignItems="center" padding="$8">
                            <Text
                                fontFamily="$body"
                                fontSize="$6"
                                color="$colorTertiary"
                                textAlign="center"
                            >
                                Select a person to view details
                            </Text>
                        </YStack>
                    )}
                </YStack>
            </XStack>
        </SafeAreaView>
    );
}
