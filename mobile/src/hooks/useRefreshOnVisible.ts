import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

type RefreshHandler = () => void | Promise<unknown>;

export function useRefreshOnVisible(onRefresh: RefreshHandler) {
    const onRefreshRef = useRef(onRefresh);
    const hasFocusedRef = useRef(false);

    useEffect(() => {
        onRefreshRef.current = onRefresh;
    }, [onRefresh]);

    useFocusEffect(
        useCallback(() => {
            if (hasFocusedRef.current) {
                void onRefreshRef.current();
            } else {
                hasFocusedRef.current = true;
            }

            let appState = AppState.currentState;
            const subscription = AppState.addEventListener("change", (nextState) => {
                const becameActive = appState !== "active" && nextState === "active";
                appState = nextState;

                if (becameActive) {
                    void onRefreshRef.current();
                }
            });

            return () => {
                subscription.remove();
            };
        }, [])
    );
}
