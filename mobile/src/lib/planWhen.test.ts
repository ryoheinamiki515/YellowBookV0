import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    fromStorageFields,
    toStorageFields,
    fromPlan,
    isDefined,
    getDueAnchor,
    getStartAnchor,
    getDateKey,
    isBeforeToday,
    getTimeSection,
    getBadgeTone,
    formatBadge,
    formatDisplay,
    getDaysDiffFromIso,
    type PlanWhen,
    type PlanWhenStorageFields,
} from "./planWhen";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(overrides: Partial<{
    timePrecision: "UNSPECIFIED" | "NONE" | "WINDOW" | "EXACT";
    anchorStart: string | null;
    anchorEnd: string | null;
    timezone: string | null;
}> = {}) {
    return {
        timePrecision: overrides.timePrecision ?? "UNSPECIFIED" as const,
        anchorStart: overrides.anchorStart ?? null,
        anchorEnd: overrides.anchorEnd ?? null,
        timezone: overrides.timezone ?? null,
    };
}

function daysFromNow(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    return d.toISOString();
}

function localDateKey(iso: string): string {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Mapper round-trips
// ---------------------------------------------------------------------------

describe("toStorageFields → fromStorageFields round-trip", () => {
    const cases: PlanWhen[] = [
        { kind: "unspecified" },
        { kind: "whenever" },
        { kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: "America/New_York" },
        { kind: "window", start: "2026-03-14T00:00:00.000Z", end: "2026-03-16T00:00:00.000Z", timezone: "America/New_York" },
        { kind: "exactTime", datetime: "2026-03-14T14:30:00.000Z", timezone: "America/New_York" },
    ];

    for (const original of cases) {
        test(`round-trips ${original.kind}`, () => {
            const storage = toStorageFields(original);
            const recovered = fromStorageFields(storage);
            assert.deepEqual(recovered, original);
        });
    }

    test("round-trips day with null timezone", () => {
        const original: PlanWhen = { kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: null };
        const storage = toStorageFields(original);
        const recovered = fromStorageFields(storage);
        assert.deepEqual(recovered, original);
    });
});

// ---------------------------------------------------------------------------
// fromStorageFields edge cases
// ---------------------------------------------------------------------------

describe("fromStorageFields", () => {
    test("UNSPECIFIED → unspecified regardless of anchors", () => {
        const result = fromStorageFields({
            timePrecision: "UNSPECIFIED",
            anchorStart: "2026-03-14T00:00:00.000Z",
            anchorEnd: "2026-03-16T00:00:00.000Z",
            timezone: "America/New_York",
        });
        assert.equal(result.kind, "unspecified");
    });

    test("NONE → whenever regardless of anchors", () => {
        const result = fromStorageFields({
            timePrecision: "NONE",
            anchorStart: "2026-03-14T00:00:00.000Z",
            anchorEnd: null,
            timezone: null,
        });
        assert.equal(result.kind, "whenever");
    });

    test("WINDOW + anchorStart + null anchorEnd → day (issue #19)", () => {
        const result = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: "2026-03-14T00:00:00.000Z",
            anchorEnd: null,
            timezone: "America/New_York",
        });
        assert.equal(result.kind, "day");
        assert.equal((result as any).date, "2026-03-14T00:00:00.000Z");
    });

    test("WINDOW + anchorStart + anchorEnd → window", () => {
        const result = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: "2026-03-14T00:00:00.000Z",
            anchorEnd: "2026-03-16T00:00:00.000Z",
            timezone: null,
        });
        assert.equal(result.kind, "window");
    });

    test("WINDOW + null anchorStart → whenever (defensive)", () => {
        const result = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: null,
            anchorEnd: null,
            timezone: null,
        });
        assert.equal(result.kind, "whenever");
    });

    test("EXACT + anchorStart → exactTime", () => {
        const result = fromStorageFields({
            timePrecision: "EXACT",
            anchorStart: "2026-03-14T14:30:00.000Z",
            anchorEnd: null,
            timezone: "America/New_York",
        });
        assert.equal(result.kind, "exactTime");
        assert.equal((result as any).datetime, "2026-03-14T14:30:00.000Z");
    });

    test("EXACT + null anchorStart → whenever (defensive)", () => {
        const result = fromStorageFields({
            timePrecision: "EXACT",
            anchorStart: null,
            anchorEnd: null,
            timezone: null,
        });
        assert.equal(result.kind, "whenever");
    });
});

// ---------------------------------------------------------------------------
// toStorageFields
// ---------------------------------------------------------------------------

