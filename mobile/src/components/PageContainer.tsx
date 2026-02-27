import { Platform } from "react-native";
import { YStack, useMedia } from "tamagui";
import type { YStackProps } from "tamagui";

export function PageContainer({ children, ...props }: YStackProps) {
    const media = useMedia();
    const hasDesktopSidebar = media.lg && Platform.OS === "web";

    return (
        <YStack
            flex={1}
            width="100%"
            position="relative"
            {...(!hasDesktopSidebar && {
                $md: { maxWidth: 680, alignSelf: "center" as const },
            })}
            {...props}
        >
            {children}
        </YStack>
    );
}
