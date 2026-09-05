/**
 * Host-side declarative subagent package marketplace.
 *
 * Installs and manages signed subagent packages; employee-scoped mounting
 * lives in the composition bridge, which reads installed descriptors through
 * `installedPackages`.
 * @module @deepseek-ai/dsh-subagent-market
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { combineTrustedPublisherRecords, readTrustedPublisherFileSync, } from '@deepseek-ai/dsh-marketplace-core';
import { SubagentMarketService } from "./service.js";
export { mountEmployeeSubagents } from "./bridge.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'subagent-market';
/** Services required for activation. */
export const inject = [];
/** Typed Remote gateway for managed subagent packages. */
let SubagentMarketGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _install_decorators;
    let _uninstall_decorators;
    return class SubagentMarketGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _install_decorators = [Remote('install')];
            _uninstall_decorators = [Remote('uninstall')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _install_decorators, { kind: "method", name: "install", static: false, private: false, access: { has: obj => "install" in obj, get: obj => obj.install }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _uninstall_decorators, { kind: "method", name: "uninstall", static: false, private: false, access: { has: obj => "uninstall" in obj, get: obj => obj.uninstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static Config = z.object({
            installRoot: z.string().required(),
            trustedPublishers: z.array(z.object({
                id: z.string().required(),
                publicKeyPem: z.string().required(),
            })).default([]),
            allowUnsignedPackages: z.boolean().default(false),
            trustedPublishersFile: z.string(),
        });
        service = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, config) {
            super(ctx, 'subagentMarket');
            const trustFile = config.trustedPublishersFile;
            const fileRecords = trustFile === undefined
                ? null
                : readTrustedPublisherFileSync(trustFile);
            this.service = new SubagentMarketService({
                installRoot: config.installRoot,
                trustedPublishers: fileRecords === null || trustFile === undefined
                    ? config.trustedPublishers
                    : combineTrustedPublisherRecords(config.trustedPublishers, fileRecords, trustFile),
                allowUnsignedPackages: config.allowUnsignedPackages === true,
            });
        }
        /**
         * List managed subagent packages.
         * @returns Declared inventory result or a structured marketplace failure.
         */
        async list() {
            return await this.service.list();
        }
        /**
         * Install or explicitly upgrade one trusted subagent package.
         * @param request - Uploaded archive and explicit replacement intent.
         * @returns Declared mutation result or a structured marketplace failure.
         */
        async install(request) {
            return await this.service.install(request);
        }
        /**
         * Uninstall one marketplace-managed subagent package.
         * @param request - Managed package identity to remove.
         * @returns Declared mutation result or a structured marketplace failure.
         */
        async uninstall(request) {
            return await this.service.uninstall(request.packageId);
        }
        /**
         * Project every installed package for the composition bridge. Packages
         * failing validation are skipped with a diagnostic.
         * @returns Installed descriptors.
         */
        async installedPackages() {
            const inventory = await this.service.list();
            if (!inventory.ok)
                return [];
            const installed = [];
            for (const entry of inventory.value.entries) {
                try {
                    const descriptor = await this.service.descriptor(entry.packageId);
                    installed.push({
                        packageId: entry.packageId,
                        directory: this.service.packageDirectory(entry.packageId),
                        descriptor,
                    });
                }
                catch (error) {
                    this.service.setDiagnostic(entry.packageId, error instanceof Error ? error.message : 'subagent package validation failed');
                }
            }
            return installed;
        }
    };
})();
export { SubagentMarketGateway };
/** Install the gateway; mounting happens per employee composition, not here. */
export function apply(ctx, config) {
    new SubagentMarketGateway(ctx, config);
}
//# sourceMappingURL=index.js.map