describe("toStorageFields", () => {
    test("unspecified → UNSPECIFIED with null fields", () => {
        const fields = toStorageFields({ kind: "unspecified" });
        assert.equal(fields.timePrecision, "UNSPECIFIED");
        assert.equal(fields.anchorStart, null);
        assert.equal(fields.anchorEnd, null);
        assert.equal(fields.timezone, null);
    });

    test("whenever → NONE with null fields", () => {
        const fields = toStorageFields({ kind: "whenever" });
        assert.equal(fields.timePrecision, "NONE");
        assert.equal(fields.anchorStart, null);
        assert.equal(fields.anchorEnd, null);
    });

    test("day → WINDOW with anchorStart and null anchorEnd", () => {
        const fields = toStorageFields({ kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: "US/Eastern" });
        assert.equal(fields.timePrecision, "WINDOW");
        assert.equal(fields.anchorStart, "2026-03-14T00:00:00.000Z");
        assert.equal(fields.anchorEnd, null);
        assert.equal(fields.timezone, "US/Eastern");
    });

    test("window → WINDOW with both anchors", () => {
        const fields = toStorageFields({
            kind: "window",
            start: "2026-03-14T00:00:00.000Z",
            end: "2026-03-16T00:00:00.000Z",
            timezone: null,
        });
        assert.equal(fields.timePrecision, "WINDOW");
        assert.equal(fields.anchorStart, "2026-03-14T00:00:00.000Z");
        assert.equal(fields.anchorEnd, "2026-03-16T00:00:00.000Z");
    });

    test("exactTime → EXACT with anchorStart", () => {
        const fields = toStorageFields({ kind: "exactTime", datetime: "2026-03-14T14:30:00.000Z", timezone: "America/New_York" });
        assert.equal(fields.timePrecision, "EXACT");
        assert.equal(fields.anchorStart, "2026-03-14T14:30:00.000Z");
        assert.equal(fields.anchorEnd, null);
    });
});

// ---------------------------------------------------------------------------
// fromPlan
// ---------------------------------------------------------------------------

describe("fromPlan", () => {
    test("normalizes undefined optional fields", () => {
        const plan = { timePrecision: "NONE" as const, anchorStart: undefined, anchorEnd: undefined, timezone: undefined };
        const result = fromPlan(plan);
        assert.equal(result.kind, "whenever");
    });

    test("WINDOW plan without anchorEnd → day (issue #19)", () => {
        const plan = makePlan({ timePrecision: "WINDOW", anchorStart: "2026-03-14T00:00:00.000Z" });
        const result = fromPlan(plan);
        assert.equal(result.kind, "day");
    });
});

// ---------------------------------------------------------------------------
// isDefined (issue #20)
// ---------------------------------------------------------------------------

describe("isDefined", () => {
    test("whenever → false", () => {
        assert.equal(isDefined({ kind: "whenever" }), false);
    });

    test("unspecified → false", () => {
        assert.equal(isDefined({ kind: "unspecified" }), false);
    });

    test("day → true", () => {
        assert.equal(isDefined({ kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: null }), true);
    });

    test("window → true", () => {
        assert.equal(isDefined({ kind: "window", start: "2026-03-14T00:00:00.000Z", end: "2026-03-16T00:00:00.000Z", timezone: null }), true);
    });

    test("exactTime → true", () => {
        assert.equal(isDefined({ kind: "exactTime", datetime: "2026-03-14T14:30:00.000Z", timezone: null }), true);
    });
});

// ---------------------------------------------------------------------------
// getDueAnchor (issue #11)
// ---------------------------------------------------------------------------

describe("getDueAnchor", () => {
    test("window returns end", () => {
        assert.equal(
            getDueAnchor({ kind: "window", start: "2026-03-14T00:00:00.000Z", end: "2026-03-16T00:00:00.000Z", timezone: null }),
            "2026-03-16T00:00:00.000Z"
        );
    });

    test("day returns date", () => {
        assert.equal(
            getDueAnchor({ kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: null }),
            "2026-03-14T00:00:00.000Z"
        );
    });

    test("exactTime returns datetime", () => {
        assert.equal(
            getDueAnchor({ kind: "exactTime", datetime: "2026-03-14T14:30:00.000Z", timezone: null }),
            "2026-03-14T14:30:00.000Z"
        );
    });

    test("whenever returns null", () => {
        assert.equal(getDueAnchor({ kind: "whenever" }), null);
    });

    test("unspecified returns null", () => {
        assert.equal(getDueAnchor({ kind: "unspecified" }), null);
    });
});

