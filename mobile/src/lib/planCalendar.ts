import type { AgendaPlanRowData } from "./agendaGrouping";
import { toLocalDateKey } from "./dateKey";
import { fromPlan, type PlanWhen } from "./planWhen";

export type PartOfDay = "morning" | "afternoon" | "evening" | "lateNight";

/**
 * How a plan occupies a calendar day:
 * - a part of day, for plans with an exact time
 * - "allDay", for plans pinned to a single date without a time
 * - "range", for each day covered by a multi-day window
 */
export type CalendarMark = PartOfDay | "allDay" | "range";

export const CALENDAR_MARK_ORDER: readonly CalendarMark[] = [
    "morning",
    "afternoon",
    "evening",
    "lateNight",
    "allDay",
    "range",
];

export type PlanCalendarDay = {
    marks: CalendarMark[];
    rows: AgendaPlanRowData[];
};

export type PlanCalendar = ReadonlyMap<string, PlanCalendarDay>;

const NOON_HOUR = 12;
const EVENING_START_HOUR = 17;
const LATE_NIGHT_START_HOUR = 21;
const MORNING_START_HOUR = 5;

export function getPartOfDay(date: Date): PartOfDay {
    const hour = date.getHours();
    if (hour < MORNING_START_HOUR) return "lateNight";
    if (hour < NOON_HOUR) return "morning";
    if (hour < EVENING_START_HOUR) return "afternoon";
    if (hour < LATE_NIGHT_START_HOUR) return "evening";
    return "lateNight";
}

type DayOccupancy = { dateKey: string; mark: CalendarMark };

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function occupiedDays(when: PlanWhen): DayOccupancy[] {
    switch (when.kind) {
        case "exactTime": {
            const at = new Date(when.datetime);
            return [{ dateKey: toLocalDateKey(at), mark: getPartOfDay(at) }];
        }
        case "day":
            return [{ dateKey: toLocalDateKey(new Date(when.date)), mark: "allDay" }];
        case "window": {
            const first = startOfLocalDay(new Date(when.start));
            const last = startOfLocalDay(new Date(when.end));
            if (last.getTime() <= first.getTime()) {
                return [{ dateKey: toLocalDateKey(first), mark: "allDay" }];
            }
            const days: DayOccupancy[] = [];
            for (const cursor = first; cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
                days.push({ dateKey: toLocalDateKey(cursor), mark: "range" });
            }
            return days;
        }
        case "unspecified":
        case "whenever":
            return [];
    }
}

type DayRowEntry = { row: AgendaPlanRowData; mark: CalendarMark };

function compareRowsWithinDay(a: DayRowEntry, b: DayRowEntry): number {
    const markDiff = CALENDAR_MARK_ORDER.indexOf(a.mark) - CALENDAR_MARK_ORDER.indexOf(b.mark);
    if (markDiff !== 0) return markDiff;
    const aStart = a.row.plan.anchorStart ? new Date(a.row.plan.anchorStart).getTime() : 0;
    const bStart = b.row.plan.anchorStart ? new Date(b.row.plan.anchorStart).getTime() : 0;
    return aStart - bStart;
}

/** Groups plans by every local day they occupy. Days with no plans are absent. */
export function buildPlanCalendar(rows: AgendaPlanRowData[]): PlanCalendar {
    const entriesByDay = new Map<string, DayRowEntry[]>();
    for (const row of rows) {
        for (const { dateKey, mark } of occupiedDays(fromPlan(row.plan))) {
            const entries = entriesByDay.get(dateKey) ?? [];
            entries.push({ row, mark });
            entriesByDay.set(dateKey, entries);
        }
    }

    const calendar = new Map<string, PlanCalendarDay>();
    for (const [dateKey, entries] of entriesByDay) {
        entries.sort(compareRowsWithinDay);
        const presentMarks = new Set(entries.map((entry) => entry.mark));
        calendar.set(dateKey, {
            marks: CALENDAR_MARK_ORDER.filter((mark) => presentMarks.has(mark)),
            rows: entries.map((entry) => entry.row),
        });
    }
    return calendar;
}
