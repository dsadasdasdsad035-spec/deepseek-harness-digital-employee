/** Fixed product bound for one session-search page served to the client. */
export const SESSION_SEARCH_RESULT_LIMIT = 20;
/**
 * Convert a rejected transport operation into a generic failure result.
 * @param error - rejected transport value.
 * @returns an `internal` failure preserving the available message.
 */
export function transportError(error) {
    return {
        ok: false,
        error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
    };
}
//# sourceMappingURL=rpc-errors.js.map