// ---------------------------------------------------------------------------
// getStartAnchor
// ---------------------------------------------------------------------------

describe("getStartAnchor", () => {
    test("window returns start", () => {
        assert.equal(
            getStartAnchor({ kind: "window", start: "2026-03-14T00:00:00.000Z", end: "2026-03-16T00:00:00.000Z", timezone: null }),
            "2026-03-14T00:00:00.000Z"
        );
    });

    test("day returns date", () => {
        assert.equal(
            getStartAnchor({ kind: "day", date: "2026-03-14T00:00:00.000Z", timezone: null }),
            "2026-03-14T00:00:00.000Z"
        );
    });

    test("whenever returns null", () => {
        assert.equal(getStartAnchor({ kind: "whenever" }), null);
    });
});

// ---------------------------------------------------------------------------
// getDateKey (issue #13 — calendar conflicts)
// ---------------------------------------------------------------------------

describe("getDateKey", () => {
    test("day → YYYY-MM-DD", () => {
        const iso = "2026-03-14T00:00:00.000Z";
        assert.equal(
            getDateKey({ kind: "day", date: iso, timezone: null }),
            localDateKey(iso)
        );
    });

    test("exactTime → YYYY-MM-DD", () => {
        const iso = "2026-03-14T14:30:00.000Z";
        assert.equal(
            getDateKey({ kind: "exactTime", datetime: iso, timezone: null }),
            localDateKey(iso)
        );
    });

    test("window → YYYY-MM-DD of start", () => {
        const iso = "2026-03-14T00:00:00.000Z";
        assert.equal(
            getDateKey({ kind: "window", start: iso, end: "2026-03-16T00:00:00.000Z", timezone: null }),
            localDateKey(iso)
        );
    });

    test("whenever → null", () => {
        assert.equal(getDateKey({ kind: "whenever" }), null);
    });

    test("unspecified → null", () => {
        assert.equal(getDateKey({ kind: "unspecified" }), null);
    });

    test("two plans on same day produce same key (conflict detection, issue #13)", () => {
        const sharedDate = daysFromNow(3);
        const plan1 = fromStorageFields({
            timePrecision: "EXACT",
            anchorStart: sharedDate,
            anchorEnd: null,
            timezone: null,
        });
        const plan2 = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: sharedDate,
            anchorEnd: null,
            timezone: null,
        });
        assert.equal(getDateKey(plan1), getDateKey(plan2));
    });
});

// ---------------------------------------------------------------------------
// isBeforeToday
// ---------------------------------------------------------------------------

describe("isBeforeToday", () => {
    test("past date → true", () => {
        assert.equal(isBeforeToday({ kind: "day", date: daysFromNow(-3), timezone: null }), true);
    });

    test("future date → false", () => {
        assert.equal(isBeforeToday({ kind: "day", date: daysFromNow(3), timezone: null }), false);
    });

    test("whenever → false", () => {
        assert.equal(isBeforeToday({ kind: "whenever" }), false);
    });

    test("unspecified → false", () => {
        assert.equal(isBeforeToday({ kind: "unspecified" }), false);
    });

    test("window uses end date for due check", () => {
        const pastEnd = daysFromNow(-1);
        const futureEnd = daysFromNow(5);
        assert.equal(
            isBeforeToday({ kind: "window", start: daysFromNow(-5), end: pastEnd, timezone: null }),
            true
        );
        assert.equal(
            isBeforeToday({ kind: "window", start: daysFromNow(-5), end: futureEnd, timezone: null }),
            false
        );
    });
});

// ---------------------------------------------------------------------------
// getTimeSection
// ---------------------------------------------------------------------------

describe("getTimeSection", () => {
    test("whenever → Someday", () => {
        assert.equal(getTimeSection({ kind: "whenever" }), "Someday");
    });

    test("unspecified → Someday", () => {
        assert.equal(getTimeSection({ kind: "unspecified" }), "Someday");
    });

    test("today → Coming Up", () => {
        assert.equal(getTimeSection({ kind: "day", date: daysFromNow(0), timezone: null }), "Coming Up");
    });

    test("tomorrow → Coming Up", () => {
        assert.equal(getTimeSection({ kind: "day", date: daysFromNow(1), timezone: null }), "Coming Up");
    });

    test("3 days out → This Week", () => {
        assert.equal(getTimeSection({ kind: "day", date: daysFromNow(3), timezone: null }), "This Week");
    });

    test("10 days out → Later", () => {
        assert.equal(getTimeSection({ kind: "day", date: daysFromNow(10), timezone: null }), "Later");
    });

    test("past date → Later", () => {
        assert.equal(getTimeSection({ kind: "day", date: daysFromNow(-2), timezone: null }), "Later");
    });
});

