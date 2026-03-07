import { readStoredValue, removeStoredValue, writeStoredValue } from "./clientStorage";

const TOKEN_KEY = "auth_token";

export async function saveToken(token: string) {
    await writeStoredValue(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
    return await readStoredValue(TOKEN_KEY);
}

export async function removeToken() {
    await removeStoredValue(TOKEN_KEY);
}
