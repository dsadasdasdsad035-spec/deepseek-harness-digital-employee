/**
 * Digital employee Service Definition and template registry.
 * @module @deepseek-ai/dsh-digital-employee
 */
import { Service } from '@deepseek-ai/cordis';
import { DigitalEmployeeTemplateSchema } from "./schema.js";
export { assertLifecycleTransition, DigitalEmployeeTemplateSchema } from "./schema.js";
/**
 * Construct a template ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded template identifier.
 */
export const createDigitalEmployeeTemplateId = (value) => value;
/**
 * Construct an employee instance ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded employee identifier.
 */
export const createDigitalEmployeeInstanceId = (value) => value;
/**
 * Construct a resolved composition ID from its deterministic digest.
 * @param value - complete validated composition digest.
 * @returns branded composition identifier.
 */
export const createDigitalEmployeeCompositionId = (value) => value;
/**
 * Project creation-time digital employee ownership from a restored Session log.
 * @param events - complete or partial root Session event sequence.
 * @returns the first recorded ownership snapshot, or `undefined` for a non-employee Session.
 */
export function projectDigitalEmployeeOwnership(events) {
    for (const event of events) {
        if (event.type === 'digital-employee/identity')
            return event.data;
    }
    return undefined;
}
/**
 * Construct a memory ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded memory identifier.
 */
export const createDigitalEmployeeMemoryId = (value) => value;
/**
 * Construct a task ID after validation at the owning parser boundary.
 * @param value - validated task identity.
 * @returns branded employee task identifier.
 */
export const createDigitalEmployeeTaskId = (value) => value;
/**
 * Construct a submission ID after validation at the owning client boundary.
 * @param value - validated task-start submission identity.
 * @returns branded submission identifier.
 */
export const createDigitalEmployeeSubmissionId = (value) => value;
/**
 * Construct an expert ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded expert identifier.
 */
export const createExpertId = (value) => value;
/**
 * Construct an audit ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded audit identifier.
 */
export const createDigitalEmployeeAuditId = (value) => value;
/**
 * Construct an operation ID after validation at the owning parser boundary.
 * @param value - validated wire value.
 * @returns branded operation identifier.
 */
