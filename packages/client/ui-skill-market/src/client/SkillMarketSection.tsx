/** Accessible settings surface for marketplace-managed skills. */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import {
  Button, IconCloseOutline16, IconSearchOutline16, IconTrashOutline16, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  McpMarketEntry, McpMarketPackageId, SkillMarketEntry, SkillMarketSkillId,
  ToolMarketEntry, ToolMarketPackageId,
} from '@deepseek-ai/dsh-api-remotes/client'
import { filterSkills, MAX_UPLOAD_BYTES } from './store.ts'
import type { SkillMarketStore } from './store.ts'
import {
  filterMcpPackages, filterToolPackages,
  type McpMarketStore, type ToolMarketStore,
} from './package-stores.ts'
import type { SkillMarketKey } from './locales.ts'
import css from './SkillMarketSection.module.css'

export interface SkillMarketSectionInjected {
  controller: SkillMarketStore
  toolController: ToolMarketStore
  mcpController: McpMarketStore
  hooks: {
    snapshot: SkillMarketStore['store']
    toolSnapshot: ToolMarketStore['store']
    mcpSnapshot: McpMarketStore['store']
  }
  t: (key: SkillMarketKey) => string
}

export type SkillMarketSectionProps = Partial<InjectFace<SkillMarketSectionInjected>>
type SkillMarketFace = InjectFace<SkillMarketSectionInjected>

/** Public Vite asset containing the verified marketplace example package. */
export const TEMPLATE_ARCHIVE_URL = '/skill-market-template.zip'
/** Filename proposed by browsers when saving {@link TEMPLATE_ARCHIVE_URL}. */
export const TEMPLATE_ARCHIVE_FILENAME = 'skill-market-template.zip'
/** Public Vite assets containing signed Tool and declarative MCP examples. */
export const TOOL_TEMPLATE_ARCHIVE_URL = '/tool-market-template.zip'
export const TOOL_TEMPLATE_ARCHIVE_FILENAME = 'tool-market-template.zip'
export const MCP_TEMPLATE_ARCHIVE_URL = '/mcp-market-template.zip'
export const MCP_TEMPLATE_ARCHIVE_FILENAME = 'mcp-market-template.zip'

interface UploaderProps {
  readonly id: string
  readonly title: string
  readonly uploading: boolean
  readonly error: string | null
  readonly t: (key: SkillMarketKey) => string
  readonly onPickFile: (file: File) => void
  readonly templateUrl?: string | undefined
  readonly templateFilename?: string | undefined
}

function Uploader({
  id, title, uploading, error, t, onPickFile, templateUrl, templateFilename,
}: UploaderProps): ReactNode {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const pick = (files: FileList | null): void => {
    const file = files?.item(0)
    if (file !== null && file !== undefined) onPickFile(file)
  }
  const drop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    if (!uploading) pick(event.dataTransfer.files)
  }
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (!uploading) input.current?.click()
  }
  const change = (event: ChangeEvent<HTMLInputElement>): void => {
    pick(event.target.files)
    event.target.value = ''
  }
  return (
    <div
      className={css.dropzone}
      data-drop-active={dragging ? 'true' : undefined}
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-disabled={uploading}
      aria-describedby={`${id}-upload-hint`}
      onClick={() => { if (!uploading) input.current?.click() }}
      onKeyDown={keyDown}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = uploading ? 'none' : 'copy' }}
      onDragLeave={() => { setDragging(false) }}
      onDrop={drop}
    >
      <input
        ref={input}
        className={css.fileInput}
        type="file"
        accept=".zip,application/zip"
        disabled={uploading}
        onChange={change}
      />
      <strong className={css.dropzoneTitle}>{title}</strong>
      <span id={`${id}-upload-hint`} className={css.muted}>
        {t('uploadHint')} ({String(MAX_UPLOAD_BYTES / 1024 / 1024)} MiB)
      </span>
      <span className={css.uploadCommand}>{uploading ? t('installing') : t('uploadButton')}</span>
      {templateUrl === undefined ? null : (
        <a
          className={css.templateDownload}
          href={templateUrl}
          download={templateFilename}
          onClick={(event) => { event.stopPropagation() }}
        >
          {t('templateDownload')}
        </a>
      )}
      {error === null ? null : <span className={css.error} role="alert">{error}</span>}
    </div>
  )
}

