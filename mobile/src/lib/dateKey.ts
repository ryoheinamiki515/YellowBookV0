/** Local-calendar day key in `YYYY-MM-DD` form, matching react-native-calendars' dateString. */
export function toLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function isoToLocalDateKey(iso: string): string {
    return toLocalDateKey(new Date(iso));
}