export const createDigitalEmployeeOperationId = (value) => value;
/** Registry and provider facade for digital employee capabilities. */
export class DigitalEmployees extends Service {
    templates = new Map();
    templateReferenceValidators = new Set();
    provider;
    constructor(ctx) {
        super(ctx, 'digitalEmployees');
    }
    /**
     * Register one immutable template version for the current plugin lifetime.
     * @param contribution - trusted template contribution to validate and publish.
     * @returns disposer that removes this exact template version.
     */
    registerTemplate(contribution) {
        const template = DigitalEmployeeTemplateSchema(contribution);
        for (const validate of this.templateReferenceValidators)
            validate(template);
        const key = templateKey(template.id, template.version);
        if (this.templates.has(key)) {
            throw new Error(`digital employee template "${template.id}" version "${template.version}" is already registered`);
        }
        const templates = this.templates;
        const ctx = this.ctx;
        const dispose = ctx.effect(function* () {
            templates.set(key, template);
            ctx.emit('digital-employees/template-change', template.id, template.version);
            yield () => {
                if (templates.get(key) !== template)
                    return;
                templates.delete(key);
                ctx.emit('digital-employees/template-change', template.id, template.version);
            };
        }, `digitalEmployees.registerTemplate(${JSON.stringify(key)})`);
        // oxlint-disable-next-line typescript/no-misused-promises -- the public registry API exposes Cordis's synchronous disposer identity
        return dispose;
    }
    /**
     * Register load-time validation for template references owned by another capability.
     * @param validate - synchronous validator that throws a resource-specific diagnostic.
     * @returns disposer removing this exact validator.
     */
    registerTemplateReferenceValidator(validate) {
        const dispose = this.ctx.effect(() => {
            this.templateReferenceValidators.add(validate);
            return () => { this.templateReferenceValidators.delete(validate); };
        }, 'digitalEmployees.registerTemplateReferenceValidator()');
        // oxlint-disable-next-line typescript/no-misused-promises -- the public registry API exposes Cordis's synchronous disposer identity
        return dispose;
    }
    /**
     * Configure the sole durable provider for the current plugin lifetime.
     * @param provider - provider implementing instance, memory, and audit operations.
     * @returns disposer that removes this exact provider.
     */
    configureProvider(provider) {
        if (this.provider !== undefined)
            throw new Error('digital employee provider is already configured');
        const dispose = this.ctx.effect(() => {
            this.provider = provider;
            return () => {
                if (this.provider === provider)
                    this.provider = undefined;
            };
        }, 'digitalEmployees.configureProvider()');
        // oxlint-disable-next-line typescript/no-misused-promises -- the public registry API exposes Cordis's synchronous disposer identity
        return dispose;
    }
    /**
     * List registered template versions in deterministic identity/version order.
     * @returns immutable template snapshots.
     */
    listTemplates() {
        return [...this.templates.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version));
    }
    /**
     * Read one exact registered template version.
     * @param id - template identity.
     * @param version - exact registered version.
     * @returns matching contribution, or `undefined`.
     */
    getTemplate(id, version) {
        return this.templates.get(templateKey(id, version));
    }
    /**
     * List durable employee instances through the configured provider.
     * @returns durable employee snapshots.
     */
    list() {
        return this.requiredProvider().list();
    }
    /**
     * Read one durable employee instance through the configured provider.
     * @param id - employee identity.
     * @returns matching employee, or `undefined`.
     */
    get(id) {
        return this.requiredProvider().get(id);
    }
    /**
     * Inspect one required employee instance.
     * @param id - employee identity.
     * @returns matching employee snapshot.
     */
    async inspect(id) {
        const instance = await this.requiredProvider().get(id);
        if (instance === undefined)
            throw new Error(`digital employee "${id}" does not exist`);
        return instance;
    }
    /**
     * Create one durable employee instance through the configured provider.
     * @param request - validated creation request.
     * @returns created employee snapshot.
     */
    create(request) {
        return this.requiredProvider().create(request);
    }
    /**
     * Change one employee lifecycle state through the configured provider.
     * @param id - employee identity.
     * @param state - requested next state.
     * @returns committed employee snapshot.
     */
    transition(id, state) {
        return this.requiredProvider().transition(id, state);
    }
    /**
     * Activate one inactive employee.
     * @param id - employee identity.
     * @returns active employee snapshot.
     */
    activate(id) {
        return this.requiredProvider().transition(id, 'active');
    }
    /**
     * Deactivate one active employee without removing history or memory.
     * @param id - employee identity.
     * @returns inactive employee snapshot.
     */
    deactivate(id) {
        return this.requiredProvider().transition(id, 'inactive');
    }
    /**
     * Delete one employee and its owned durable state through the configured provider.
     * @param id - employee identity.
     */
    async delete(id) {
        const provider = this.requiredProvider();
        const current = await this.inspect(id);
        if (current.state !== 'deleting')
            await provider.transition(id, 'deleting');
        await this.ctx.serial('digital-employees/before-delete', id);
        await provider.delete(id);
    }
    /**
     * Preview one exact template upgrade without mutating the employee.
     * @param request - employee and target template version.
     * @returns capability differences requiring review.
     */
    previewUpgrade(request) {
        return this.requiredProvider().previewUpgrade(request);
    }
    /**
     * Apply a reviewed template upgrade atomically.
     * @param request - target version plus explicitly approved new capabilities.
     * @returns upgraded employee snapshot.
     */
    applyUpgrade(request) {
        return this.requiredProvider().applyUpgrade(request);
    }
    /**
     * Export one credential-free portable employee artifact.
     * @param request - employee identity and optional memory selection.
     * @returns versioned portable artifact.
     */
    exportEmployee(request) {
        return this.requiredProvider().exportEmployee(request);
    }
    /**
     * Import portable data as a fresh inactive employee.
     * @param artifact - validated versioned portable employee data.
     * @returns imported employee snapshot.
     */
    importEmployee(artifact) {
        return this.requiredProvider().importEmployee(artifact);
    }
    /**
     * Resolve one active employee before creating a task Session.
     * @param id - employee identity.
     * @returns complete existing-Agent composition.
     */
    resolve(id) {
        return this.requiredProvider().resolve(id);
    }
    /**
     * Query bounded employee memory through the configured provider.
     * @param query - employee-owned retrieval query.
     * @returns ranked bounded memory records.
     */
    queryMemory(query) {
        return this.requiredProvider().queryMemory(query);
    }
    /**
     * Submit a long-term memory candidate through the configured provider.
     * @param candidate - structured candidate with provenance.
     * @returns accepted memory or rejection reason.
     */
    promoteMemory(candidate) {
        return this.requiredProvider().promoteMemory(candidate);
    }
    /**
     * Delete one employee-owned memory through the configured provider.
     * @param employeeId - owning employee.
     * @param memoryId - memory to remove.
     */
    deleteMemory(employeeId, memoryId) {
        return this.requiredProvider().deleteMemory(employeeId, memoryId);
    }
    /**
     * List employee audit history through the configured provider.
     * @param employeeId - owning employee.
     * @returns chronological audit records.
     */
    listAudit(employeeId) {
        return this.requiredProvider().listAudit(employeeId);
    }
    /**
     * Persist one attributable operational record.
     * @param request - redacted audit fields without provider-owned identity and time.
     * @returns committed audit record.
     */
    appendAudit(request) {
        return this.requiredProvider().appendAudit(request);
    }
    requiredProvider() {
        if (this.provider === undefined)
            throw new Error('digital employee provider is not configured');
        return this.provider;
    }
}
function templateKey(id, version) {
    return `${id}\u0000${version}`;
}
export default DigitalEmployees;
//# sourceMappingURL=index.js.map