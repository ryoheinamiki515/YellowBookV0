import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const UPLOAD_EXPIRY_SECONDS = 300;

export interface R2Config {
    client: S3Client;
    bucket: string;
    publicUrl: string;
}

function defaultConfig(): R2Config {
    return {
        client: new S3Client({
            region: "auto",
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID!,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
            },
        }),
        bucket: process.env.R2_BUCKET_NAME!,
        publicUrl: process.env.R2_PUBLIC_URL!,
    };
}

let _config: R2Config | undefined;
function config(): R2Config {
    _config ??= defaultConfig();
    return _config;
}

export function setR2ConfigForTest(cfg: R2Config) {
    _config = cfg;
}

export function profileImageKey(userId: string): string {
    return `profiles/${userId}`;
}

export async function createProfileImageUploadUrl(userId: string): Promise<{
    uploadUrl: string;
    publicUrl: string;
}> {
    const { client, bucket, publicUrl } = config();
    const key = profileImageKey(userId);

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "image/jpeg",
    });

    const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: UPLOAD_EXPIRY_SECONDS,
        signableHeaders: new Set(["content-type"]),
        unhoistableHeaders: new Set(["content-length"]),
    });

    return {
        uploadUrl,
        publicUrl: `${publicUrl}/${key}`,
    };
}

export async function deleteProfileImage(userId: string): Promise<void> {
    const { client, bucket } = config();
    await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: profileImageKey(userId),
    }));
}