interface CardProps {
  readonly skill: SkillMarketEntry
  readonly banner: string | undefined
  readonly bannerFailed: boolean
  readonly busy: boolean
  readonly t: (key: SkillMarketKey) => string
  readonly loadBanner: (skillId: SkillMarketSkillId) => void
  readonly uninstall: (skillId: SkillMarketSkillId) => void
}

function SkillCard({ skill, banner, bannerFailed, busy, t, loadBanner, uninstall }: CardProps): ReactNode {
  useEffect(() => {
    if (skill.hasBanner && banner === undefined && !bannerFailed) loadBanner(skill.skillId)
  }, [banner, bannerFailed, loadBanner, skill.hasBanner, skill.skillId])
  return (
    <li className={css.card} data-skill-name={skill.skillId}>
      <div className={css.banner}>
        {banner === undefined
          ? <span className={css.placeholder} aria-label={bannerFailed ? t('bannerBroken') : t('bannerUnavailable')}>{skill.skillId.slice(0, 2).toUpperCase()}</span>
          : <img className={css.bannerImage} src={banner} alt={`${skill.skillId}: ${t('bannerAlt')}`} />}
      </div>
      <div className={css.cardBody}>
        <div className={css.cardHeading}>
          <h3>{skill.skillId}</h3>
          <span className={css.badge}>{t('managed')}</span>
        </div>
        <p className={css.description}>{skill.description}</p>
        <dl className={css.metadata}>
          {skill.version === undefined ? null : <><dt>{t('version')}</dt><dd>{skill.version}</dd></>}
          {skill.author === undefined ? null : <><dt>{t('author')}</dt><dd>{skill.author}</dd></>}
          <dt>{t('tags')}</dt>
          <dd>{skill.tags?.length
            ? <span className={css.tags}>{skill.tags.map(tag => <span className={css.tag} key={tag}>{tag}</span>)}</span>
            : <span className={css.muted}>{t('noTags')}</span>}</dd>
        </dl>
      </div>
      <button
        type="button"
        className={css.iconButton}
        aria-label={`${t('uninstall')}: ${skill.skillId}`}
        title={t('uninstall')}
        disabled={busy}
        onClick={() => { uninstall(skill.skillId) }}
      >
        <IconTrashOutline16 size={16} />
      </button>
    </li>
  )
}

export function SkillMarketSection(props: SkillMarketSectionProps): ReactNode {
  const {
    controller, toolController, mcpController,
    useSnapshot, useToolSnapshot, useMcpSnapshot, t,
  } = props
  if (
    controller === undefined || toolController === undefined || mcpController === undefined
    || useSnapshot === undefined || useToolSnapshot === undefined || useMcpSnapshot === undefined
    || t === undefined
  ) return null
  return <Loaded injected={{
    controller,
    toolController,
    mcpController,
    useSnapshot,
    useToolSnapshot,
    useMcpSnapshot,
    t,
  }} />
}

