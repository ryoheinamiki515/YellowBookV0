import { useCallback, useEffect, useRef, useState } from "react";
import {
    Platform,
    type GestureResponderEvent,
    type LayoutChangeEvent,
} from "react-native";

type UseDesktopResizableSplitViewOptions = {
    enabled: boolean;
    defaultListWidth: number;
    minListWidth: number;
    detailMinWidth: number;
    splitterWidth: number;
    maxListWidth?: number;
};

type UseDesktopResizableSplitViewResult = {
    listWidth: number;
    isResizing: boolean;
    handleContainerLayout: (event: LayoutChangeEvent) => void;
    handleSplitterPressIn: (event: GestureResponderEvent) => void;
};

export function useDesktopResizableSplitView({
    enabled,
    defaultListWidth,
    minListWidth,
    detailMinWidth,
    splitterWidth,
    maxListWidth,
}: UseDesktopResizableSplitViewOptions): UseDesktopResizableSplitViewResult {
    const [containerWidth, setContainerWidth] = useState(0);
    const [listWidth, setListWidth] = useState(defaultListWidth);
    const [isResizing, setIsResizing] = useState(false);

    const listWidthRef = useRef(defaultListWidth);
    const dragStartWidth = useRef(defaultListWidth);
    const dragStartX = useRef(0);

    useEffect(() => {
        listWidthRef.current = listWidth;
    }, [listWidth]);

    const getBounds = useCallback(
        (width: number) => {
            const maxByContainer =
                width > 0
                    ? width - detailMinWidth - splitterWidth
                    : defaultListWidth;
            let max = Math.max(minListWidth, maxByContainer);
            if (typeof maxListWidth === "number") {
                max = Math.min(max, maxListWidth);
            }
            return { min: minListWidth, max };
        },
        [
            defaultListWidth,
            detailMinWidth,
            maxListWidth,
            minListWidth,
            splitterWidth,
        ]
    );

    const clampListWidth = useCallback(
        (nextWidth: number, width: number) => {
            const { min, max } = getBounds(width);
            return Math.max(min, Math.min(max, nextWidth));
        },
        [getBounds]
    );

    const handleContainerLayout = useCallback(
        (event: LayoutChangeEvent) => {
            const width = event.nativeEvent.layout.width;
            setContainerWidth(width);
            setListWidth((current) => clampListWidth(current, width));
        },
        [clampListWidth]
    );

    const handleSplitterPressIn = useCallback(
        (event: GestureResponderEvent) => {
            if (!enabled || Platform.OS !== "web") return;
            dragStartWidth.current = listWidthRef.current;
            dragStartX.current = event.nativeEvent.pageX;
            setIsResizing(true);
        },
        [enabled]
    );

    useEffect(() => {
        if (!enabled || !isResizing || Platform.OS !== "web") return;

        const handleMouseMove = (event: MouseEvent) => {
            const nextWidth =
                dragStartWidth.current + (event.pageX - dragStartX.current);
            setListWidth(clampListWidth(nextWidth, containerWidth));
        };

        const stopResizing = () => {
            setIsResizing(false);
        };

        const previousUserSelect = document.body.style.userSelect;
        const previousCursor = document.body.style.cursor;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", stopResizing);
        window.addEventListener("blur", stopResizing);

        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", stopResizing);
            window.removeEventListener("blur", stopResizing);
            document.body.style.userSelect = previousUserSelect;
            document.body.style.cursor = previousCursor;
        };
    }, [clampListWidth, containerWidth, enabled, isResizing]);

    return {
        listWidth,
        isResizing,
        handleContainerLayout,
        handleSplitterPressIn,
    };
}
