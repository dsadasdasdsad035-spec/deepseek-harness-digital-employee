/**
 * Branded identifier constructors validated at their owning parser boundaries.
 * @module @deepseek-ai/dsh-digital-employee/ids
 */

import type {
  DigitalEmployeeAuditId,
  DigitalEmployeeCompositionId,
  DigitalEmployeeInstanceId,
  DigitalEmployeeMemoryId,
  DigitalEmployeeOperationId,
  DigitalEmployeeSubmissionId,
  DigitalEmployeeTaskId,
  DigitalEmployeeTemplateId,
  ExpertId,
} from './types.ts'

/**
 * Construct a template ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded template identifier.
 */
export const createDigitalEmployeeTemplateId = (value: string): DigitalEmployeeTemplateId =>
  value as DigitalEmployeeTemplateId

/**
 * Construct an instance ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded instance identifier.
 */
export const createDigitalEmployeeInstanceId = (value: string): DigitalEmployeeInstanceId =>
  value as DigitalEmployeeInstanceId

/**
 * Construct a composition digest after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded composition identifier.
 */
export const createDigitalEmployeeCompositionId = (value: string): DigitalEmployeeCompositionId =>
  value as DigitalEmployeeCompositionId

/**
 * Construct a memory ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded memory identifier.
 */
export const createDigitalEmployeeMemoryId = (value: string): DigitalEmployeeMemoryId =>
  value as DigitalEmployeeMemoryId

/**
 * Construct a task ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded task identifier.
 */
export const createDigitalEmployeeTaskId = (value: string): DigitalEmployeeTaskId =>
  value as DigitalEmployeeTaskId

/**
 * Construct a submission ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded submission identifier.
 */
export const createDigitalEmployeeSubmissionId = (value: string): DigitalEmployeeSubmissionId =>
  value as DigitalEmployeeSubmissionId

/**
 * Construct an expert ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded expert identifier.
 */
export const createExpertId = (value: string): ExpertId => value as ExpertId

/**
 * Construct an audit ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded audit identifier.
 */
export const createDigitalEmployeeAuditId = (value: string): DigitalEmployeeAuditId =>
  value as DigitalEmployeeAuditId

/**
 * Construct an operation ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded operation identifier.
 */
export const createDigitalEmployeeOperationId = (value: string): DigitalEmployeeOperationId =>
  value as DigitalEmployeeOperationId
