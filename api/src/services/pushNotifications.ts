import type { PrismaClient } from "@prisma/client";

// Expo Push Service — https://docs.expo.dev/push-notifications/sending-notifications/
// We speak the HTTP API directly (raw fetch) rather than pulling in expo-server-sdk;
// the payloads are simple and we have no batching/receipt needs beyond this.
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Expo accepts at most 100 messages per request.
const EXPO_BATCH_SIZE = 100;

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

export interface ExpoPushMessage {
    to: string;
    title: string;
    body: string;
    sound: "default";
    data?: Record<string, unknown>;
}

interface ExpoPushTicket {
    status: "ok" | "error";
    id?: string;
    message?: string;
    details?: { error?: string };
}

type FetchLike = typeof fetch;

export function buildExpoMessages(tokens: string[], payload: PushPayload): ExpoPushMessage[] {
    return tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        sound: "default",
        ...(payload.data ? { data: payload.data } : {}),
    }));
}

function chunk<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
}

/**
 * Tokens Expo reports as no longer valid (app uninstalled / token rotated).
 * Tickets are returned index-aligned with the messages that were sent.
 */
export function unregisteredTokens(
    messages: ExpoPushMessage[],
    tickets: ExpoPushTicket[]
): string[] {
    const dead: string[] = [];
    tickets.forEach((ticket, i) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
            const message = messages[i];
            if (message) dead.push(message.to);
        }
    });
    return dead;
}

/** POST messages to Expo in batches; returns tickets index-aligned with `messages`. */
export async function sendExpoPushMessages(
    messages: ExpoPushMessage[],
    fetchImpl: FetchLike = fetch
): Promise<ExpoPushTicket[]> {
    const tickets: ExpoPushTicket[] = [];
    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
        const res = await fetchImpl(EXPO_PUSH_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(batch),
        });
        const json = (await res.json()) as { data?: ExpoPushTicket[] };
        tickets.push(...(json.data ?? []));
    }
    return tickets;
}

/**
 * Send a push to every device registered to any of `userIds`. Best-effort:
 * failures are logged and swallowed so a push never breaks the request that
 * triggered it. Tokens Expo reports as unregistered are pruned.
 */
export async function sendPushToUsers(
    prisma: PrismaClient,
    userIds: string[],
    payload: PushPayload,
    fetchImpl: FetchLike = fetch
): Promise<void> {
    if (userIds.length === 0) return;

    try {
        const rows = await prisma.pushToken.findMany({
            where: { userId: { in: userIds } },
            select: { token: true },
        });
        const tokens = rows.map((r) => r.token);
        if (tokens.length === 0) return;

        const messages = buildExpoMessages(tokens, payload);
        const tickets = await sendExpoPushMessages(messages, fetchImpl);

        const dead = unregisteredTokens(messages, tickets);
        if (dead.length > 0) {
            await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
        }
    } catch (err) {
        console.error("Failed to send push notification", err);
    }
}
