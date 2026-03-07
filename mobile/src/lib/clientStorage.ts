import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export async function readStoredValue(key: string): Promise<string | null> {
    if (isWeb) {
        return localStorage.getItem(key);
    }

    return await SecureStore.getItemAsync(key);
}

export async function writeStoredValue(key: string, value: string) {
    if (isWeb) {
        localStorage.setItem(key, value);
        return;
    }

    await SecureStore.setItemAsync(key, value);
}

export async function removeStoredValue(key: string) {
    if (isWeb) {
        localStorage.removeItem(key);
        return;
    }

    await SecureStore.deleteItemAsync(key);
}