// ---------------------------------------------------------------------------
// getBadgeTone
// ---------------------------------------------------------------------------

describe("getBadgeTone", () => {
    test("whenever → neutral", () => {
        assert.equal(getBadgeTone({ kind: "whenever" }), "neutral");
    });

    test("today → today", () => {
        assert.equal(getBadgeTone({ kind: "day", date: daysFromNow(0), timezone: null }), "today");
    });

    test("tomorrow → tomorrow", () => {
        assert.equal(getBadgeTone({ kind: "day", date: daysFromNow(1), timezone: null }), "tomorrow");
    });

    test("3 days out → soon", () => {
        assert.equal(getBadgeTone({ kind: "day", date: daysFromNow(3), timezone: null }), "soon");
    });

    test("past → pastDue", () => {
        assert.equal(getBadgeTone({ kind: "day", date: daysFromNow(-2), timezone: null }), "pastDue");
    });

    test("far future → neutral", () => {
        assert.equal(getBadgeTone({ kind: "day", date: daysFromNow(30), timezone: null }), "neutral");
    });
});

// ---------------------------------------------------------------------------
// formatBadge
// ---------------------------------------------------------------------------

describe("formatBadge", () => {
    test("whenever → 'Whenever'", () => {
        assert.equal(formatBadge({ kind: "whenever" }), "Whenever");
    });

    test("unspecified → null", () => {
        assert.equal(formatBadge({ kind: "unspecified" }), null);
    });

    test("day with today → 'Today'", () => {
        const result = formatBadge({ kind: "day", date: daysFromNow(0), timezone: null });
        assert.equal(result, "Today");
    });

    test("day with tomorrow → 'Tomorrow'", () => {
        const result = formatBadge({ kind: "day", date: daysFromNow(1), timezone: null });
        assert.equal(result, "Tomorrow");
    });

    test("exactTime includes time string", () => {
        const result = formatBadge({ kind: "exactTime", datetime: daysFromNow(0), timezone: null });
        assert.notEqual(result, null);
        assert.match(result!, /Today, /);
    });

    test("window same-day → single date", () => {
        const date = "2026-06-15T10:00:00.000Z";
        const result = formatBadge({ kind: "window", start: date, end: date, timezone: null });
        assert.notEqual(result, null);
        assert.ok(!result!.includes("—"));
    });

    test("window multi-day → range with dash", () => {
        const result = formatBadge({
            kind: "window",
            start: "2026-06-15T00:00:00.000Z",
            end: "2026-06-18T00:00:00.000Z",
            timezone: null,
        });
        assert.notEqual(result, null);
        assert.match(result!, /—/);
    });
});

// ---------------------------------------------------------------------------
// formatDisplay
// ---------------------------------------------------------------------------

describe("formatDisplay", () => {
    test("unspecified → null primary and secondary", () => {
        const result = formatDisplay({ kind: "unspecified" });
        assert.equal(result.primary, null);
        assert.equal(result.secondary, null);
    });

    test("whenever → 'Whenever works' primary, null secondary", () => {
        const result = formatDisplay({ kind: "whenever" });
        assert.equal(result.primary, "Whenever works");
        assert.equal(result.secondary, null);
    });

    test("day → relative primary, full secondary", () => {
        const result = formatDisplay({ kind: "day", date: daysFromNow(0), timezone: null });
        assert.equal(result.primary, "Today");
        assert.notEqual(result.secondary, null);
    });

    test("exactTime → 'relative at time' primary", () => {
        const result = formatDisplay({ kind: "exactTime", datetime: daysFromNow(0), timezone: null });
        assert.match(result.primary!, /Today at /);
        assert.notEqual(result.secondary, null);
    });

    test("window → relative primary, range secondary", () => {
        const result = formatDisplay({
            kind: "window",
            start: "2026-06-15T00:00:00.000Z",
            end: "2026-06-18T00:00:00.000Z",
            timezone: null,
        });
        assert.notEqual(result.primary, null);
        assert.match(result.secondary!, / - /);
    });

    test("day formatDisplay shows no time (issue #19)", () => {
        const result = formatDisplay({ kind: "day", date: "2026-06-15T00:00:00.000Z", timezone: null });
        assert.ok(!result.primary?.includes("at "));
        assert.ok(!result.secondary?.match(/\d{1,2}:\d{2}/));
    });
});

