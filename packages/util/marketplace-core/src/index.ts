/** Shared bounded archive and mutation primitives for managed marketplaces. */

export {
  ArchiveValidationError,
  decodeArchiveBase64,
  inspectZipArchive,
  MAX_ENTRY_BYTES,
  MAX_EXTRACTED_BYTES,
  MAX_FILE_COUNT,
  MAX_ZIP_BYTES,
} from './archive.ts'
export type {
  ArchiveFailure,
  ArchiveEntryKind,
  InspectedArchive,
  InspectedArchiveEntry,
} from './archive.ts'
export { KeyedMutex } from './keyed-mutex.ts'
export {
  listManagedPackages,
  publishManagedPackage,
  readManagedPackage,
  uninstallManagedPackage,
} from './managed-package.ts'
export type { ManagedPackageManifest, ManagedPackageRead } from './managed-package.ts'
export {
  descriptorSignaturePayload,
  parseHookPackageDescriptor,
  parseSubagentPackageDescriptor,
  parseWorkflowPackageDescriptor,
  parseMcpPackageDescriptor,
  parseToolPackageDescriptor,
  preparePackageArchive,
  resolveTrustedPublisher,
  verifyPackageFileHashes,
  verifyPublisherSignature,
  HOOK_EVENTS,
} from './descriptors.ts'
export type {
  HookEvent,
  HookPackageDescriptor,
  HookPackageEntry,
  SubagentPackageDescriptor,
  SubagentPackageEntry,
  WorkflowPackageDescriptor,
  WorkflowPackageEntry,
  MarketplacePackageDescriptor,
  McpPackageDescriptor,
  McpPackageServer,
  ToolPackageDescriptor,
  TrustedPublisher,
} from './descriptors.ts'
export {
  buildMarketplacePackage,
  PACKAGE_DESCRIPTOR_FILENAMES,
  signMarketplacePackage,
} from './package-builder.ts'
export type {
  BuildMarketplacePackageOptions,
  BuiltMarketplacePackage,
  MarketplacePackageKind,
  SignMarketplacePackageOptions,
} from './package-builder.ts'
export {
  combineTrustedPublisherRecords,
  readTrustedPublisherFileSync,
  TRUSTED_PUBLISHERS_FILENAME,
} from './trust-file.ts'
export { runMarketPackageCli } from './cli.ts'
export type { MarketPackageCliOutcome } from './cli.ts'
