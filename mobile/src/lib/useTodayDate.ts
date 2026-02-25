import { useEffect, useState } from "react";
import { AppState } from "react-native";

function msUntilNextLocalMidnight(now: Date): number {
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    return Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000);
}

export function useTodayDate(): Date {
    const [today, setToday] = useState(() => new Date());

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const refreshToday = () => {
            setToday(new Date());
        };

        const scheduleMidnightRefresh = () => {
            timeoutId = setTimeout(() => {
                refreshToday();
                scheduleMidnightRefresh();
            }, msUntilNextLocalMidnight(new Date()));
        };

        scheduleMidnightRefresh();

        const appStateSubscription = AppState.addEventListener("change", (state) => {
            if (state === "active") {
                refreshToday();
            }
        });

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            appStateSubscription.remove();
        };
    }, []);

    return today;
}
