import React from "react";
import { Text, View, XStack } from "tamagui";

import { palette } from "../../../tamagui.config";

type PlansSectionHeaderProps = {
    title: string;
    count?: number;
};

const sectionDotColors: Record<string, string> = {
    "Needs Attention": palette.terracotta,
    "Upcoming": palette.honey,
    "History": palette.driftwood,
    "Coming Up": palette.honey,
    "This Week": palette.sage,
    "Later": palette.driftwood,
    "Someday": palette.stone,
    "Shared with you": "#8FA4C4",
};

function getSectionDotColor(title: string): string {
    return sectionDotColors[title] ?? palette.stone;
}

export function PlansSectionHeader({
    title,
    count,
}: PlansSectionHeaderProps) {
    const dotColor = getSectionDotColor(title);

    return (
        <XStack
            alignItems="center"
            gap="$2"
            marginTop="$6"
            marginBottom="$2"
        >
            {/* Colored section dot */}
            <View
                width={6}
                height={6}
                borderRadius={3}
                backgroundColor={dotColor}
                flexShrink={0}
            />

            <Text
                fontFamily="$body"
                fontSize={11}
                fontWeight="600"
                color="$colorTertiary"
                letterSpacing={1.2}
                textTransform="uppercase"
                flexShrink={0}
            >
                {title}
            </Text>

            {typeof count === "number" ? (
                <Text
                    fontFamily="$body"
                    fontSize={11}
                    color="$colorTertiary"
                    flexShrink={0}
                >
                    {count}
                </Text>
            ) : null}

            {/* Horizontal rule extending to the right */}
            <View
                flex={1}
                height={1}
                backgroundColor="$borderColorSubtle"
                marginLeft="$1"
            />
        </XStack>
    );
}