function Loaded({ injected }: { injected: SkillMarketFace }): ReactNode {
  const { t } = injected
  const [tab, setTab] = useState<'skill' | 'tool' | 'mcp'>('skill')
  return (
    <section className={css.section} aria-labelledby="marketplace-title">
      <header className={css.header}>
        <div>
          <h2 id="marketplace-title" className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
      </header>
      <div className={css.tabs} role="tablist" aria-label={t('title')}>
        {([
          ['skill', 'skillTab'],
          ['tool', 'toolTab'],
          ['mcp', 'mcpTab'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={css.tab}
            role="tab"
            aria-selected={tab === id}
            onClick={() => { setTab(id) }}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tab === 'skill' ? <SkillPanel injected={injected} /> : null}
      {tab === 'tool' ? <ToolPanel injected={injected} /> : null}
      {tab === 'mcp' ? <McpPanel injected={injected} /> : null}
    </section>
  )
}

function SkillPanel({ injected: { controller, useSnapshot, t } }: { injected: SkillMarketFace }): ReactNode {
  const state = useSnapshot(value => value)
  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])
  const skills = useMemo(() => filterSkills(state.skills, state.query), [state.query, state.skills])
  const upgrade = state.pendingUpgrade
  return (
    <div className={css.panel} role="tabpanel">
      <Uploader
        id="skill-market"
        title={t('uploadTitle')}
        uploading={state.uploading}
        error={state.uploadError === null ? null : t(state.uploadError)}
        t={t}
        onPickFile={(file) => { void controller.upload(file) }}
        templateUrl={TEMPLATE_ARCHIVE_URL}
        templateFilename={TEMPLATE_ARCHIVE_FILENAME}
      />
      <label className={css.search}>
        <span className={css.visuallyHidden}>{t('searchLabel')}</span>
        <IconSearchOutline16 size={16} />
        <input
          type="search"
          value={state.query}
          placeholder={t('searchPlaceholder')}
          onChange={(event) => { controller.setQuery(event.target.value) }}
        />
      </label>
      {state.installedName === null ? null : (
        <div className={css.notice} role="status" aria-live="polite">
          <span>{t('installed')}: {state.installedName}</span>
          <button type="button" className={css.noticeButton} aria-label={t('close')} onClick={() => { controller.dismissInstalled() }}>
            <IconCloseOutline16 size={16} />
          </button>
        </div>
      )}
      {state.status === 'loading' ? <p className={css.state} role="status">{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <div className={css.failure} role="alert">
          <p>{t(state.error ?? 'loadFailed')}</p>
          <Button variant="outline" onClick={() => { void controller.load() }}>{t('retry')}</Button>
        </div>
      ) : null}
      {state.status === 'ready' && skills.length === 0
        ? <p className={css.state}>{t(state.skills.length === 0 ? 'empty' : 'emptyFiltered')}</p>
        : null}
      {state.status === 'ready' && skills.length > 0 ? (
        <ul className={css.cards}>
          {skills.map(skill => (
            <SkillCard
              key={skill.skillId}
              skill={skill}
              banner={state.banners[skill.skillId]}
              bannerFailed={state.bannersFailed.includes(skill.skillId)}
              busy={state.uninstalling === skill.skillId}
              t={t}
              loadBanner={(skillId) => { void controller.loadBanner(skillId) }}
              uninstall={(skillId) => { controller.requestUninstall(skillId) }}
            />
          ))}
        </ul>
      ) : null}
      <Modal
        open={upgrade !== null}
        onClose={() => { controller.cancelUpgrade() }}
        title={t('upgradeTitle')}
        closeLabel={t('close')}
        description={upgrade === null ? '' : `${t('upgradeDescription')} ${upgrade.skillId}`}
        footer={<>
          <Button variant="outline" onClick={() => { controller.cancelUpgrade() }}>{t('cancel')}</Button>
          <Button disabled={state.uploading} onClick={() => { void controller.confirmUpgrade() }}>
            {state.uploading ? t('installing') : t('upgradeConfirm')}
          </Button>
        </>}
      >
        {upgrade === null || (upgrade.installedVersion === undefined && upgrade.candidateVersion === undefined) ? null : (
          <p>{t('upgradeVersions')}: {upgrade.installedVersion ?? '-'} / {upgrade.candidateVersion ?? '-'}</p>
        )}
      </Modal>
      <Modal
        open={state.pendingUninstall !== null}
        onClose={() => { controller.cancelUninstall() }}
        title={t('uninstallTitle')}
        closeLabel={t('close')}
        description={state.pendingUninstall === null ? '' : `${t('uninstallDescription')} ${state.pendingUninstall}`}
        footer={<>
          <Button variant="outline" onClick={() => { controller.cancelUninstall() }}>{t('cancel')}</Button>
          <Button disabled={state.uninstalling !== null} onClick={() => { void controller.confirmUninstall() }}>
            {state.uninstalling === null ? t('uninstallConfirm') : t('uninstalling')}
          </Button>
        </>}
      >
        {state.uninstallError === null ? null : <p className={css.error} role="alert">{t(state.uninstallError)}</p>}
      </Modal>
    </div>
  )
}

function PackageSearch({
  label, placeholder, value, onChange,
}: {
  readonly label: string
  readonly placeholder: string
  readonly value: string
  readonly onChange: (value: string) => void
}): ReactNode {
  return (
    <label className={css.search}>
      <span className={css.visuallyHidden}>{label}</span>
      <IconSearchOutline16 size={16} />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value) }}
      />
    </label>
  )
}

