/**
 * Validation for trusted template contributions and durable lifecycle requests.
 * @module @deepseek-ai/dsh-digital-employee/schema
 */
import type { DigitalEmployeeLifecycleState, DigitalEmployeeTemplate } from './types.ts';
/**
 * Validate and return one digital employee template contribution.
 * @param value - parsed plugin contribution.
 * @returns normalized validated template.
 */
export declare const DigitalEmployeeTemplateSchema: (value: unknown) => DigitalEmployeeTemplate;
/**
 * Assert that a persisted employee may move between two lifecycle states.
 * @param from - current committed state.
 * @param to - requested next state.
 */
export declare function assertLifecycleTransition(from: DigitalEmployeeLifecycleState, to: DigitalEmployeeLifecycleState): void;
//# sourceMappingURL=schema.d.ts.map