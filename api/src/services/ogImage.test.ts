import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { renderOgPng } from "./ogImage.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("renderOgPng", () => {
    test("returns a PNG buffer", () => {
        const png = renderOgPng();
        assert.ok(Buffer.isBuffer(png));
        assert.ok(png.length > 0);
        assert.ok(png.subarray(0, 8).equals(PNG_MAGIC));
    });

    test("memoizes the rendered image", () => {
        assert.equal(renderOgPng(), renderOgPng());
    });
});
