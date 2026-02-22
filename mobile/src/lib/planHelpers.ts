import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export const AVATAR_COLORS = [
    "#C17A56", // terracotta
    "#7DAE78", // sage
    "#F5C842", // honey
    "#8B7355", // driftwood
    "#D4956A", // terracotta light
    "#5C8A56", // sage dark
    "#D4A72C", // honey dark
    "#A0937D", // stone
];

export function getInitialColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatRelativeDate(
    iso: string | null | undefined
): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    if (diffDays > 1 && diffDays <= 6) return `In ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -6)
        return `${Math.abs(diffDays)} days ago`;

    return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

export function formatFullDate(
    iso: string | null | undefined
): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export function useReducedMotionPreference() {
    const [reducedMotion, setReducedMotion] = useState(false);
    useEffect(() => {
        let mounted = true;
        AccessibilityInfo.isReduceMotionEnabled?.()
            .then((enabled) => {
                if (mounted) setReducedMotion(Boolean(enabled));
            })
            .catch(() => {});
        const subscription = AccessibilityInfo.addEventListener?.(
            "reduceMotionChanged",
            (enabled) => setReducedMotion(Boolean(enabled))
        );
        return () => {
            mounted = false;
            subscription?.remove?.();
        };
    }, []);
    return reducedMotion;
}