function PackageState({
  status, error, empty, emptyFiltered, hasEntries, hasMatches, retry, t,
}: {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly empty: SkillMarketKey
  readonly emptyFiltered: SkillMarketKey
  readonly hasEntries: boolean
  readonly hasMatches: boolean
  readonly retry: () => void
  readonly t: (key: SkillMarketKey) => string
}): ReactNode {
  if (status === 'loading' || status === 'idle') return <p className={css.state} role="status">{t('loading')}</p>
  if (status === 'error') {
    return (
      <div className={css.failure} role="alert">
        <p>{marketFailureText(error, t)}</p>
        <Button variant="outline" onClick={retry}>{t('retry')}</Button>
      </div>
    )
  }
  if (!hasMatches) return <p className={css.state}>{t(hasEntries ? emptyFiltered : empty)}</p>
  return null
}

function marketFailureText(error: string | null, t: (key: SkillMarketKey) => string): string {
  const keys: Readonly<Record<string, SkillMarketKey>> = {
    'invalid-archive': 'errorInvalidArchive',
    'resource-limit': 'errorResourceLimit',
    'invalid-package': 'errorInvalidPackage',
    'untrusted-publisher': 'errorUntrustedPublisher',
    'invalid-signature': 'errorInvalidSignature',
    'managed-upgrade-required': 'errorManagedUpgrade',
    'unmanaged-conflict': 'errorUnmanagedConflict',
    'manifest-incompatible': 'errorManifestIncompatible',
    'not-found': 'errorNotFound',
    'invalid-credential-reference': 'errorInvalidCredentialReference',
    'missing-credential-reference': 'errorMissingCredentialReference',
  }
  const key = keys[error ?? ''] ?? 'operationFailed'
  return t(key)
}

function RestartNotice({ visible, t }: {
  readonly visible: boolean
  readonly t: (key: SkillMarketKey) => string
}): ReactNode {
  return visible
    ? <div className={css.notice} role="status" aria-live="polite">{t('restartNotice')}</div>
    : null
}

