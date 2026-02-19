import type { SocialPlan } from "@prisma/client";

export function planEtag(p: Pick<SocialPlan, "id" | "updatedAt">) {
    // Strong enough for app-level optimistic concurrency; always include quotes per HTTP.
    return `"plan:${p.id}:${p.updatedAt.getTime()}"`;
}

export function ifMatchFailed(ifMatch: string | undefined, currentEtag: string) {
    return !!ifMatch && ifMatch !== currentEtag;
}
