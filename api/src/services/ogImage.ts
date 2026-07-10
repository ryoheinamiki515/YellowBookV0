// ---------------------------------------------------------------------------
// ogImage — the branded 1200x630 preview image used as og:image for share and
// invite links. og:image must be a raster format (Facebook/iMessage don't
// reliably render SVG), so a hand-written brand SVG is rasterized to PNG via
// resvg. The v1 card carries no live text, so no font files are needed.
//
// buildOgSvg() takes no parameters today; the per-token image routes are the
// seam for a future dynamic variant (plan title/date baked in), which would
// add font loading here without touching the HTML/OG tags.
// ---------------------------------------------------------------------------

import { Resvg } from "@resvg/resvg-js";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// The notebook mark from mobile/assets/icon.svg, scaled and centered on a
// full-bleed honey gradient. Source art lives in a ~1024 box centered around
// (525, 504); translate+scale drops it into the middle of the 1200x630 canvas.
function buildOgSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="#FFD24A"/><stop offset="100%" stop-color="#F2AE14"/>
    </linearGradient>
    <linearGradient id="cover" x1="0" y1="0" x2="0.12" y2="1">
      <stop offset="0%" stop-color="#FFFDF7"/><stop offset="100%" stop-color="#F1E7D2"/>
    </linearGradient>
    <linearGradient id="pages" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#E7DABF"/><stop offset="100%" stop-color="#D8C8A6"/>
    </linearGradient>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#7A5410" flood-opacity="0.30"/>
    </filter>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>
  <g transform="translate(285, 13) scale(0.6)">
    <g filter="url(#sh)">
      <rect x="303" y="238" width="470" height="583" rx="72" fill="url(#pages)"/>
      <rect x="277" y="212" width="470" height="583" rx="72" fill="url(#cover)"/>
    </g>
    <line x1="418" y1="267" x2="418" y2="740" stroke="#2B2521" stroke-width="21" stroke-linecap="round" opacity="0.85"/>
    <path d="M568,188 H642 V480 L605,444 L568,480 Z" fill="#2B2521"/>
  </g>
</svg>`;
}

let cachedPng: Buffer | null = null;

// The v1 image is identical for every request, so it's rendered once and reused.
export function renderOgPng(): Buffer {
    if (cachedPng) return cachedPng;
    const resvg = new Resvg(buildOgSvg(), {
        fitTo: { mode: "width", value: OG_WIDTH },
    });
    cachedPng = Buffer.from(resvg.render().asPng());
    return cachedPng;
}