function ToolCard({
  entry, busy, requestUninstall, t,
}: {
  readonly entry: ToolMarketEntry
  readonly busy: boolean
  readonly requestUninstall: (packageId: ToolMarketPackageId) => void
  readonly t: (key: SkillMarketKey) => string
}): ReactNode {
  return (
    <li className={css.packageCard} data-tool-package={entry.packageId}>
      <div className={css.packageHeading}>
        <div>
          <h3>{entry.displayName}</h3>
          <p className={css.packageIdentity}>{entry.packageId} · {entry.version}</p>
        </div>
        <span className={css.statusBadge} data-available={entry.available}>
          {entry.available ? t('available') : entry.restartRequired ? t('restartRequired') : t('unavailable')}
        </span>
      </div>
      <p className={css.description}>{entry.description}</p>
      <dl className={css.metadata}>
        <dt>{t('publisher')}</dt><dd>{entry.publisherId}</dd>
        <dt>{t('permissions')}</dt>
        <dd className={css.tags}>
          {entry.permissions.map(permission => <span className={css.permission} key={permission}>{permission}</span>)}
        </dd>
      </dl>
      <div className={css.declarations}>
        <strong>{t('declaredTools')}</strong>
        {entry.tools.map(tool => (
          <div className={css.declaration} key={tool.name}>
            <span><code>{tool.name}</code> · {tool.description}</span>
            <span className={css.muted}>{t('inputDescription')}: {tool.inputDescription}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={css.iconButton}
        aria-label={`${t('uninstall')}: ${entry.displayName}`}
        title={t('uninstall')}
        disabled={busy}
        onClick={() => { requestUninstall(entry.packageId) }}
      >
        <IconTrashOutline16 size={16} />
      </button>
    </li>
  )
}

function ToolPanel({ injected: {
  toolController: controller, useToolSnapshot: useSnapshot, t,
} }: { injected: SkillMarketFace }): ReactNode {
  const state = useSnapshot(value => value)
  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])
  const entries = useMemo(() => filterToolPackages(state.entries, state.query), [state.entries, state.query])
  return (
    <div className={css.panel} role="tabpanel">
      <Uploader
        id="tool-market"
        title={t('toolUploadTitle')}
        uploading={state.busy}
        error={state.error === null ? null : marketFailureText(state.error, t)}
        t={t}
        onPickFile={(file) => { void controller.upload(file) }}
        templateUrl={TOOL_TEMPLATE_ARCHIVE_URL}
        templateFilename={TOOL_TEMPLATE_ARCHIVE_FILENAME}
      />
      <PackageSearch
        label={t('toolSearchLabel')}
        placeholder={t('toolSearchPlaceholder')}
        value={state.query}
        onChange={(value) => { controller.setQuery(value) }}
      />
      <RestartNotice visible={state.restartNotice !== null} t={t} />
      <PackageState
        status={state.status}
        error={state.error}
        empty="toolEmpty"
        emptyFiltered="toolEmptyFiltered"
        hasEntries={state.entries.length > 0}
        hasMatches={entries.length > 0}
        retry={() => { void controller.load() }}
        t={t}
      />
      {state.status === 'ready' && entries.length > 0 ? (
        <ul className={css.packageCards}>
          {entries.map(entry => (
            <ToolCard
              key={entry.packageId}
              entry={entry}
              busy={state.busy}
              requestUninstall={(packageId) => { controller.requestUninstall(packageId) }}
              t={t}
            />
          ))}
        </ul>
      ) : null}
      <PackageConfirmations
        pendingUpgrade={state.pendingUpgrade?.packageId ?? null}
        pendingUninstall={state.pendingUninstall}
        busy={state.busy}
        cancel={() => { controller.cancelConfirmation() }}
        confirmUpgrade={() => { void controller.confirmUpgrade() }}
        confirmUninstall={() => { void controller.confirmUninstall() }}
        t={t}
      />
    </div>
  )
}

function McpCard({
  entry, references, busy, setReference, configure, requestUninstall, t,
}: {
  readonly entry: McpMarketEntry
  readonly references: Readonly<Record<string, string>>
  readonly busy: boolean
  readonly setReference: (slot: string, reference: string) => void
  readonly configure: () => void
  readonly requestUninstall: (packageId: McpMarketPackageId) => void
  readonly t: (key: SkillMarketKey) => string
}): ReactNode {
  return (
    <li className={css.packageCard} data-mcp-package={entry.packageId}>
      <div className={css.packageHeading}>
        <div>
          <h3>{entry.displayName}</h3>
          <p className={css.packageIdentity}>{entry.packageId} · {entry.version}</p>
        </div>
        <span className={css.statusBadge} data-available={entry.available}>
          {entry.available ? t('available') : entry.configured ? t('restartRequired') : t('notConfigured')}
        </span>
      </div>
      <p className={css.description}>{entry.description}</p>
      <dl className={css.metadata}>
        <dt>{t('publisher')}</dt><dd>{entry.publisherId}</dd>
        <dt>{t('servers')}</dt>
        <dd>{entry.servers.map(server => `${server.serverName} (${server.transport})`).join(', ')}</dd>
      </dl>
      {entry.diagnostic === undefined ? null : (
        <p className={css.diagnostic} role="status">{t('diagnostic')}: {entry.diagnostic}</p>
      )}
      {entry.credentialRequirements.length === 0 ? null : (
        <fieldset className={css.credentials}>
          <legend>{t('credentialReferences')}</legend>
          {entry.credentialRequirements.map(requirement => (
            <label key={requirement.slot}>
              <span>{requirement.slot}</span>
              <input
                type="text"
                autoComplete="off"
                aria-label={`${t('credentialReferenceLabel')}: ${requirement.slot}`}
                placeholder={t('credentialReferencePlaceholder')}
                value={references[requirement.slot] ?? ''}
                onChange={(event) => { setReference(requirement.slot, event.target.value) }}
              />
              {requirement.source === undefined ? null : <small>{requirement.source}</small>}
            </label>
          ))}
          <Button size="sm" disabled={busy} onClick={configure}>
            {busy ? t('savingReferences') : t('saveReferences')}
          </Button>
        </fieldset>
      )}
      <button
        type="button"
        className={css.iconButton}
        aria-label={`${t('uninstall')}: ${entry.displayName}`}
        title={t('uninstall')}
        disabled={busy}
        onClick={() => { requestUninstall(entry.packageId) }}
      >
        <IconTrashOutline16 size={16} />
      </button>
    </li>
  )
}

function McpPanel({ injected: {
  mcpController: controller, useMcpSnapshot: useSnapshot, t,
} }: { injected: SkillMarketFace }): ReactNode {
  const state = useSnapshot(value => value)
  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])
  const entries = useMemo(() => filterMcpPackages(state.entries, state.query), [state.entries, state.query])
  return (
    <div className={css.panel} role="tabpanel">
      <Uploader
        id="mcp-market"
        title={t('mcpUploadTitle')}
        uploading={state.busy}
        error={state.error === null ? null : marketFailureText(state.error, t)}
        t={t}
        onPickFile={(file) => { void controller.upload(file) }}
        templateUrl={MCP_TEMPLATE_ARCHIVE_URL}
        templateFilename={MCP_TEMPLATE_ARCHIVE_FILENAME}
      />
      <PackageSearch
        label={t('mcpSearchLabel')}
        placeholder={t('mcpSearchPlaceholder')}
        value={state.query}
        onChange={(value) => { controller.setQuery(value) }}
      />
      <RestartNotice visible={state.restartNotice !== null} t={t} />
      <PackageState
        status={state.status}
        error={state.error}
        empty="mcpEmpty"
        emptyFiltered="mcpEmptyFiltered"
        hasEntries={state.entries.length > 0}
        hasMatches={entries.length > 0}
        retry={() => { void controller.load() }}
        t={t}
      />
      {state.status === 'ready' && entries.length > 0 ? (
        <ul className={css.packageCards}>
          {entries.map(entry => (
            <McpCard
              key={entry.packageId}
              entry={entry}
              references={state.credentialReferences[entry.packageId] ?? {}}
              busy={state.busy}
              setReference={(slot, reference) => { controller.setCredentialReference(entry.packageId, slot, reference) }}
              configure={() => { void controller.configure(entry.packageId) }}
              requestUninstall={(packageId) => { controller.requestUninstall(packageId) }}
              t={t}
            />
          ))}
        </ul>
      ) : null}
      <PackageConfirmations
        pendingUpgrade={state.pendingUpgrade?.packageId ?? null}
        pendingUninstall={state.pendingUninstall}
        busy={state.busy}
        cancel={() => { controller.cancelConfirmation() }}
        confirmUpgrade={() => { void controller.confirmUpgrade() }}
        confirmUninstall={() => { void controller.confirmUninstall() }}
        t={t}
      />
    </div>
  )
}

