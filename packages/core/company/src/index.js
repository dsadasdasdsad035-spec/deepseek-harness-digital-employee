/**
 * Company Service Definition: durable companies binding digital employee instances.
 * @module @deepseek-ai/dsh-company
 */
import { Service } from '@deepseek-ai/cordis';
/** Construct a company identifier from its validated string form.
 * @param value - validated company identifier string.
 * @returns branded company identifier.
 */
export const createCompanyId = (value) => value;
/** Construct a department identifier from its validated string form.
 * @param value - validated department identifier string.
 * @returns branded department identifier.
 */
export const createDepartmentId = (value) => value;
/** Construct an employee instance identifier from its validated string form.
 * @param value - validated instance identifier string.
 * @returns branded instance identifier.
 */
export const createCompanyEmployeeId = (value) => value;
/** Skin id applied when a company record carries none; the client catalog's default preset. */
export const DEFAULT_COMPANY_SKIN_ID = 'modern';
/** Registry facade over the sole durable company provider. */
export class Companies extends Service {
    provider;
    constructor(ctx) {
        super(ctx, 'companies');
    }
    /**
     * Configure the sole durable provider for the current plugin lifetime.
     * @param provider - provider implementing company, department, and binding operations.
     * @returns disposer that removes this exact provider.
     */
    configureProvider(provider) {
        if (this.provider !== undefined)
            throw new Error('company provider is already configured');
        const dispose = this.ctx.effect(() => {
            this.provider = provider;
            return () => {
                if (this.provider === provider)
                    this.provider = undefined;
            };
        }, 'companies.configureProvider()');
        // oxlint-disable-next-line typescript/no-misused-promises -- the public registry API exposes Cordis's synchronous disposer identity
        return dispose;
    }
    requiredProvider() {
        if (this.provider === undefined)
            throw new Error('company provider is not configured');
        return this.provider;
    }
    /** List all companies in creation order through the configured provider.
     * @returns creation-ordered company records.
     */
    list() {
        return this.requiredProvider().list();
    }
    /** Read one company through the configured provider.
     * @param id - company identifier.
     * @returns the record, or `undefined` when absent.
     */
    get(id) {
        return this.requiredProvider().get(id);
    }
    /** Create one company with the preset departments through the configured provider.
     * @param request - validated creation fields.
     * @returns the created record.
     */
    create(request) {
        return this.requiredProvider().create(request);
    }
    /** Update editable company fields through the configured provider.
     * @param request - company identifier plus changed fields.
     * @returns the updated record.
     */
    update(request) {
        return this.requiredProvider().update(request);
    }
    /** Delete one company and unbind all of its members through the configured provider.
     * @param id - company identifier.
     */
    delete(id) {
        return this.requiredProvider().delete(id);
    }
    /** Append or insert one department through the configured provider.
     * @param request - company, department name, optional color and insert position.
     * @returns the updated record.
     */
    addDepartment(request) {
        return this.requiredProvider().addDepartment(request);
    }
    /** Rename one department through the configured provider.
     * @param request - company, department, and new name.
     * @returns the updated record.
     */
    renameDepartment(request) {
        return this.requiredProvider().renameDepartment(request);
    }
    /** Reorder all departments of one company through the configured provider.
     * @param request - company and the complete ordered department-id list.
     * @returns the updated record.
     */
    reorderDepartments(request) {
        return this.requiredProvider().reorderDepartments(request);
    }
    /** Delete one department, moving members to the unassigned group.
     * @param request - company and department identifiers.
     * @returns the updated record.
     */
    deleteDepartment(request) {
        return this.requiredProvider().deleteDepartment(request);
    }
    /** Attach an admitted promotional image to one company.
     * @param companyId - company identifier.
     * @param ref - admitted image reference.
     * @returns the updated record.
     */
    setPromoImage(companyId, ref) {
        return this.requiredProvider().setPromoImage(companyId, ref);
    }
    /** Remove one company's promotional image reference.
     * @param companyId - company identifier.
     * @returns the updated record.
     */
    removePromoImage(companyId) {
        return this.requiredProvider().removePromoImage(companyId);
    }
    /** List all employee bindings through the configured provider.
     * @returns detached binding records.
     */
    listBindings() {
        return this.requiredProvider().listBindings();
    }
    /** Bind or move one employee instance inside one company.
     * @param request - instance, company, and target department (or `null`).
     */
    assignEmployee(request) {
        return this.requiredProvider().assignEmployee(request);
    }
    /** Remove one employee instance's binding.
     * @param request - instance identifier.
     */
    unassignEmployee(request) {
        return this.requiredProvider().unassignEmployee(request);
    }
    /** Remove bindings of instances the predicate names as gone.
     * @param instanceExists - predicate naming which instance identifiers remain alive.
     * @returns how many bindings were removed.
     */
    pruneEmployeeBindings(instanceExists) {
        return this.requiredProvider().pruneEmployeeBindings(instanceExists);
    }
}
export default Companies;
//# sourceMappingURL=index.js.map