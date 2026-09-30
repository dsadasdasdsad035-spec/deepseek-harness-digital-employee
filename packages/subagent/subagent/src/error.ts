/**
 * Typed failures shared by subagent service and provider operations.
 *
 * @module @qq296629801/dsh-subagent
 */

import { HarnessError } from '@qq296629801/dsh-llm'

/** Typed failure for the subagent seam. */
export class SubagentError extends HarnessError {
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.name = 'SubagentError'
  }
}
