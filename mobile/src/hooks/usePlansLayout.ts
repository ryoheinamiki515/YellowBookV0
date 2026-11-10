import { useCallback, useEffect, useRef, useState } from "react";

import { readStoredValue, writeStoredValue } from "../lib/clientStorage";

export type PlansLayout = "list" | "calendar";

const PLANS_LAYOUT_STORAGE_KEY = "plans.layout";

function isPlansLayout(value: string | null): value is PlansLayout {
    return value === "list" || value === "calendar";
}

/** The Plans tab layout, remembered across launches. Starts as "list" until the stored choice loads. */
export function usePlansLayout(): [PlansLayout, (layout: PlansLayout) => void] {
    const [layout, setLayoutState] = useState<PlansLayout>("list");
    const hasUserChosen = useRef(false);

    useEffect(() => {
        let cancelled = false;
        readStoredValue(PLANS_LAYOUT_STORAGE_KEY)
            .then((stored) => {
                if (cancelled || hasUserChosen.current || !isPlansLayout(stored)) return;
                setLayoutState(stored);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    const setLayout = useCallback((next: PlansLayout) => {
        hasUserChosen.current = true;
        setLayoutState(next);
        writeStoredValue(PLANS_LAYOUT_STORAGE_KEY, next).catch(() => {});
    }, []);

    return [layout, setLayout];
}
