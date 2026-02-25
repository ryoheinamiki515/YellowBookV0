export type AuthSessionInvalidationEvent = {
    kind: "unauthorized";
    status: 401;
    url?: string;
};

type AuthSessionInvalidationListener = (
    event: AuthSessionInvalidationEvent
) => void;

const listeners = new Set<AuthSessionInvalidationListener>();

let lastEventKey: string | null = null;
let lastEventAtMs = 0;

export function subscribeAuthSessionInvalidation(
    listener: AuthSessionInvalidationListener
) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function emitAuthSessionInvalidation(event: AuthSessionInvalidationEvent) {
    const key = `${event.kind}:${event.status}:${event.url ?? ""}`;
    const now = Date.now();

    // Multiple queries can fail at once when a token expires; coalesce the burst.
    if (lastEventKey === key && now - lastEventAtMs < 1000) {
        return;
    }

    lastEventKey = key;
    lastEventAtMs = now;

    for (const listener of listeners) {
        try {
            listener(event);
        } catch (error) {
            console.error("Auth invalidation listener failed", error);
        }
    }
}
