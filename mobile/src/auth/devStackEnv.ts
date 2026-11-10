import { devStackApiUrl } from "./devStack";

/** The local dev-stack API URL when this bundle runs on the simulator test stack, else null. */
export const DEV_STACK_API_URL = devStackApiUrl({
    configured: process.env.EXPO_PUBLIC_DEV_STACK_API_URL,
    isDevBundle: __DEV__,
});
