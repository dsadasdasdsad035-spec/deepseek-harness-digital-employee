/**
 * Shared wire protocol for the DeepSeek Harness SDK runtime: the
 * newline-delimited JSON-RPC stdio transport plus the named request, result,
 * and notification types both wire ends speak. The runtime server plugin
 * (`@qq296629801/dsh-sdk-jsonrpc-server`) serves this protocol; SDK clients
 * (`@qq296629801/dsh-sdk-client`, the Python SDK) drive it.
 *
 * @module @qq296629801/dsh-sdk-protocol
 */

export { JsonRpcLineTransport, JsonRpcResponseError } from './transport.ts'
export {
  createDigitalEmployeeCompositionId,
  createDigitalEmployeeInstanceId,
  createDigitalEmployeeTemplateId,
} from '@qq296629801/dsh-digital-employee'
export type { DigitalEmployeeIdentityEvent } from '@qq296629801/dsh-digital-employee'
export type { JsonRpcTransportPeer } from './transport.ts'
export type {
  HarnessSdkNotificationMap,
  HarnessSdkRequestMap,
  InitializeParams,
  InitializeResult,
  SdkRunStatus,
  SessionEventNotification,
  SessionStatusNotification,
  SessionPromptParams,
  SessionPromptResult,
  SubagentFinishedNotification,
  SubagentStartedNotification,
} from './types.ts'
