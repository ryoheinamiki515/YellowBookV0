import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildPlanCalendar, getPartOfDay, type PartOfDay } from "./planCalendar.js";
import { collectOpenPlanRows } from "./agendaGrouping.js";
import type { SocialPlan } from "../api/generated/model/socialPlan.js";

function makePlan(overrides: Partial<SocialPlan> & { id: string }): SocialPlan {
    return {
        ownerId: "user-owner",
        intentText: overrides.id,
        state: "OPEN",
        timePrecision: "UNSPECIFIED",
        participants: [],
        createdAt: new Date(2026, 0, 1).toISOString(),
        updatedAt: new Date(2026, 0, 1).toISOString(),
        ...overrides,
    } as SocialPlan;
}

function at(day: number, hour: number, minute = 0): string {
    return new Date(2026, 11, day, hour, minute).toISOString();
}

function exactPlan(id: string, day: number, hour: number): SocialPlan {
    return makePlan({ id, timePrecision: "EXACT", anchorStart: at(day, hour) });
}

function windowPlan(id: string, startIso: string, endIso: string): SocialPlan {
    return makePlan({ id, timePrecision: "WINDOW", anchorStart: startIso, anchorEnd: endIso });
}

function calendarOf(...plans: SocialPlan[]) {
    return buildPlanCalendar(collectOpenPlanRows(plans, []));
}

function planIdsOn(calendar: ReturnType<typeof calendarOf>, dateKey: string): string[] {
    return calendar.get(dateKey)?.rows.map((row) => row.plan.id) ?? [];
}

function withTimeZone(timeZone: string, run: () => void) {
    const previous = process.env.TZ;
    process.env.TZ = timeZone;
    try {
        run();
    } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
    }
}

describe("getPartOfDay", () => {
    const cases: Array<[hour: number, minute: number, expected: PartOfDay]> = [
        [0, 0, "lateNight"],
        [4, 59, "lateNight"],
        [5, 0, "morning"],
        [11, 59, "morning"],
        [12, 0, "afternoon"],
        [16, 59, "afternoon"],
        [17, 0, "evening"],
        [20, 59, "evening"],
        [21, 0, "lateNight"],
        [23, 59, "lateNight"],
    ];
    for (const [hour, minute, expected] of cases) {
        test(`${hour}:${String(minute).padStart(2, "0")} is ${expected}`, () => {
            assert.equal(getPartOfDay(new Date(2026, 11, 5, hour, minute)), expected);
        });
    }
});

describe("buildPlanCalendar", () => {
    test("exact-time plan puts a part-of-day dot on its day", () => {
        const calendar = calendarOf(exactPlan("brunch", 5, 10));
        assert.deepEqual(calendar.get("2026-12-05"), {
            dots: ["morning"],
            range: null,
            rows: calendar.get("2026-12-05")?.rows,
        });
        assert.deepEqual(planIdsOn(calendar, "2026-12-05"), ["brunch"]);
    });

    test("date-only plan is all-day regardless of the time stored in its anchor", () => {
        const dateOnly = makePlan({
            id: "picnic",
            timePrecision: "WINDOW",
            anchorStart: at(6, 22, 47),
        });
        assert.deepEqual(calendarOf(dateOnly).get("2026-12-06")?.dots, ["allDay"]);
    });

    test("multi-day window covers every day inclusive of both ends, with no dots", () => {
        const calendar = calendarOf(windowPlan("weekend", at(11, 9), at(13, 9)));
        for (const key of ["2026-12-11", "2026-12-12", "2026-12-13"]) {
            assert.deepEqual(calendar.get(key)?.dots, [], key);
            assert.ok(calendar.get(key)?.range, key);
            assert.deepEqual(planIdsOn(calendar, key), ["weekend"], key);
        }
        assert.equal(calendar.get("2026-12-10"), undefined);
        assert.equal(calendar.get("2026-12-14"), undefined);
    });

    test("range segments know whether the span continues into neighboring days", () => {
        const calendar = calendarOf(windowPlan("weekend", at(11, 9), at(13, 9)));
        assert.deepEqual(calendar.get("2026-12-11")?.range, {
            continuesFromPrevious: false,
            continuesToNext: true,
        });
        assert.deepEqual(calendar.get("2026-12-12")?.range, {
            continuesFromPrevious: true,
            continuesToNext: true,
        });
        assert.deepEqual(calendar.get("2026-12-13")?.range, {
            continuesFromPrevious: true,
            continuesToNext: false,
        });
    });

    test("back-to-back windows join into one continuous span", () => {
        const calendar = calendarOf(
            windowPlan("first", at(1, 9), at(2, 9)),
            windowPlan("second", at(3, 9), at(4, 9))
        );
        assert.deepEqual(calendar.get("2026-12-02")?.range, {
            continuesFromPrevious: true,
            continuesToNext: true,
        });
    });

    test("window that starts and ends on the same day is all-day, not a range", () => {
        const calendar = calendarOf(windowPlan("same-day", at(8, 9), at(8, 18)));
        assert.deepEqual(calendar.get("2026-12-08")?.dots, ["allDay"]);
        assert.equal(calendar.get("2026-12-08")?.range, null);
    });

    test("window crossing a month boundary covers days in both months", () => {
        const calendar = calendarOf(
            windowPlan(
                "crossing",
                new Date(2026, 10, 30, 12).toISOString(),
                new Date(2026, 11, 1, 12).toISOString()
            )
        );
        assert.deepEqual([...calendar.keys()], ["2026-11-30", "2026-12-01"]);
    });

    test("window spanning a midnight DST start keeps its last day", () => {
        withTimeZone("America/Santiago", () => {
            const calendar = calendarOf(
                windowPlan(
                    "dst",
                    new Date(2026, 8, 5, 12).toISOString(),
                    new Date(2026, 8, 8, 12).toISOString()
                )
            );
            assert.deepEqual(
                [...calendar.keys()],
                ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"]
            );
        });
    });

    test("plans without a date do not appear on the calendar", () => {
        const calendar = calendarOf(
            makePlan({ id: "unspecified", timePrecision: "UNSPECIFIED" }),
            makePlan({ id: "whenever", timePrecision: "NONE" })
        );
        assert.equal(calendar.size, 0);
    });

    test("dots are deduplicated and ordered through the day; rows follow the same order", () => {
        const calendar = calendarOf(
            exactPlan("late", 5, 22),
            exactPlan("dinner-2", 5, 19),
            windowPlan("trip", at(4, 9), at(6, 9)),
            makePlan({ id: "all-day", timePrecision: "WINDOW", anchorStart: at(5, 0) }),
            exactPlan("dinner-1", 5, 18),
            exactPlan("coffee", 5, 8)
        );
        assert.deepEqual(calendar.get("2026-12-05")?.dots, ["morning", "evening", "lateNight", "allDay"]);
        assert.deepEqual(planIdsOn(calendar, "2026-12-05"), [
            "coffee",
            "dinner-1",
            "dinner-2",
            "late",
            "all-day",
            "trip",
        ]);
    });
});
