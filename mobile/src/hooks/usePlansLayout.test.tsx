import { act } from "react-test-renderer";

import { renderHook } from "../testing/renderHook";
import { usePlansLayout } from "./usePlansLayout";
import { readStoredValue, writeStoredValue } from "../lib/clientStorage";

jest.mock("../lib/clientStorage", () => ({
    readStoredValue: jest.fn(),
    writeStoredValue: jest.fn(),
}));

const mockReadStoredValue = readStoredValue as jest.Mock;
const mockWriteStoredValue = writeStoredValue as jest.Mock;

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

beforeEach(() => {
    mockReadStoredValue.mockReset();
    mockWriteStoredValue.mockReset().mockResolvedValue(undefined);
});

describe("usePlansLayout", () => {
    test("starts as list and adopts the stored layout once it loads", async () => {
        const stored = deferred<string | null>();
        mockReadStoredValue.mockReturnValue(stored.promise);

        const { result } = renderHook(() => usePlansLayout(), { initialProps: undefined });
        expect(result.current[0]).toBe("list");

        await act(async () => stored.resolve("calendar"));

        expect(result.current[0]).toBe("calendar");
    });

    test("ignores an unrecognized stored value", async () => {
        mockReadStoredValue.mockResolvedValue("grid");

        const { result } = renderHook(() => usePlansLayout(), { initialProps: undefined });
        await act(async () => {});

        expect(result.current[0]).toBe("list");
    });

    test("persists the chosen layout", () => {
        mockReadStoredValue.mockResolvedValue(null);

        const { result } = renderHook(() => usePlansLayout(), { initialProps: undefined });
        act(() => result.current[1]("calendar"));

        expect(result.current[0]).toBe("calendar");
        expect(mockWriteStoredValue).toHaveBeenCalledWith("plans.layout", "calendar");
    });

    test("a choice made before the stored value loads is not overwritten by it", async () => {
        const stored = deferred<string | null>();
        mockReadStoredValue.mockReturnValue(stored.promise);

        const { result } = renderHook(() => usePlansLayout(), { initialProps: undefined });
        act(() => result.current[1]("calendar"));
        await act(async () => stored.resolve("list"));

        expect(result.current[0]).toBe("calendar");
    });
});
