import "dotenv/config";
import { Command } from "commander";
import open from "open";
import os from "os";
import path from "path";
import { mkdir, readFile, writeFile, rm } from "fs/promises";

const program = new Command();

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE!;
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";

const TOKEN_PATH = path.join(os.homedir(), ".config", "social-plans-cli", "token.json");

type TokenFile = {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    obtained_at: number; // epoch ms
};

async function saveToken(t: Omit<TokenFile, "obtained_at">) {
    await mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    const payload: TokenFile = { ...t, obtained_at: Date.now() };
    await writeFile(TOKEN_PATH, JSON.stringify(payload, null, 2), "utf8");
}

async function loadAccessToken(): Promise<string | null> {
    try {
        const raw = await readFile(TOKEN_PATH, "utf8");
        const t = JSON.parse(raw) as TokenFile;
        return t.access_token ?? null;
    } catch {
        return null;
    }
}

async function requireToken(): Promise<string> {
    const token = await loadAccessToken();
    if (!token) throw new Error("Not logged in. Run: social-plans-cli login");
    return token;
}

async function deviceLogin() {
    const codeResp = await fetch(`https://${AUTH0_DOMAIN}/oauth/device/code`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: AUTH0_CLIENT_ID,
            scope: "openid profile email create:socialplans read:socialplans",
            audience: AUTH0_AUDIENCE,
        }),
    });

    if (!codeResp.ok) {
        throw new Error(`Device code request failed: ${codeResp.status} ${await codeResp.text()}`);
    }

    const code = await codeResp.json() as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        interval?: number;
    };

    const verifyUrl = code.verification_uri_complete ?? code.verification_uri;

    console.log(`Opening browser for login...`);
    console.log(`If it doesn't open: ${verifyUrl}`);
    console.log(`Code: ${code.user_code}`);

    await open(verifyUrl);

    const intervalMs = (code.interval ?? 5) * 1000;

    while (true) {
        await new Promise((r) => setTimeout(r, intervalMs));

        const tokenResp = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                device_code: code.device_code,
                client_id: AUTH0_CLIENT_ID,
            }),
        });

        const data = await tokenResp.json();

        if (tokenResp.ok) {
            await saveToken(data);
            console.log("Logged in!");
            return;
        }

        // @ts-ignore
        if (data?.error === "authorization_pending" || data?.error === "slow_down") continue;

        throw new Error(`Login failed: ${JSON.stringify(data)}`);
    }
}

program
    .name("social-plans-cli")
    .description("CLI for Social Plans API")
    .version("0.1.0");

program
    .command("login")
    .description("Login via Auth0 Device Authorization Flow")
    .action(async () => {
        await deviceLogin();
    });

program
    .command("logout")
    .description("Remove saved token")
    .action(async () => {
        await rm(TOKEN_PATH, { force: true });
        console.log("Logged out.");
    });

program
    .command("plans:list")
    .description("List my plans")
    .action(async () => {
        try {
            const token = await requireToken();
            const res = await fetch(`${API_BASE_URL}/plans`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const body = await res.text();
            if (!res.ok) throw new Error(`API error: ${res.status} ${body}`);
            console.log(body);
        } catch (e) {
            // @ts-ignore
            console.error(e.message);
        }
    });

program
    .command("plans:create")
    .description("Create a social plan")
    .requiredOption("--intent <text>", "What's the plan? (e.g. \"lunch Thursday\")")
    .action(async (opts) => {
        try {
            const token = await requireToken();
            const res = await fetch(`${API_BASE_URL}/plans`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ intentText: opts.intent }),
            });
            const body = await res.text();
            if (!res.ok) throw new Error(`API error: ${res.status} ${body}`);
            console.log(body);
        } catch (e) {
            // @ts-ignore
            console.error(e.message);
        }
    });

program.parseAsync(process.argv);
