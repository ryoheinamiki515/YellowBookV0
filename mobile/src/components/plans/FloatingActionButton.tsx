import React from "react";
import { Platform } from "react-native";
import { Text, View } from "tamagui";

type FloatingActionButtonProps = {
    onPress: () => void;
};

export function FloatingActionButton({ onPress }: FloatingActionButtonProps) {
    if (Platform.OS === "web") return null;

    return (
        <View
            position="absolute"
            bottom={24}
            right={24}
            width={56}
            height={56}
            borderRadius={28}
            backgroundColor="$accentBackground"
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            pressStyle={{ scale: 0.92, backgroundColor: "$accentBackgroundPress" }}
            // @ts-ignore
            animation="fast"
            accessibilityRole="button"
            accessibilityLabel="Create new plan"
            cursor="pointer"
            zIndex={10}
            // @ts-ignore
            shadowColor="#B8860B"
            shadowOffset={{ width: 0, height: 4 }}
            shadowOpacity={0.22}
            shadowRadius={12}
            elevation={6}
        >
            <Text
                fontFamily="$heading"
                fontSize={28}
                color="$accentColor"
                marginTop={-2}
            >
                +
            </Text>
        </View>
    );
}
