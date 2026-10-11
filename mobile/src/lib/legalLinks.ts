const webBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export const PRIVACY_POLICY_URL = `${webBaseUrl}/privacy`;
export const TERMS_OF_SERVICE_URL = `${webBaseUrl}/terms`;
