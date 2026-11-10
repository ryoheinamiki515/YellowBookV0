import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { devAccessTokenFor, devStackApiUrl } from "./devStack";

describe("devStackApiUrl", () => {
    test("returns a local URL in a development bundle", () => {
        assert.equal(devStackApiUrl({ configured: "http://localhost:3100", isDevBundle: true }), "http://localhost:3100");
        assert.equal(devStackApiUrl({ configured: "http://127.0.0.1:3100/", isDevBundle: true }), "http://127.0.0.1:3100/");
    });

    const off: Array<[label: string, configured: string | undefined, isDevBundle: boolean]> = [
        ["a release bundle", "http://localhost:3100", false],
        ["an unset variable", undefined, true],
        ["a remote API", "https://yellowbookv0-production.up.railway.app", true],
        ["a host that only starts with localhost", "http://localhost.example.com", true],
        ["a URL with a path", "http://localhost:3100/evil", true],
    ];
    for (const [label, configured, isDevBundle] of off) {
        test(`is null for ${label}`, () => {
            assert.equal(devStackApiUrl({ configured, isDevBundle }), null);
        });
    }
});

describe("devAccessTokenFor", () => {
    test("builds a dev token for a valid user", () => {
        assert.equal(devAccessTokenFor("alice"), "dev:alice");
    });

    const invalid: Array<[label: string, value: string | string[] | undefined]> = [
        ["a missing param", undefined],
        ["a repeated param", ["alice", "bob"]],
        ["an empty name", ""],
        ["a name with other characters", "alice|admin"],
    ];
    for (const [label, value] of invalid) {
        test(`rejects ${label}`, () => {
            assert.equal(devAccessTokenFor(value), null);
        });
    }
});
