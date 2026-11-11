import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Request, Response } from "express";
import { assertDevAuthAllowed, devAuthenticate, devSubjectFromAuthorization } from "./devAuth.js";

describe("devSubjectFromAuthorization", () => {
    test("maps a dev bearer token to a dev subject", () => {
        assert.equal(devSubjectFromAuthorization("Bearer dev:alice"), "dev|alice");
    });

    const rejected: Array<[label: string, header: string | undefined]> = [
        ["missing header", undefined],
        ["non-dev token", "Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig"],
        ["empty name", "Bearer dev:"],
        ["name with a subject separator", "Bearer dev:alice|admin"],
        ["uppercase name", "Bearer dev:Alice"],
        ["missing Bearer scheme", "dev:alice"],
    ];
    for (const [label, header] of rejected) {
        test(`rejects ${label}`, () => {
            assert.equal(devSubjectFromAuthorization(header), null);
        });
    }
});

describe("devAuthenticate", () => {
    function run(authorization: string | undefined) {
        const req = { header: () => authorization } as unknown as Request;
        let error: unknown = "not called";
        devAuthenticate(req, {} as Response, (err?: unknown) => {
            error = err;
        });
        return { req: req as Request & { auth?: { payload: { sub: string } } }, error };
    }

    test("sets the subject the way the JWT check does", () => {
        const { req, error } = run("Bearer dev:bob");
        assert.equal(error, undefined);
        assert.equal(req.auth?.payload.sub, "dev|bob");
    });

    test("fails with a 401 for anything else", () => {
        const { req, error } = run("Bearer real-jwt");
        assert.equal((error as { status?: number }).status, 401);
        assert.equal((error as Error).name, "UnauthorizedError");
        assert.equal(req.auth, undefined);
    });
});

describe("assertDevAuthAllowed", () => {
    const LOCAL_DB = "postgresql://app:app@localhost:5432/events?schema=public";

    test("allows dev auth outside production with a local database", () => {
        assert.doesNotThrow(() => assertDevAuthAllowed({ DEV_AUTH: "1", DATABASE_URL: LOCAL_DB }));
        assert.doesNotThrow(() =>
            assertDevAuthAllowed({ DEV_AUTH: "1", DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/events" })
        );
    });

    test("refuses dev auth in production", () => {
        assert.throws(
            () => assertDevAuthAllowed({ DEV_AUTH: "1", NODE_ENV: "production", DATABASE_URL: LOCAL_DB }),
            /NODE_ENV=production/
        );
    });

    test("refuses dev auth against a remote or missing database", () => {
        for (const DATABASE_URL of ["postgresql://u:p@db.railway.internal:5432/railway", "not a url", undefined]) {
            assert.throws(() => assertDevAuthAllowed({ DEV_AUTH: "1", DATABASE_URL }), /localhost/, String(DATABASE_URL));
        }
    });

    test("does nothing when dev auth is off", () => {
        assert.doesNotThrow(() => assertDevAuthAllowed({ NODE_ENV: "production" }));
    });
});
