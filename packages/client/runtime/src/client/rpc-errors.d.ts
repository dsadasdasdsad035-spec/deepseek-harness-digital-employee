/**
 * Result-side RPC values the client runtimes share. Restated locally (rather
 * than imported from the Host api layer) so this browser package depends only
 * on its own sources.
 */
import type { RpcResult } from '@deepseek-ai/dsh-api-remotes/client';
/** Fixed product bound for one session-search page served to the client. */
export declare const SESSION_SEARCH_RESULT_LIMIT = 20;
/**
 * Convert a rejected transport operation into a generic failure result.
 * @param error - rejected transport value.
 * @returns an `internal` failure preserving the available message.
 */
export declare function transportError<T>(error: unknown): RpcResult<T>;
//# sourceMappingURL=rpc-errors.d.ts.map