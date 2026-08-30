/** Client-safe digital employee management requests and results. */
import type { EncodedImageAttachment } from '@deepseek-ai/dsh-attachment'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
/** Browser-safe employee instance identity, structurally shared with the owning service. */
export type DigitalEmployeeInstanceId = Branded<'DigitalEmployeeInstanceId'>
/** Browser-safe employee memory identity, structurally shared with the owning service. */
export type DigitalEmployeeMemoryId = Branded<'DigitalEmployeeMemoryId'>
/** Browser-safe employee chat-submission identity, structurally shared with the owning service. */
export type DigitalEmployeeSubmissionId = Branded<'DigitalEmployeeSubmissionId'>
/** Browser-safe workspace identity, structurally shared with the owning service. */
export type WorkspaceId = Branded<'WorkspaceId'>
/** Request identifying one digital employee. @typert schema */
export interface DigitalEmployeeIdentityRequest {
  readonly employeeId: DigitalEmployeeInstanceId
}
/** Text accepted in the first employee-chat user message. */
export interface DigitalEmployeeStartChatTextContent {
  readonly type: 'text'
  readonly text: string
}
/** Browser-uploaded image admitted before the first employee-chat message is published. */
export interface DigitalEmployeeStartChatImageContent extends EncodedImageAttachment {
  readonly type: 'image'
}
/** First-message content accepted for a digital employee chat. */
export type DigitalEmployeeStartChatContent = DigitalEmployeeStartChatTextContent | DigitalEmployeeStartChatImageContent
/** Request atomically starting one employee-owned chat. @typert schema */
export interface DigitalEmployeeStartChatRequest extends DigitalEmployeeIdentityRequest {
  /** Workspace that owns the new employee Session and supplies its cwd. */
  readonly workspaceId: WorkspaceId
  /** Caller-generated identity reserved for the accepted root Session. */
  readonly sessionId: SessionId
  /** Idempotency identity for one complete submission attempt. */
  readonly submissionId: DigitalEmployeeSubmissionId
  /** Non-empty text or image content admitted as the first user message. */
  readonly content: DigitalEmployeeStartChatContent[]
}
/** Request deleting one memory owned by an employee. @typert schema */
export interface DigitalEmployeeDeleteMemoryRequest extends DigitalEmployeeIdentityRequest {
  readonly memoryId: DigitalEmployeeMemoryId
}
/** Request selecting a root Session whose descendants are listed. @typert schema */
export interface DigitalEmployeeTaskTreeRequest {
  readonly rootSessionId: SessionId
}
/** Client-safe task tree entry for expert and generic subagent descendants. */
export type DigitalEmployeeTaskTreeEntry = {
  readonly kind: 'child'
  readonly id: SessionId
  readonly activity: 'running' | 'inactive'
  readonly hasChildren: boolean
  readonly mode: 'one-shot'
  readonly label?: string
  readonly parentId: SessionId
  readonly depth: number
} | {
  readonly kind: 'child'
  readonly id: SessionId
  readonly activity: 'running' | 'inactive'
  readonly hasChildren: boolean
  readonly mode: 'continuable'
  readonly label: string
  readonly parentId: SessionId
  readonly depth: number
} | {
  readonly kind: 'diagnostic'
  readonly id: SessionId
  readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  readonly parentId: SessionId
  readonly depth: number
}
/** Request controlling one direct expert child through its live parent. @typert schema */
export interface DigitalEmployeeExpertControlRequest {
  readonly parentSessionId: SessionId
  readonly childSessionId: SessionId
}
/** Request continuing one expert child with user text. @typert schema */
export interface DigitalEmployeeExpertContinueRequest extends DigitalEmployeeExpertControlRequest {
  readonly content: DigitalEmployeeExpertContinueContent[]
}
/** Text content accepted for an expert continuation over the management wire. */
export interface DigitalEmployeeExpertContinueContent {
  readonly type: 'text'
  readonly text: string
}
/** Accepted employee-owned chat and first-message identity. */
export interface DigitalEmployeeStartChatValue {
  readonly sessionId: SessionId
  readonly submissionId: DigitalEmployeeSubmissionId
  readonly messageId: MessageId
}
//# sourceMappingURL=types.d.ts.map
