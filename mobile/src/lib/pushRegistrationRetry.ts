const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;

/**
 * Exponential backoff (capped) for retrying push-token registration after a
 * transient failure — offline, or a 5xx from the API. Attempt 0 is the first
 * retry after the initial failure.
 */
export function pushRegistrationRetryDelayMs(attempt: number): number {
    const exponential = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt);
    return Math.min(MAX_RETRY_DELAY_MS, exponential);
}
