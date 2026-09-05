/** Trusted workflow package validation and managed lifecycle. */
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { KeyedMutex } from '@deepseek-ai/dsh-marketplace-core';
import { ArchiveValidationError, decodeArchiveBase64, descriptorSignaturePayload, inspectZipArchive, listManagedPackages, parseWorkflowPackageDescriptor, preparePackageArchive, publishManagedPackage, readManagedPackage, resolveTrustedPublisher, uninstallManagedPackage, verifyPackageFileHashes, verifyPublisherSignature, } from '@deepseek-ai/dsh-marketplace-core';
class WorkflowMarketDomainError extends Error {
    failure;
    constructor(failure) {
        super('reason' in failure ? `${failure.code}: ${failure.reason}` : failure.code);
        this.failure = failure;
    }
}
export { WorkflowMarketDomainError };
/**
 * Map a marketplace domain error to its structured failure result.
 * @param error - Error caught by a Remote gateway method.
 * @returns The failure result; anything that is not a domain error rethrows.
 */
export function asWorkflowMarketResult(error) {
    if (error instanceof WorkflowMarketDomainError)
        return { ok: false, error: error.failure };
    throw error;
}
/** Owns managed workflow package files. */
export class WorkflowMarketService {
    options;
    mutations = new KeyedMutex();
    diagnostics = new Map();
    constructor(options) {
        this.options = options;
    }
    /**
     * Absolute managed directory of one installed package.
     * @param packageId - Managed package identity.
     * @returns Resolved install directory of the package payload.
     */
    packageDirectory(packageId) {
        return join(resolve(this.options.installRoot), packageId);
    }
    /**
     * Read one installed package descriptor.
     * @param packageId - Managed package identity.
     * @returns Parsed descriptor from the installed package.
     */
    async descriptor(packageId) {
        try {
            const ownership = await readManagedPackage(this.options.installRoot, packageId, 'workflow');
            if (ownership.status !== 'managed')
                throw new Error('workflow package is not marketplace-managed');
            const descriptorFile = join(this.options.installRoot, packageId, 'workflow-package.json');
            const descriptorInfo = await lstat(descriptorFile);
            if (!descriptorInfo.isFile() || descriptorInfo.isSymbolicLink()) {
                throw new Error('workflow descriptor is not a regular file');
            }
            const descriptor = parseWorkflowPackageDescriptor(JSON.parse(await readFile(descriptorFile, 'utf8')));
            if (descriptor.id !== ownership.manifest.id
                || descriptor.version !== ownership.manifest.version
                || descriptor.publisher.id !== ownership.manifest.publisherId) {
                throw new Error('workflow descriptor does not match its managed manifest');
            }
            const entries = await Promise.all(Object.keys(descriptor.files).map(async (name) => {
                const filename = join(this.options.installRoot, packageId, name);
                const info = await lstat(filename);
                if (!info.isFile() || info.isSymbolicLink())
                    throw new Error(`workflow package file "${name}" is not regular`);
                return { name, bytes: new Uint8Array(await readFile(filename)), kind: 'regular' };
            }));
            verifyPackageFileHashes({
                entries,
                totalBytes: entries.reduce((total, entry) => total + entry.bytes.byteLength, 0),
            }, descriptor.files);
            if (!this.options.allowUnsignedPackages)
                verifyTrust(descriptor, this.options.trustedPublishers);
            return descriptor;
        }
        catch (error) {
            throw new WorkflowMarketDomainError({
                code: 'invalid-package',
                reason: error instanceof Error ? error.message : 'invalid workflow descriptor',
            });
        }
    }
    /**
     * List managed packages with entry summaries.
     * @returns Declared inventory result or a structured marketplace failure.
     */
    async list() {
        return await result(async () => {
            const manifests = await listManagedPackages(this.options.installRoot, 'workflow');
            const entries = [];
            for (const manifest of manifests) {
                let descriptor;
                try {
                    descriptor = await this.descriptor(manifest.id);
                }
                catch (error) {
                    entries.push({
                        packageId: manifest.id,
                        displayName: manifest.id,
                        description: 'Installed workflow package failed trust validation.',
                        version: manifest.version,
                        publisherId: manifest.publisherId,
                        entries: [],
                        permissions: [],
                        installedAt: manifest.installedAt,
                        available: false,
                        restartRequired: true,
                        diagnostic: error instanceof Error ? error.message : 'workflow package validation failed',
                    });
                    continue;
                }
                const diagnostic = this.diagnostics.get(manifest.id);
                entries.push({
                    packageId: manifest.id,
                    displayName: descriptor.display.name,
                    description: descriptor.display.description,
                    version: manifest.version,
                    publisherId: manifest.publisherId,
                    entries: descriptor.workflows.map(workflow => ({ id: workflow.id, available: true })),
                    permissions: descriptor.permissions,
                    installedAt: manifest.installedAt,
                    available: true,
                    restartRequired: true,
                    ...(diagnostic === undefined ? {} : { diagnostic }),
                });
            }
            return { entries };
        });
    }
    /**
     * Install or explicitly upgrade one trusted package.
     * @param request - Uploaded archive and explicit replacement intent.
     * @returns Declared mutation result or a structured marketplace failure.
     */
    async install(request) {
        return await result(async () => {
            const archive = preparePackageArchive(await inspectZipArchive(decodeArchiveBase64(request.archiveBase64)), 'workflow-package.json');
            const descriptorEntry = archive.entries.find(entry => entry.name === 'workflow-package.json');
            if (descriptorEntry === undefined)
                throw new Error('archive must contain workflow-package.json');
            const descriptor = parseDescriptor(descriptorEntry.bytes);
            verifyPackageFileHashes(archive, descriptor.files);
            if (!this.options.allowUnsignedPackages)
                verifyTrust(descriptor, this.options.trustedPublishers);
            if (request.confirmLocalExecution !== true) {
                throw new WorkflowMarketDomainError({
                    code: 'local-execution-confirmation-required',
                    candidatePermissions: [...descriptor.permissions],
                });
            }
            return await this.mutations.runExclusive(descriptor.id, async () => {
                const ownership = await readManagedPackage(this.options.installRoot, descriptor.id, 'workflow');
                assertMutableOwnership(ownership.status, descriptor.id, descriptor.version, request.replaceExisting === true, ownership);
                const operation = await publishManagedPackage(this.options.installRoot, descriptor.id, archive, request.replaceExisting === true, {
                    format: 1,
                    kind: 'workflow',
                    id: descriptor.id,
                    version: descriptor.version,
                    publisherId: descriptor.publisher.id,
                    installedAt: Date.now(),
                });
                return {
                    packageId: descriptor.id,
                    operation,
                    restartRequired: true,
                };
            });
        });
    }
    /**
     * Remove one managed package.
     * @param packageId - Managed package identity to remove.
     * @returns Declared mutation result or a structured marketplace failure.
     */
    async uninstall(packageId) {
        return await result(async () => {
            return await this.mutations.runExclusive(packageId, async () => {
                const ownership = await readManagedPackage(this.options.installRoot, packageId, 'workflow');
                if (ownership.status === 'missing')
                    throw new WorkflowMarketDomainError({ code: 'not-found', packageId });
                if (ownership.status === 'unmanaged')
                    throw new WorkflowMarketDomainError({ code: 'unmanaged-conflict', packageId });
                if (ownership.status === 'incompatible')
                    throw new WorkflowMarketDomainError({ code: 'manifest-incompatible', packageId });
                await uninstallManagedPackage(this.options.installRoot, packageId, 'workflow');
                this.diagnostics.delete(packageId);
                return { packageId, restartRequired: true };
            });
        });
    }
    /**
     * Record a package-level diagnostic without credential values.
     * @param packageId - Managed package identity.
     * @param diagnostic - Public diagnostic, or undefined to clear it.
     */
    setDiagnostic(packageId, diagnostic) {
        if (diagnostic === undefined)
            this.diagnostics.delete(packageId);
        else
            this.diagnostics.set(packageId, diagnostic);
    }
}
function parseDescriptor(bytes) {
    try {
        return parseWorkflowPackageDescriptor(JSON.parse(new TextDecoder().decode(bytes)));
    }
    catch (error) {
        throw new WorkflowMarketDomainError({
            code: 'invalid-package',
            reason: error instanceof Error ? error.message : 'invalid workflow descriptor',
        });
    }
}
function verifyTrust(descriptor, publishers) {
    const publicKey = resolveTrustedPublisher(publishers, descriptor.publisher.id);
    if (publicKey === undefined) {
        throw new WorkflowMarketDomainError({ code: 'untrusted-publisher', publisherId: descriptor.publisher.id });
    }
    if (!verifyPublisherSignature(descriptorSignaturePayload(descriptor), descriptor.publisher.signature, publicKey)) {
        throw new WorkflowMarketDomainError({ code: 'invalid-signature', publisherId: descriptor.publisher.id });
    }
}
function assertMutableOwnership(status, id, version, replaceExisting, ownership) {
    const packageId = id;
    if (status === 'managed' && !replaceExisting) {
        const installedVersion = ownership.status === 'managed' ? ownership.manifest.version : '';
        throw new WorkflowMarketDomainError({
            code: 'managed-upgrade-required',
            packageId,
            installedVersion,
            candidateVersion: version,
        });
    }
    if (status === 'unmanaged')
        throw new WorkflowMarketDomainError({ code: 'unmanaged-conflict', packageId });
    if (status === 'incompatible')
        throw new WorkflowMarketDomainError({ code: 'manifest-incompatible', packageId });
}
async function result(operation) {
    try {
        return { ok: true, value: await operation() };
    }
    catch (error) {
        if (error instanceof WorkflowMarketDomainError)
            return { ok: false, error: error.failure };
        if (error instanceof ArchiveValidationError)
            return { ok: false, error: error.failure };
        if (error instanceof Error && (error.message.startsWith('unsafe archive')
            || error.message.startsWith('duplicate archive')
            || error.message.startsWith('unsupported archive')
            || error.message.startsWith('archive must contain'))) {
            return { ok: false, error: { code: 'invalid-package', reason: error.message } };
        }
        throw error;
    }
}
//# sourceMappingURL=service.js.map