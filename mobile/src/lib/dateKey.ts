/** Local-calendar day key in `YYYY-MM-DD` form, matching react-native-calendars' dateString. */
export function toLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function dateFromLocalDateKey(dateKey: string, offsetDays = 0): Date {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d + offsetDays);
}

export function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
