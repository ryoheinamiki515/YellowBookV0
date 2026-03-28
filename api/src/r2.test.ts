import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import {
    createProfileImageUploadUrl,
    deleteProfileImage,
    profileImageKey,
    setR2ConfigForTest,
} from "./r2.js";

const TEST_BUCKET = "test-bucket";
const TEST_PUBLIC_URL = "https://pub-test.r2.dev";
const TEST_USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// Presigning is a local crypto operation — no network calls — so a real
// S3Client with dummy credentials works fine for testing.
function makeTestClient(): S3Client {
    return new S3Client({
        region: "auto",
        endpoint: "https://fake-account.r2.cloudflarestorage.com",
        credentials: { accessKeyId: "fake-key", secretAccessKey: "fake-secret" },
    });
}

interface CapturedCommand {
    Bucket?: string;
    Key?: string;
}

function makeCaptureClient(): { client: S3Client; sent: CapturedCommand[] } {
    const sent: CapturedCommand[] = [];
    const real = makeTestClient();
    const client = new Proxy(real, {
        get(target, prop) {
            if (prop === "send") {
                return (command: any) => {
                    sent.push(command.input as CapturedCommand);
                    return Promise.resolve({});
                };
            }
            return (target as any)[prop];
        },
    });
    return { client, sent };
}

describe("r2", () => {
    beforeEach(() => {
        setR2ConfigForTest({
            client: makeTestClient(),
            bucket: TEST_BUCKET,
            publicUrl: TEST_PUBLIC_URL,
        });
    });

    test("profileImageKey returns profiles/{userId}", () => {
        assert.equal(profileImageKey(TEST_USER_ID), `profiles/${TEST_USER_ID}`);
    });

    describe("createProfileImageUploadUrl", () => {
        test("returns a publicUrl with cache-busting version param", async () => {
            const result = await createProfileImageUploadUrl(TEST_USER_ID);
            const url = new URL(result.publicUrl);
            assert.equal(url.origin, TEST_PUBLIC_URL);
            assert.equal(url.pathname, `/profiles/${TEST_USER_ID}`);
            assert.ok(url.searchParams.has("v"), "publicUrl should include ?v= cache-buster");
        });

        test("returns a presigned uploadUrl containing the key path", async () => {
            const result = await createProfileImageUploadUrl(TEST_USER_ID);
            assert.ok(result.uploadUrl.includes(`profiles/${TEST_USER_ID}`));
        });
    });

    describe("deleteProfileImage", () => {
        test("sends a DeleteObjectCommand with the correct bucket and key", async () => {
            const { client, sent } = makeCaptureClient();
            setR2ConfigForTest({ client, bucket: TEST_BUCKET, publicUrl: TEST_PUBLIC_URL });

            await deleteProfileImage(TEST_USER_ID);

            assert.equal(sent.length, 1);
            assert.equal(sent[0]!.Bucket, TEST_BUCKET);
            assert.equal(sent[0]!.Key, `profiles/${TEST_USER_ID}`);
        });
    });
});
