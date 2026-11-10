import type { AgendaPlanRowData } from "./agendaGrouping";
import { dateFromLocalDateKey, toLocalDateKey } from "./dateKey";
import { fromPlan, type PlanWhen } from "./planWhen";

export type PartOfDay = "morning" | "afternoon" | "evening" | "lateNight";

/** A part of day for plans with an exact time, or "allDay" for plans pinned to a date without one. */
export type DayDot = PartOfDay | "allDay";

export const DAY_DOT_ORDER: readonly DayDot[] = [
    "morning",
    "afternoon",
    "evening",
    "lateNight",
    "allDay",
];

/** This day's slice of one or more multi-day windows, and whether the span continues into the neighboring days. */
export type RangeSegment = {
    continuesFromPrevious: boolean;
    continuesToNext: boolean;
};

export type PlanCalendarDay = {
    dots: DayDot[];
    range: RangeSegment | null;
    rows: AgendaPlanRowData[];
};

export type PlanCalendar = ReadonlyMap<string, PlanCalendarDay>;

const MORNING_START_HOUR = 5;
const NOON_HOUR = 12;
const EVENING_START_HOUR = 17;
const LATE_NIGHT_START_HOUR = 21;

export function getPartOfDay(date: Date): PartOfDay {
    const hour = date.getHours();
    if (hour < MORNING_START_HOUR) return "lateNight";
    if (hour < NOON_HOUR) return "morning";
    if (hour < EVENING_START_HOUR) return "afternoon";
    if (hour < LATE_NIGHT_START_HOUR) return "evening";
    return "lateNight";
}

type Occupancy = DayDot | "range";

const OCCUPANCY_ORDER: readonly Occupancy[] = [...DAY_DOT_ORDER, "range"];

type DayOccupancy = { dateKey: string; occupancy: Occupancy };

function shiftDateKey(dateKey: string, offsetDays: number): string {
    return toLocalDateKey(dateFromLocalDateKey(dateKey, offsetDays));
}

function occupiedDays(when: PlanWhen): DayOccupancy[] {
    switch (when.kind) {
        case "exactTime": {
            const at = new Date(when.datetime);
            return [{ dateKey: toLocalDateKey(at), occupancy: getPartOfDay(at) }];
        }
        case "day":
            return [{ dateKey: toLocalDateKey(new Date(when.date)), occupancy: "allDay" }];
        case "window": {
            const firstKey = toLocalDateKey(new Date(when.start));
            const lastKey = toLocalDateKey(new Date(when.end));
            if (lastKey <= firstKey) return [{ dateKey: firstKey, occupancy: "allDay" }];
            // Step by calendar day rather than by timestamp: where DST starts at
            // midnight, local midnight doesn't exist and timestamps drift by an hour.
            const days: DayOccupancy[] = [];
            for (let offset = 0; ; offset++) {
                const dateKey = shiftDateKey(firstKey, offset);
                days.push({ dateKey, occupancy: "range" });
                if (dateKey === lastKey) return days;
            }
        }
        case "unspecified":
        case "whenever":
            return [];
    }
}

type DayEntry = { row: AgendaPlanRowData; occupancy: Occupancy };

function compareEntriesWithinDay(a: DayEntry, b: DayEntry): number {
    const orderDiff = OCCUPANCY_ORDER.indexOf(a.occupancy) - OCCUPANCY_ORDER.indexOf(b.occupancy);
    if (orderDiff !== 0) return orderDiff;
    const aStart = a.row.plan.anchorStart ? new Date(a.row.plan.anchorStart).getTime() : 0;
    const bStart = b.row.plan.anchorStart ? new Date(b.row.plan.anchorStart).getTime() : 0;
    return aStart - bStart;
}

function hasRangeOn(entriesByDay: Map<string, DayEntry[]>, dateKey: string): boolean {
    return entriesByDay.get(dateKey)?.some((entry) => entry.occupancy === "range") ?? false;
}

/** Groups plans by every local day they occupy. Days with no plans are absent. */
export function buildPlanCalendar(rows: AgendaPlanRowData[]): PlanCalendar {
    const entriesByDay = new Map<string, DayEntry[]>();
    for (const row of rows) {
        for (const { dateKey, occupancy } of occupiedDays(fromPlan(row.plan))) {
            const entries = entriesByDay.get(dateKey) ?? [];
            entries.push({ row, occupancy });
            entriesByDay.set(dateKey, entries);
        }
    }

    const calendar = new Map<string, PlanCalendarDay>();
    for (const [dateKey, entries] of entriesByDay) {
        entries.sort(compareEntriesWithinDay);
        const occupancies = new Set(entries.map((entry) => entry.occupancy));
        const range: RangeSegment | null = occupancies.has("range")
            ? {
                  continuesFromPrevious: hasRangeOn(entriesByDay, shiftDateKey(dateKey, -1)),
                  continuesToNext: hasRangeOn(entriesByDay, shiftDateKey(dateKey, 1)),
              }
            : null;
        calendar.set(dateKey, {
            dots: DAY_DOT_ORDER.filter((dot) => occupancies.has(dot)),
            range,
            rows: entries.map((entry) => entry.row),
        });
    }
    return calendar;
}
