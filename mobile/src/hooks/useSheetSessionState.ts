import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export function useSheetSessionState<TState>(
    open: boolean,
    getInitialState: () => TState
): [TState, Dispatch<SetStateAction<TState>>] {
    const [state, setState] = useState<TState>(() => getInitialState());
    const wasOpenRef = useRef(open);

    useEffect(() => {
        if (open && !wasOpenRef.current) {
            setState(getInitialState());
        }

        wasOpenRef.current = open;
    }, [getInitialState, open]);

    return [state, setState];
}
