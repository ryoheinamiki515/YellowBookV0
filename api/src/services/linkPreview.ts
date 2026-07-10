// ---------------------------------------------------------------------------
// linkPreview — pure helpers for the public share/invite HTML landing pages
// that iMessage/Messenger/etc. crawl for Open Graph preview cards.
//
// Route handlers (linkPreviewRouter.ts) resolve a token to plan/inviter data
// and call these to shape the preview text and render the HTML. Kept pure so
// they're unit-testable without an HTTP server or a live Prisma.
// ---------------------------------------------------------------------------

const SITE_NAME = "YellowBook";
const BRAND_TAGLINE =
    "A calm, private notebook for staying close to the people you care about.";

export type PreviewContent = {
    title: string;
    description: string;
};

// A revoked/expired/unknown token still renders a clean branded card rather
// than an ugly error preview.
export const FALLBACK_PREVIEW: PreviewContent = {
    title: SITE_NAME,
    description: BRAND_TAGLINE,
};

// ---------------------------------------------------------------------------
// HTML escaping — plan intent text is user-controlled and flows into meta tag
// attributes and page body, so it must be neutralized against markup injection.
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Date formatting — server-side port of the storage→display interpretation in
// mobile/src/lib/planWhen.ts (fromStorageFields). Returns a short, date-only
// label; null when the plan has no concrete date (caller falls back to a
// generic line, which also keeps undated plans out of crawler caches).
// ---------------------------------------------------------------------------

export type PlanDateFields = {
    timePrecision: string;
    anchorStart: Date | string | null;
    anchorEnd: Date | string | null;
    timezone: string | null;
};

function toDate(value: Date | string | null): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function withTimeZone(
    options: Intl.DateTimeFormatOptions,
    timezone: string | null
): Intl.DateTimeFormatOptions {
    return timezone ? { ...options, timeZone: timezone } : options;
}

function formatWeekdayDate(date: Date, timezone: string | null): string {
    return new Intl.DateTimeFormat(
        "en-US",
        withTimeZone({ weekday: "short", month: "short", day: "numeric" }, timezone)
    ).format(date);
}

function formatMonthDay(date: Date, timezone: string | null): string {
    return new Intl.DateTimeFormat(
        "en-US",
        withTimeZone({ month: "short", day: "numeric" }, timezone)
    ).format(date);
}

function formatTime(date: Date, timezone: string | null): string {
    return new Intl.DateTimeFormat(
        "en-US",
        withTimeZone({ hour: "numeric", minute: "2-digit" }, timezone)
    ).format(date);
}

function dayKey(date: Date, timezone: string | null): string {
    // en-CA yields an ISO-like YYYY-MM-DD, so same-calendar-day comparison in
    // the plan's timezone is a plain string equality.
    return new Intl.DateTimeFormat(
        "en-CA",
        withTimeZone({ year: "numeric", month: "2-digit", day: "2-digit" }, timezone)
    ).format(date);
}

export function formatPlanDateForPreview(fields: PlanDateFields): string | null {
    const timezone = fields.timezone ?? null;
    const start = toDate(fields.anchorStart);
    const end = toDate(fields.anchorEnd);

    switch (fields.timePrecision) {
        case "EXACT":
            if (!start) return null;
            return `${formatWeekdayDate(start, timezone)} · ${formatTime(start, timezone)}`;
        case "WINDOW": {
            if (!start) return null;
            if (!end || dayKey(start, timezone) === dayKey(end, timezone)) {
                return formatWeekdayDate(start, timezone);
            }
            return `${formatWeekdayDate(start, timezone)} – ${formatMonthDay(end, timezone)}`;
        }
        default:
            // NONE, UNSPECIFIED, or anything unexpected → no concrete date.
            return null;
    }
}

// ---------------------------------------------------------------------------
// Preview content builders
// ---------------------------------------------------------------------------

export function buildSharePreview(input: {
    intentText: string;
    dateLabel: string | null;
}): PreviewContent {
    return {
        title: input.intentText.trim() || `A plan on ${SITE_NAME}`,
        description: input.dateLabel ?? `A plan on ${SITE_NAME}`,
    };
}

export function buildInvitePreview(inviterName: string | null): PreviewContent {
    const name = inviterName?.trim();
    return {
        title: `Connect with ${name || "a friend"} on ${SITE_NAME}`,
        description: BRAND_TAGLINE,
    };
}

// ---------------------------------------------------------------------------
// HTML rendering
// ---------------------------------------------------------------------------

export function renderPreviewHtml(input: {
    title: string;
    description: string;
    imageUrl: string;
    canonicalUrl: string;
    active: boolean;
}): string {
    const title = escapeHtml(input.title);
    const description = escapeHtml(input.description);
    const imageUrl = escapeHtml(input.imageUrl);
    const canonicalUrl = escapeHtml(input.canonicalUrl);

    const bodyMessage = input.active
        ? `Open this in the ${SITE_NAME} app to see the details.`
        : "This link is no longer active.";

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · ${SITE_NAME}</title>
<meta name="description" content="${description}" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonicalUrl}" />
<meta property="og:image" content="${imageUrl}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${imageUrl}" />
<style>
  :root { color-scheme: light; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #FBF8F3;
    color: #2A2420;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
  }
  .card {
    max-width: 480px;
    width: 100%;
    text-align: center;
    background: #FFFFFF;
    border: 1px solid #EDE7DC;
    border-radius: 24px;
    padding: 32px 28px;
    box-shadow: 0 12px 32px rgba(122, 84, 16, 0.08);
  }
  .card img { width: 96px; height: 96px; border-radius: 20px; }
  h1 { font-size: 22px; margin: 20px 0 8px; }
  p { font-size: 16px; line-height: 1.5; color: #645850; margin: 0 0 20px; }
  .cta {
    display: inline-block;
    background: #F5C842;
    color: #2A2420;
    font-weight: 600;
    text-decoration: none;
    padding: 12px 24px;
    border-radius: 999px;
  }
</style>
</head>
<body>
  <main class="card">
    <img src="${imageUrl}" alt="${SITE_NAME}" />
    <h1>${title}</h1>
    <p>${description}</p>
    <a class="cta" href="${canonicalUrl}">${escapeHtml(bodyMessage)}</a>
  </main>
</body>
</html>`;
}
