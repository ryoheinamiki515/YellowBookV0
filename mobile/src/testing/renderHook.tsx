import type { ReactElement, ReactNode } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";

// @testing-library/react-native's renderHook is currently incompatible with the
// jest-expo 54 / React 19.1 stack (its renderer no-ops), so we drive
// react-test-renderer directly. Swap this out once RTL realigns.

export type RenderHookResult<Props, Value> = {
    result: { current: Value };
    rerender: (props: Props) => void;
    unmount: () => void;
};

export function renderHook<Props, Value>(
    useHook: (props: Props) => Value,
    options: {
        initialProps: Props;
        wrapper?: (children: ReactNode) => ReactElement;
    }
): RenderHookResult<Props, Value> {
    const result = { current: undefined as unknown as Value };

    function Probe({ hookProps }: { hookProps: Props }) {
        result.current = useHook(hookProps);
        return null;
    }

    const wrap = (props: Props): ReactElement => {
        const element = <Probe hookProps={props} />;
        return options.wrapper ? options.wrapper(element) : element;
    };

    let renderer: ReactTestRenderer;
    act(() => {
        renderer = TestRenderer.create(wrap(options.initialProps));
    });

    return {
        result,
        rerender: (props) => {
            act(() => {
                renderer.update(wrap(props));
            });
        },
        unmount: () => {
            act(() => {
                renderer.unmount();
            });
        },
    };
}