function PackageConfirmations({
  pendingUpgrade, pendingUninstall, busy, cancel, confirmUpgrade, confirmUninstall, t,
}: {
  readonly pendingUpgrade: string | null
  readonly pendingUninstall: string | null
  readonly busy: boolean
  readonly cancel: () => void
  readonly confirmUpgrade: () => void
  readonly confirmUninstall: () => void
  readonly t: (key: SkillMarketKey) => string
}): ReactNode {
  return (
    <>
      <Modal
        open={pendingUpgrade !== null}
        onClose={cancel}
        title={t('packageUpgradeTitle')}
        closeLabel={t('close')}
        description={pendingUpgrade === null ? '' : `${t('packageUpgradeDescription')} ${pendingUpgrade}`}
        footer={<>
          <Button variant="outline" onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={busy} onClick={confirmUpgrade}>{t('upgradeConfirm')}</Button>
        </>}
      />
      <Modal
        open={pendingUninstall !== null}
        onClose={cancel}
        title={t('packageUninstallTitle')}
        closeLabel={t('close')}
        description={pendingUninstall === null ? '' : `${t('packageUninstallDescription')} ${pendingUninstall}`}
        footer={<>
          <Button variant="outline" onClick={cancel}>{t('cancel')}</Button>
          <Button disabled={busy} onClick={confirmUninstall}>{t('uninstallConfirm')}</Button>
        </>}
      />
    </>
  )
}

export const __testing = {
  Uploader, SkillCard, Loaded, ToolCard, McpCard, PackageState,
}
