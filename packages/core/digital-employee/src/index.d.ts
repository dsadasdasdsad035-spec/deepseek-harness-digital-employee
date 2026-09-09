/**
 * Digital employee Service Definition and template registry.
 * @module @deepseek-ai/dsh-digital-employee
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
import type { CreateDigitalEmployeeRequest, ApplyDigitalEmployeeUpgradeRequest, AppendDigitalEmployeeAuditRequest, DigitalEmployeeAuditId, DigitalEmployeeAuditRecord, DigitalEmployeeCompositionId, DigitalEmployeeIdentityEvent, DigitalEmployeeInstance, DigitalEmployeeInstanceId, DigitalEmployeeLifecycleState, DigitalEmployeeMemoryCandidate, DigitalEmployeeMemoryDecision, DigitalEmployeeMemoryId, DigitalEmployeeMemoryQuery, DigitalEmployeeMemoryRecord, DigitalEmployeeOperationId, DigitalEmployeeSubmissionId, DigitalEmployeeExportArtifact, DigitalEmployeeUpgradePreview, ExportDigitalEmployeeRequest, PreviewDigitalEmployeeUpgradeRequest, DigitalEmployeeTemplate, DigitalEmployeeTemplateId, DigitalEmployeeTaskId, ExpertId, ResolvedDigitalEmployee } from './types.ts';
export type * from './types.ts';
export { assertLifecycleTransition, DigitalEmployeeTemplateSchema } from './schema.ts';
/**
 * Construct a template ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded template identifier.
 */
export declare const createDigitalEmployeeTemplateId: (value: string) => DigitalEmployeeTemplateId;
/**
 * Construct an employee instance ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded employee identifier.
 */
export declare const createDigitalEmployeeInstanceId: (value: string) => DigitalEmployeeInstanceId;
/**
 * Construct a resolved composition ID from its deterministic digest.
 * @param value - complete validated composition digest.
 * @returns branded composition identifier.
 */
export declare const createDigitalEmployeeCompositionId: (value: string) => DigitalEmployeeCompositionId;
/**
 * Project creation-time digital employee ownership from a restored Session log.
 * @param events - complete or partial root Session event sequence.
 * @returns the first recorded ownership snapshot, or `undefined` for a non-employee Session.
 */
export declare function projectDigitalEmployeeOwnership(events: readonly SessionEvent[]): DigitalEmployeeIdentityEvent | undefined;
/**
 * Construct a memory ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded memory identifier.
 */
export declare const createDigitalEmployeeMemoryId: (value: string) => DigitalEmployeeMemoryId;
/**
 * Construct a task ID after validation at the owning parser boundary.
 * @param value - validated task identity.
 * @returns branded employee task identifier.
 */
export declare const createDigitalEmployeeTaskId: (value: string) => DigitalEmployeeTaskId;
/**
 * Construct a submission ID after validation at the owning client boundary.
 * @param value - validated task-start submission identity.
 * @returns branded submission identifier.
 */
export declare const createDigitalEmployeeSubmissionId: (value: string) => DigitalEmployeeSubmissionId;
/**
 * Construct an expert ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded expert identifier.
 */
export declare const createExpertId: (value: string) => ExpertId;
/**
 * Construct an audit ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded audit identifier.
 */
export declare const createDigitalEmployeeAuditId: (value: string) => DigitalEmployeeAuditId;
/**
 * Construct an operation ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded operation identifier.
 */
