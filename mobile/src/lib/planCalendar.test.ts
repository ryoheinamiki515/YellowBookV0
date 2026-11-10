import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildPlanCalendar, getPartOfDay } from "./planCalendar.js";
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

function calendarOf(...plans: SocialPlan[]) {
    return buildPlanCalendar(collectOpenPlanRows(plans, []));
}

function planIdsOn(calendar: ReturnType<typeof calendarOf>, dateKey: string): string[] {
    return calendar.get(dateKey)?.rows.map((row) => row.plan.id) ?? [];
}

describe("getPartOfDay", () => {
    const cases: Array<[hour: number, minute: number, expected: string]> = [
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
    test("exact-time plan marks its day with its part of day", () => {
        const calendar = calendarOf(exactPlan("brunch", 5, 10));
        assert.deepEqual(calendar.get("2026-12-05")?.marks, ["morning"]);
        assert.deepEqual(planIdsOn(calendar, "2026-12-05"), ["brunch"]);
    });

    test("date-only plan is all-day regardless of the time stored in its anchor", () => {
        const dateOnly = makePlan({
            id: "picnic",
            timePrecision: "WINDOW",
            anchorStart: at(6, 22, 47),
        });
        assert.deepEqual(calendarOf(dateOnly).get("2026-12-06")?.marks, ["allDay"]);
    });

    test("multi-day window marks every covered day as range, inclusive of both ends", () => {
        const weekend = makePlan({
            id: "weekend",
            timePrecision: "WINDOW",
            anchorStart: at(11, 9),
            anchorEnd: at(13, 9),
        });
        const calendar = calendarOf(weekend);
        for (const key of ["2026-12-11", "2026-12-12", "2026-12-13"]) {
            assert.deepEqual(calendar.get(key)?.marks, ["range"], key);
            assert.deepEqual(planIdsOn(calendar, key), ["weekend"], key);
        }
        assert.equal(calendar.get("2026-12-10"), undefined);
        assert.equal(calendar.get("2026-12-14"), undefined);
    });

    test("window that starts and ends on the same day is all-day, not a range", () => {
        const sameDay = makePlan({
            id: "same-day",
            timePrecision: "WINDOW",
            anchorStart: at(8, 9),
            anchorEnd: at(8, 18),
        });
        assert.deepEqual(calendarOf(sameDay).get("2026-12-08")?.marks, ["allDay"]);
    });

    test("window crossing month boundary covers days in both months", () => {
        const crossing = makePlan({
            id: "crossing",
            timePrecision: "WINDOW",
            anchorStart: new Date(2026, 10, 30, 12).toISOString(),
            anchorEnd: new Date(2026, 11, 1, 12).toISOString(),
        });
        const calendar = calendarOf(crossing);
        assert.deepEqual([...calendar.keys()], ["2026-11-30", "2026-12-01"]);
    });

    test("plans without a date do not appear on the calendar", () => {
        const calendar = calendarOf(
            makePlan({ id: "unspecified", timePrecision: "UNSPECIFIED" }),
            makePlan({ id: "whenever", timePrecision: "NONE" })
        );
        assert.equal(calendar.size, 0);
    });

    test("marks are deduplicated and ordered through the day; rows follow the same order", () => {
        const calendar = calendarOf(
            exactPlan("late", 5, 22),
            exactPlan("dinner-2", 5, 19),
            makePlan({ id: "all-day", timePrecision: "WINDOW", anchorStart: at(5, 0) }),
            exactPlan("dinner-1", 5, 18),
            exactPlan("coffee", 5, 8)
        );
        const day = calendar.get("2026-12-05");
        assert.deepEqual(day?.marks, ["morning", "evening", "lateNight", "allDay"]);
        assert.deepEqual(planIdsOn(calendar, "2026-12-05"), [
            "coffee",
            "dinner-1",
            "dinner-2",
            "late",
            "all-day",
        ]);
    });

    test("closed plans and plans the viewer marked done are excluded", () => {
        const rows = collectOpenPlanRows(
            [makePlan({ id: "done", state: "DONE", timePrecision: "EXACT", anchorStart: at(5, 10) })],
            [
                makePlan({
                    id: "member-done",
                    timePrecision: "EXACT",
                    anchorStart: at(5, 10),
                    membership: { markedDoneAt: at(4, 10) } as SocialPlan["membership"],
                }),
                exactPlan("shared-open", 5, 10),
            ]
        );
        assert.deepEqual(planIdsOn(buildPlanCalendar(rows), "2026-12-05"), ["shared-open"]);
    });
});
