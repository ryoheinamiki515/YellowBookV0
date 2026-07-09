import { sanitizeInternalPath } from "./internalPath";

// Notification `data.type` values sent by the backend. Kept in sync with the
// api service that builds the push payload (services/pushNotifications.ts).
export const NOTIFICATION_TYPE_PLAN_SHARED = "plan_shared";

/**
 * Map a notification's `data` payload to the internal app route to open when the
 * user taps it. Returns null for payloads we don't recognize or can't route.
 */
export function notificationRouteForData(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const record = data as Record<string, unknown>;

    switch (record.type) {
        case NOTIFICATION_TYPE_PLAN_SHARED: {
            const planId = record.planId;
            if (typeof planId !== "string" || planId.length === 0) return null;
            // encodeURIComponent guards against a malicious planId escaping the route.
            return sanitizeInternalPath(`/plan/${encodeURIComponent(planId)}`);
        }
        default:
            return null;
    }
}
