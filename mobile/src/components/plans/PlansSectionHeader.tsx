import React from "react";
import { Text, XStack } from "tamagui";

type PlansSectionHeaderProps = {
    title: string;
    count?: number;
};

export function PlansSectionHeader({
    title,
    count,
}: PlansSectionHeaderProps) {
    return (
        <XStack
            alignItems="center"
            justifyContent="space-between"
            gap="$2"
            marginTop="$4"
            marginBottom="$2"
        >
            <Text
                fontFamily="$body"
                fontSize={11}
                fontWeight="600"
                color="$colorTertiary"
                letterSpacing={1.2}
                textTransform="uppercase"
            >
                {title}
            </Text>

            {typeof count === "number" ? (
                <Text
                    fontFamily="$body"
                    fontSize={11}
                    color="$colorTertiary"
                >
                    {count}
                </Text>
            ) : null}
        </XStack>
    );
}
