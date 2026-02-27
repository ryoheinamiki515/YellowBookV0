import { useEffect } from "react";
import { Platform } from "react-native";

type Modifiers = {
    meta?: boolean;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
};

type ShortcutDescriptor = {
    key: string;
} & Modifiers;

export function useKeyboardShortcut(
    descriptor: ShortcutDescriptor,
    callback: () => void,
    enabled = true
) {
    useEffect(() => {
        if (Platform.OS !== "web" || !enabled) return;

        const handler = (event: KeyboardEvent) => {
            if (descriptor.meta && !event.metaKey) return;
            if (descriptor.ctrl && !event.ctrlKey) return;
            if (descriptor.shift && !event.shiftKey) return;
            if (descriptor.alt && !event.altKey) return;

            if (event.key.toLowerCase() !== descriptor.key.toLowerCase()) return;

            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "INPUT" ||
                    target.tagName === "TEXTAREA" ||
                    target.isContentEditable)
            ) {
                return;
            }

            event.preventDefault();
            callback();
        };

        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [descriptor.key, descriptor.meta, descriptor.ctrl, descriptor.shift, descriptor.alt, callback, enabled]);
}