export declare const createDigitalEmployeeOperationId: (value: string) => DigitalEmployeeOperationId;
/** Provider operations installed behind the stable digital employee service. */
export interface DigitalEmployeeProvider {
    /** List durable employee instances. */
    list(): Promise<readonly DigitalEmployeeInstance[]>;
    /** Read one durable employee instance. */
    get(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance | undefined>;
    /** Create one independent employee instance. */
    create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance>;
    /** Move an employee through a validated lifecycle transition. */
    transition(id: DigitalEmployeeInstanceId, state: DigitalEmployeeLifecycleState): Promise<DigitalEmployeeInstance>;
    /** Delete an employee after owned resources reach quiescence. */
    delete(id: DigitalEmployeeInstanceId): Promise<void>;
    /** Preview one exact template upgrade without mutation. */
    previewUpgrade(request: PreviewDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeUpgradePreview>;
    /** Apply one validated template upgrade atomically. */
    applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance>;
    /** Export one portable credential-free employee artifact. */
    exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact>;
    /** Import one portable artifact as a fresh inactive employee. */
    importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance>;
    /** Resolve one active employee before Session creation. */
    resolve(id: DigitalEmployeeInstanceId): Promise<ResolvedDigitalEmployee>;
    /** Query bounded employee-owned memory. */
    queryMemory(query: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]>;
    /** Review one candidate for long-term memory. */
    promoteMemory(candidate: DigitalEmployeeMemoryCandidate): Promise<DigitalEmployeeMemoryDecision>;
    /** Delete one employee-owned memory. */
    deleteMemory(employeeId: DigitalEmployeeInstanceId, memoryId: DigitalEmployeeMemoryId): Promise<void>;
    /** List attributable operational records. */
    listAudit(employeeId: DigitalEmployeeInstanceId): Promise<readonly DigitalEmployeeAuditRecord[]>;
    /** Persist one attributable operational record after redaction validation. */
    appendAudit(request: AppendDigitalEmployeeAuditRequest): Promise<DigitalEmployeeAuditRecord>;
}
/**
 * Synchronous load-time validation contributed by capability owners.
 * @param template - validated template whose external references must resolve.
 */
export type DigitalEmployeeTemplateReferenceValidator = (template: DigitalEmployeeTemplate) => void;
declare module '@deepseek-ai/cordis' {
    interface Context {
        digitalEmployees: DigitalEmployees;
    }
    interface Events {
        /**
         * A template version was registered or removed.
         * @mode emit
         * @param templateId - stable template identifier.
         * @param version - exact template version.
         */
        'digital-employees/template-change'(templateId: DigitalEmployeeTemplateId, version: string): void;
        /**
         * A durable employee lifecycle state changed.
         * @mode emit
         * @param employeeId - stable employee identifier.
         * @param state - newly committed lifecycle state.
         */
        'digital-employees/instance-change'(employeeId: DigitalEmployeeInstanceId, state: DigitalEmployeeLifecycleState): void;
        /**
         * Owned Agent and MCP resources must reach quiescence before durable deletion.
         * @mode serial
         * @param employeeId - employee whose resources must be released.
         */
        'digital-employees/before-delete'(employeeId: DigitalEmployeeInstanceId): Promise<void> | void;
    }
}
/** Registry and provider facade for digital employee capabilities. */
export declare class DigitalEmployees extends Service {
    private readonly templates;
    private readonly templateReferenceValidators;
    private provider;
    constructor(ctx: Context);
    /**
     * Register one immutable template version for the current plugin lifetime.
     * @param contribution - trusted template contribution to validate and publish.
     * @returns disposer that removes this exact template version.
     */
    registerTemplate(contribution: DigitalEmployeeTemplate): () => void;
    /**
     * Register load-time validation for template references owned by another capability.
     * @param validate - synchronous validator that throws a resource-specific diagnostic.
     * @returns disposer removing this exact validator.
     */
    registerTemplateReferenceValidator(validate: DigitalEmployeeTemplateReferenceValidator): () => void;
    /**
     * Configure the sole durable provider for the current plugin lifetime.
     * @param provider - provider implementing instance, memory, and audit operations.
     * @returns disposer that removes this exact provider.
     */
    configureProvider(provider: DigitalEmployeeProvider): () => void;
    /**
     * List registered template versions in deterministic identity/version order.
     * @returns immutable template snapshots.
     */
    listTemplates(): readonly DigitalEmployeeTemplate[];
    /**
     * Read one exact registered template version.
     * @param id - template identity.
     * @param version - exact registered version.
     * @returns matching contribution, or `undefined`.
     */
    getTemplate(id: DigitalEmployeeTemplateId, version: string): DigitalEmployeeTemplate | undefined;
    /**
     * List durable employee instances through the configured provider.
     * @returns durable employee snapshots.
     */
    list(): Promise<readonly DigitalEmployeeInstance[]>;
    /**
     * Read one durable employee instance through the configured provider.
     * @param id - employee identity.
     * @returns matching employee, or `undefined`.
     */
    get(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance | undefined>;
    /**
     * Inspect one required employee instance.
     * @param id - employee identity.
     * @returns matching employee snapshot.
     */
    inspect(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance>;
    /**
     * Create one durable employee instance through the configured provider.
     * @param request - validated creation request.
     * @returns created employee snapshot.
     */
    create(request: CreateDigitalEmployeeRequest): Promise<DigitalEmployeeInstance>;
    /**
     * Change one employee lifecycle state through the configured provider.
     * @param id - employee identity.
     * @param state - requested next state.
     * @returns committed employee snapshot.
     */
    transition(id: DigitalEmployeeInstanceId, state: DigitalEmployeeLifecycleState): Promise<DigitalEmployeeInstance>;
    /**
     * Activate one inactive employee.
     * @param id - employee identity.
     * @returns active employee snapshot.
     */
    activate(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance>;
    /**
     * Deactivate one active employee without removing history or memory.
     * @param id - employee identity.
     * @returns inactive employee snapshot.
     */
    deactivate(id: DigitalEmployeeInstanceId): Promise<DigitalEmployeeInstance>;
    /**
     * Delete one employee and its owned durable state through the configured provider.
     * @param id - employee identity.
     */
    delete(id: DigitalEmployeeInstanceId): Promise<void>;
    /**
     * Preview one exact template upgrade without mutating the employee.
     * @param request - employee and target template version.
     * @returns capability differences requiring review.
     */
    previewUpgrade(request: PreviewDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeUpgradePreview>;
    /**
     * Apply a reviewed template upgrade atomically.
     * @param request - target version plus explicitly approved new capabilities.
     * @returns upgraded employee snapshot.
     */
    applyUpgrade(request: ApplyDigitalEmployeeUpgradeRequest): Promise<DigitalEmployeeInstance>;
    /**
     * Export one credential-free portable employee artifact.
     * @param request - employee identity and optional memory selection.
     * @returns versioned portable artifact.
     */
    exportEmployee(request: ExportDigitalEmployeeRequest): Promise<DigitalEmployeeExportArtifact>;
    /**
     * Import portable data as a fresh inactive employee.
     * @param artifact - validated versioned portable employee data.
     * @returns imported employee snapshot.
     */
    importEmployee(artifact: DigitalEmployeeExportArtifact): Promise<DigitalEmployeeInstance>;
    /**
     * Resolve one active employee before creating a task Session.
     * @param id - employee identity.
     * @returns complete existing-Agent composition.
     */
    resolve(id: DigitalEmployeeInstanceId): Promise<ResolvedDigitalEmployee>;
    /**
     * Query bounded employee memory through the configured provider.
     * @param query - employee-owned retrieval query.
     * @returns ranked bounded memory records.
     */
    queryMemory(query: DigitalEmployeeMemoryQuery): Promise<readonly DigitalEmployeeMemoryRecord[]>;
    /**
     * Submit a long-term memory candidate through the configured provider.
     * @param candidate - structured candidate with provenance.
     * @returns accepted memory or rejection reason.
     */
    promoteMemory(candidate: DigitalEmployeeMemoryCandidate): Promise<DigitalEmployeeMemoryDecision>;
    /**
     * Delete one employee-owned memory through the configured provider.
     * @param employeeId - owning employee.
     * @param memoryId - memory to remove.
     */
    deleteMemory(employeeId: DigitalEmployeeInstanceId, memoryId: DigitalEmployeeMemoryId): Promise<void>;
    /**
     * List employee audit history through the configured provider.
     * @param employeeId - owning employee.
     * @returns chronological audit records.
     */
    listAudit(employeeId: DigitalEmployeeInstanceId): Promise<readonly DigitalEmployeeAuditRecord[]>;
    /**
     * Persist one attributable operational record.
     * @param request - redacted audit fields without provider-owned identity and time.
     * @returns committed audit record.
     */
    appendAudit(request: AppendDigitalEmployeeAuditRequest): Promise<DigitalEmployeeAuditRecord>;
    private requiredProvider;
}
export default DigitalEmployees;
//# sourceMappingURL=index.d.ts.map