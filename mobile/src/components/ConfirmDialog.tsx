import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { BottomSheetModal, BottomSheetHeader, BottomSheetPrimaryButton, BottomSheetSecondaryButton } from "./BottomSheetPrimitives";
import { Text, XStack, YStack } from "tamagui";

type ConfirmOptions = {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) {
        throw new Error("useConfirm must be used within a ConfirmProvider");
    }
    return confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [dialogState, setDialogState] = useState<ConfirmOptions | null>(null);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback<ConfirmFn>((options) => {
        if (Platform.OS !== "web") {
            return new Promise<boolean>((resolve) => {
                Alert.alert(options.title, options.message, [
                    {
                        text: options.cancelLabel || "Cancel",
                        style: "cancel",
                        onPress: () => resolve(false),
                    },
                    {
                        text: options.confirmLabel || "OK",
                        style: options.destructive ? "destructive" : "default",
                        onPress: () => resolve(true),
                    },
                ]);
            });
        }

        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
            setDialogState(options);
        });
    }, []);

    const handleClose = useCallback((confirmed: boolean) => {
        resolveRef.current?.(confirmed);
        resolveRef.current = null;
        setDialogState(null);
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <BottomSheetModal
                open={dialogState !== null}
                onOpenChange={(open) => {
                    if (!open) handleClose(false);
                }}
            >
                {dialogState && (
                    <>
                        <BottomSheetHeader
                            title={dialogState.title}
                            subtitle={dialogState.message}
                        />
                        <XStack gap="$3" marginTop="$2">
                            <BottomSheetSecondaryButton
                                flex={1}
                                label={dialogState.cancelLabel || "Cancel"}
                                onPress={() => handleClose(false)}
                                accessibilityLabel={dialogState.cancelLabel || "Cancel"}
                            />
                            <YStack flex={1}>
                                {dialogState.destructive ? (
                                    <YStack
                                        height="$11"
                                        borderRadius="$6"
                                        backgroundColor="$destructiveBackground"
                                        justifyContent="center"
                                        alignItems="center"
                                        onPress={() => handleClose(true)}
                                        pressStyle={{ scale: 0.98, opacity: 0.85 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={dialogState.confirmLabel || "Confirm"}
                                        cursor="pointer"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$4"
                                            fontWeight="600"
                                            color="$destructiveColor"
                                        >
                                            {dialogState.confirmLabel || "Confirm"}
                                        </Text>
                                    </YStack>
                                ) : (
                                    <BottomSheetPrimaryButton
                                        height="$11"
                                        marginTop={0}
                                        label={dialogState.confirmLabel || "Confirm"}
                                        onPress={() => handleClose(true)}
                                        accessibilityLabel={dialogState.confirmLabel || "Confirm"}
                                    />
                                )}
                            </YStack>
                        </XStack>
                    </>
                )}
            </BottomSheetModal>
        </ConfirmContext.Provider>
    );
}
