import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
    escapeHtml,
    formatPlanDateForPreview,
    buildSharePreview,
    buildInvitePreview,
    renderPreviewHtml,
    FALLBACK_PREVIEW,
} from "./linkPreview.js";

describe("escapeHtml", () => {
    test("neutralizes markup and quote characters", () => {
        const escaped = escapeHtml(`<script>"alert" & 'go'`);
        assert.equal(escaped, "&lt;script&gt;&quot;alert&quot; &amp; &#39;go&#39;");
        assert.ok(!escaped.includes("<script>"));
    });
});

describe("formatPlanDateForPreview", () => {
    test("EXACT renders date and time in the plan timezone", () => {
        // 02:00 UTC is the previous evening (19:00) in Los Angeles.
        const label = formatPlanDateForPreview({
            timePrecision: "EXACT",
            anchorStart: "2026-07-18T02:00:00.000Z",
            anchorEnd: null,
            timezone: "America/Los_Angeles",
        });
        assert.ok(label);
        assert.ok(label!.includes("Jul 17"), label!);
        assert.ok(label!.includes("7:00") && label!.includes("PM"), label!);
    });

    test("WINDOW with a single day renders one date, no range dash", () => {
        const label = formatPlanDateForPreview({
            timePrecision: "WINDOW",
            anchorStart: "2026-07-18T12:00:00.000Z",
            anchorEnd: null,
            timezone: "UTC",
        });
        assert.ok(label);
        assert.ok(label!.includes("Jul 18"), label!);
        assert.ok(!label!.includes("–"), label!);
    });

    test("WINDOW with a multi-day range renders both endpoints", () => {
        const label = formatPlanDateForPreview({
            timePrecision: "WINDOW",
            anchorStart: "2026-07-18T12:00:00.000Z",
            anchorEnd: "2026-07-22T12:00:00.000Z",
            timezone: "UTC",
        });
        assert.ok(label);
        assert.ok(label!.includes("Jul 18") && label!.includes("Jul 22"), label!);
        assert.ok(label!.includes("–"), label!);
    });

    test("NONE and UNSPECIFIED have no concrete date", () => {
        assert.equal(
            formatPlanDateForPreview({
                timePrecision: "NONE",
                anchorStart: null,
                anchorEnd: null,
                timezone: null,
            }),
            null
        );
        assert.equal(
            formatPlanDateForPreview({
                timePrecision: "UNSPECIFIED",
                anchorStart: null,
                anchorEnd: null,
                timezone: null,
            }),
            null
        );
    });
});

describe("buildSharePreview", () => {
    test("uses the intent and date label", () => {
        const preview = buildSharePreview({
            intentText: "Dinner at Luca's",
            dateLabel: "Fri, Jul 18",
        });
        assert.equal(preview.title, "Dinner at Luca's");
        assert.equal(preview.description, "Fri, Jul 18");
    });

    test("falls back to a generic line when there is no date", () => {
        const preview = buildSharePreview({ intentText: "Coffee", dateLabel: null });
        assert.equal(preview.title, "Coffee");
        assert.equal(preview.description, "A plan on YellowBook");
    });

    test("falls back to a generic title when intent is blank", () => {
        const preview = buildSharePreview({ intentText: "   ", dateLabel: null });
        assert.equal(preview.title, "A plan on YellowBook");
    });
});

describe("buildInvitePreview", () => {
    test("includes the inviter name", () => {
        const preview = buildInvitePreview("Alex");
        assert.equal(preview.title, "Connect with Alex on YellowBook");
    });

    test("falls back when the inviter has no display name", () => {
        assert.equal(
            buildInvitePreview(null).title,
            "Connect with a friend on YellowBook"
        );
        assert.equal(
            buildInvitePreview("  ").title,
            "Connect with a friend on YellowBook"
        );
    });
});

describe("renderPreviewHtml", () => {
    const base = {
        imageUrl: "https://example.com/share/tok/og.png",
        canonicalUrl: "https://example.com/share/tok",
        active: true,
    };

    test("emits Open Graph and Twitter card tags", () => {
        const html = renderPreviewHtml({
            ...base,
            title: "Dinner",
            description: "Fri, Jul 18",
        });
        assert.ok(html.includes('property="og:title" content="Dinner"'));
        assert.ok(html.includes('property="og:description" content="Fri, Jul 18"'));
        assert.ok(html.includes(`property="og:image" content="${base.imageUrl}"`));
        assert.ok(html.includes(`property="og:url" content="${base.canonicalUrl}"`));
        assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
    });

    test("escapes user-controlled values in meta tags", () => {
        const html = renderPreviewHtml({
            ...base,
            title: `Party <img src=x onerror="alert(1)">`,
            description: "ok",
        });
        assert.ok(!html.includes("<img src=x"));
        assert.ok(html.includes("Party &lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
    });

    test("inactive links render the expired body message", () => {
        const html = renderPreviewHtml({
            ...FALLBACK_PREVIEW,
            ...base,
            active: false,
        });
        assert.ok(html.includes("no longer active"));
    });
});
