import React, { useEffect, useState } from "react";
import { Image } from "react-native";
import { View, Text } from "tamagui";
import { getInitialColor } from "../lib/planHelpers";

type AvatarProps = {
    name: string;
    imageUrl?: string | null;
    size: number;
    borderWidth?: number;
    borderColor?: string;
    shadow?: boolean;
};

export function Avatar({
    name,
    imageUrl,
    size,
    borderWidth = 0,
    borderColor,
    shadow = false,
}: AvatarProps) {
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
        setImageError(false);
    }, [imageUrl]);
    const bgColor = getInitialColor(name);
    const radius = size / 2;
    const fontSize = Math.round(size * 0.42);
    const showImage = !!imageUrl && !imageError;
    const innerSize = size - borderWidth * 2;

    return (
        <View
            width={size}
            height={size}
            borderRadius={radius}
            backgroundColor={bgColor}
            justifyContent="center"
            alignItems="center"
            overflow="hidden"
            borderWidth={borderWidth || undefined}
            borderColor={borderColor}
            // @ts-ignore — shadow props
            shadowColor={shadow ? bgColor : undefined}
            shadowOffset={shadow ? { width: 0, height: 1 } : undefined}
            shadowOpacity={shadow ? 0.3 : 0}
            shadowRadius={shadow ? 4 : 0}
        >
            {showImage ? (
                <Image
                    source={{ uri: imageUrl! }}
                    style={{
                        width: innerSize,
                        height: innerSize,
                        borderRadius: innerSize / 2,
                    }}
                    onError={() => setImageError(true)}
                />
            ) : (
                <Text
                    fontFamily="$body"
                    fontSize={fontSize}
                    fontWeight="600"
                    color="white"
                >
                    {name.charAt(0).toUpperCase()}
                </Text>
            )}
        </View>
    );
}
