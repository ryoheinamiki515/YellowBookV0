import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PRIVACY_PAGE, SUPPORT_EMAIL, SUPPORT_PAGE, TERMS_PAGE, renderLegalPage } from "./legalPages.js";

describe("renderLegalPage", () => {
    test("renders a complete HTML document with the page title", () => {
        const html = renderLegalPage(PRIVACY_PAGE);

        assert.match(html, /^<!doctype html>/);
        assert.match(html, /<title>Privacy Policy · YellowBook<\/title>/);
        assert.match(html, /<h1>Privacy Policy<\/h1>/);
    });

    test("every page gives users a way to reach support", () => {
        for (const page of [SUPPORT_PAGE, PRIVACY_PAGE, TERMS_PAGE]) {
            assert.ok(renderLegalPage(page).includes(`mailto:${SUPPORT_EMAIL}`), page.path);
        }
    });

    test("support and privacy pages explain in-app account deletion", () => {
        for (const page of [SUPPORT_PAGE, PRIVACY_PAGE]) {
            assert.ok(page.body.includes("Delete Account"), page.path);
        }
    });
});
