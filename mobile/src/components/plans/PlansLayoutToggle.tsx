import React from "react";
import { Pressable } from "react-native";
import { CalendarDays, List } from "lucide-react-native";
import { View, XStack } from "tamagui";

import { palette } from "../../../tamagui.config";
import type { PlansLayout } from "../../hooks/usePlansLayout";

const OPTIONS: ReadonlyArray<{ layout: PlansLayout; label: string; Icon: typeof List }> = [
    { layout: "list", label: "List view", Icon: List },
    { layout: "calendar", label: "Calendar view", Icon: CalendarDays },
];

export function PlansLayoutToggle({
    layout,
    onChange,
}: {
    layout: PlansLayout;
    onChange: (layout: PlansLayout) => void;
}) {
    return (
        <XStack backgroundColor="$backgroundStrong" borderRadius={10} padding={2} gap={2}>
            {OPTIONS.map(({ layout: option, label, Icon }) => {
                const isActive = option === layout;
                return (
                    <Pressable
                        key={option}
                        onPress={() => onChange(option)}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: isActive }}
                        hitSlop={4}
                    >
                        <View
                            paddingHorizontal={10}
                            paddingVertical={5}
                            borderRadius={8}
                            backgroundColor={isActive ? "$surface" : "transparent"}
                        >
                            <Icon
                                size={16}
                                strokeWidth={isActive ? 2.2 : 1.8}
                                color={isActive ? palette.espresso : palette.walnut}
                            />
                        </View>
                    </Pressable>
                );
            })}
        </XStack>
    );
}