// ---------------------------------------------------------------------------
// Issue-specific integration tests
// ---------------------------------------------------------------------------

describe("Issue #20: 'Whenever' by default", () => {
    test("plan with NONE → formatBadge returns 'Whenever'", () => {
        const when = fromPlan(makePlan({ timePrecision: "NONE" }));
        assert.equal(formatBadge(when), "Whenever");
    });

    test("plan with NONE → isDefined returns false (not flagged as missing date)", () => {
        const when = fromPlan(makePlan({ timePrecision: "NONE" }));
        assert.equal(isDefined(when), false);
    });

    test("'whenever' is distinct from 'unspecified' — unspecified shows no badge", () => {
        const whenever = fromPlan(makePlan({ timePrecision: "NONE" }));
        const unspecified = fromPlan(makePlan({ timePrecision: "UNSPECIFIED" }));
        assert.equal(formatBadge(whenever), "Whenever");
        assert.equal(formatBadge(unspecified), null);
    });
});

describe("Issue #19: date with optional time", () => {
    test("WINDOW + anchorStart + null anchorEnd → day (not window)", () => {
        const when = fromPlan(makePlan({
            timePrecision: "WINDOW",
            anchorStart: "2026-03-14T00:00:00.000Z",
        }));
        assert.equal(when.kind, "day");
    });

    test("day badge shows date without time", () => {
        const when: PlanWhen = { kind: "day", date: daysFromNow(0), timezone: null };
        const badge = formatBadge(when);
        assert.equal(badge, "Today");
    });

    test("exactTime badge shows date with time", () => {
        const when: PlanWhen = { kind: "exactTime", datetime: daysFromNow(0), timezone: null };
        const badge = formatBadge(when);
        assert.match(badge!, /Today, /);
    });
});

describe("Issue #13: calendar conflict detection via getDateKey", () => {
    test("plans on the same day share a dateKey", () => {
        const sharedDate = daysFromNow(5);
        const exactPlan = fromStorageFields({
            timePrecision: "EXACT",
            anchorStart: sharedDate,
            anchorEnd: null,
            timezone: null,
        });
        const dayPlan = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: sharedDate,
            anchorEnd: null,
            timezone: null,
        });
        const windowPlan = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: sharedDate,
            anchorEnd: daysFromNow(7),
            timezone: null,
        });

        const key1 = getDateKey(exactPlan);
        const key2 = getDateKey(dayPlan);
        const key3 = getDateKey(windowPlan);
        assert.equal(key1, key2);
        assert.equal(key2, key3);
    });

    test("whenever plans have no dateKey (no calendar slot)", () => {
        const wheneverPlan = fromStorageFields({
            timePrecision: "NONE",
            anchorStart: null,
            anchorEnd: null,
            timezone: null,
        });
        assert.equal(getDateKey(wheneverPlan), null);
    });
});

describe("Issue #11: window carries both dates for tappable editing", () => {
    test("window variant exposes both start and end", () => {
        const when = fromStorageFields({
            timePrecision: "WINDOW",
            anchorStart: "2026-03-14T00:00:00.000Z",
            anchorEnd: "2026-03-18T00:00:00.000Z",
            timezone: "America/New_York",
        });
        assert.equal(when.kind, "window");
        if (when.kind === "window") {
            assert.equal(when.start, "2026-03-14T00:00:00.000Z");
            assert.equal(when.end, "2026-03-18T00:00:00.000Z");
        }
    });

    test("getDueAnchor on window returns end (for past-due checking)", () => {
        const when: PlanWhen = {
            kind: "window",
            start: "2026-03-14T00:00:00.000Z",
            end: "2026-03-18T00:00:00.000Z",
            timezone: null,
        };
        assert.equal(getDueAnchor(when), "2026-03-18T00:00:00.000Z");
    });

    test("toStorageFields preserves both start and end for window", () => {
        const when: PlanWhen = {
            kind: "window",
            start: "2026-03-14T00:00:00.000Z",
            end: "2026-03-18T00:00:00.000Z",
            timezone: "America/New_York",
        };
        const fields = toStorageFields(when);
        assert.equal(fields.anchorStart, "2026-03-14T00:00:00.000Z");
        assert.equal(fields.anchorEnd, "2026-03-18T00:00:00.000Z");
    });
});
