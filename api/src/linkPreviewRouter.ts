// ---------------------------------------------------------------------------
// linkPreviewRouter — public, unauthenticated HTML landing pages + OG images
// for /share/:token and /invite/:token. Mounted BEFORE the OpenAPI validator
// and outside /v1 so the validator doesn't reject these non-JSON routes.
//
// The token is the bearer capability, so no auth is required (and crawlers are
// anonymous). Handlers stay thin: resolve the token, then delegate shaping to
// the pure helpers in services/linkPreview.ts and services/ogImage.ts.
// ---------------------------------------------------------------------------

import express from "express";
import type { PrismaClient } from "@prisma/client";

import {
    buildInvitePreview,
    buildSharePreview,
    formatPlanDateForPreview,
    renderPreviewHtml,
    FALLBACK_PREVIEW,
    type PreviewContent,
} from "./services/linkPreview.js";
import { renderOgPng } from "./services/ogImage.js";

const OG_IMAGE_CACHE_CONTROL = "public, max-age=86400";
const HTML_CACHE_CONTROL = "public, max-age=300";

function sendHtml(
    res: express.Response,
    preview: PreviewContent,
    imageUrl: string,
    canonicalUrl: string,
    active: boolean
): void {
    res.type("html")
        .set("Cache-Control", HTML_CACHE_CONTROL)
        .send(
            renderPreviewHtml({
                title: preview.title,
                description: preview.description,
                imageUrl,
                canonicalUrl,
                active,
            })
        );
}

function sendOgPng(res: express.Response): void {
    res.type("png").set("Cache-Control", OG_IMAGE_CACHE_CONTROL).send(renderOgPng());
}

export function makeLinkPreviewRouter(
    prisma: PrismaClient,
    appBaseUrl: string
): express.Router {
    const router = express.Router();

    router.get("/share/:token/og.png", (_req, res) => sendOgPng(res));
    router.get("/invite/:token/og.png", (_req, res) => sendOgPng(res));

    router.get("/share/:token", async (req, res, next) => {
        try {
            const token = req.params.token;
            const canonicalUrl = `${appBaseUrl}/share/${token}`;
            const imageUrl = `${canonicalUrl}/og.png`;

            const shareToken = await prisma.shareToken.findUnique({
                where: { token },
                include: {
                    plan: {
                        select: {
                            intentText: true,
                            timePrecision: true,
                            anchorStart: true,
                            anchorEnd: true,
                            timezone: true,
                        },
                    },
                },
            });

            if (!shareToken || shareToken.revokedAt) {
                sendHtml(res, FALLBACK_PREVIEW, imageUrl, canonicalUrl, false);
                return;
            }

            const plan = shareToken.plan;
            const preview = buildSharePreview({
                intentText: plan.intentText,
                dateLabel: formatPlanDateForPreview({
                    timePrecision: plan.timePrecision,
                    anchorStart: plan.anchorStart,
                    anchorEnd: plan.anchorEnd,
                    timezone: plan.timezone,
                }),
            });
            sendHtml(res, preview, imageUrl, canonicalUrl, true);
        } catch (e) {
            next(e);
        }
    });

    router.get("/invite/:token", async (req, res, next) => {
        try {
            const token = req.params.token;
            const canonicalUrl = `${appBaseUrl}/invite/${token}`;
            const imageUrl = `${canonicalUrl}/og.png`;

            const invite = await prisma.connectionInvite.findUnique({
                where: { token },
                include: { sender: { select: { displayName: true } } },
            });

            const isActive = Boolean(
                invite && invite.status === "PENDING" && invite.expiresAt > new Date()
            );

            if (!invite || !isActive) {
                sendHtml(res, FALLBACK_PREVIEW, imageUrl, canonicalUrl, false);
                return;
            }

            const preview = buildInvitePreview(invite.sender.displayName);
            sendHtml(res, preview, imageUrl, canonicalUrl, true);
        } catch (e) {
            next(e);
        }
    });

    return router;
}
