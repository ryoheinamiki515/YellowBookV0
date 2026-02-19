import { z } from "zod";

const CursorSchema = z.object({
    updatedAt: z.string().datetime(),
    id: z.string().uuid(),
});

export type PlanCursor = z.infer<typeof CursorSchema>;

export function encodeCursor(c: PlanCursor) {
    return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): PlanCursor {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    return CursorSchema.parse(JSON.parse(raw));
}
