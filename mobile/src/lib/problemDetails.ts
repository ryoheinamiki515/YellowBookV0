export function getProblemDetail(error: unknown): string {
    if (!error || typeof error !== "object") {
        return "";
    }

    const candidate = error as {
        problem?: { detail?: string };
        data?: { detail?: string };
        message?: string;
    };

    return (
        candidate.problem?.detail ??
        candidate.data?.detail ??
        candidate.message ??
        ""
    );
}
