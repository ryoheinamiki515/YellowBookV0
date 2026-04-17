import { readStoredValue, removeStoredValue, writeStoredValue } from "./clientStorage";

const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

export async function saveToken(token: string) {
    await writeStoredValue(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
    return await readStoredValue(TOKEN_KEY);
}

export async function removeToken() {
    await removeStoredValue(TOKEN_KEY);
}

export async function saveRefreshToken(token: string) {
    await writeStoredValue(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
    return await readStoredValue(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken() {
    await removeStoredValue(REFRESH_TOKEN_KEY);
}
