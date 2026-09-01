/** Operational digital employee workspace. */
import { useEffect, useState, type ReactNode } from 'react'
import type {
  DigitalEmployeeConfigurationAuthority,
  DigitalEmployeeConfigurationAsset,
  DigitalEmployeeConfigurationExpert,
  DigitalEmployeeConfigurationMemorySeed,
  DigitalEmployeeInstanceId,
  DigitalEmployeeTemplateDraft,
} from '@deepseek-ai/dsh-api-remotes/client'
import {
  Button, IconCloseOutline16, IconPauseOutline16, IconPlayOutline16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { DigitalEmployeeStore, DigitalEmployeeView } from './store.ts'
import type { DigitalEmployeeConfigurationStudioStore } from './configuration-studio.ts'
import css from './DigitalEmployeeWorkspace.module.css'

/** Values injected by the client plugin registration. */
export interface DigitalEmployeeWorkspaceInjected {
  controller: DigitalEmployeeStore
  configurationStudio?: DigitalEmployeeConfigurationStudioStore
  previewWorkspace?: () => string | undefined
  hooks: {
    snapshot: DigitalEmployeeStore['store']
    configurationSnapshot: DigitalEmployeeConfigurationStudioStore['store']
  }
  close: () => void
  startChat: (employeeId: DigitalEmployeeInstanceId) => void
}

/** Component props supplied by the shell application slot. */
export type DigitalEmployeeWorkspaceProps = Partial<InjectFace<DigitalEmployeeWorkspaceInjected>>
type WorkspaceFace = InjectFace<DigitalEmployeeWorkspaceInjected>

const VIEWS: ReadonlyArray<{ id: DigitalEmployeeView; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'experts', label: 'Experts' },
  { id: 'memory', label: 'Memory' },
  { id: 'tasks', label: 'Task tree' },
  { id: 'audit', label: 'Audit' },
]

/** Render a fully injected workspace, or nothing before its slot injection is ready. */
export function DigitalEmployeeWorkspace(props: DigitalEmployeeWorkspaceProps): ReactNode {
  const {
    controller, configurationStudio, previewWorkspace, useSnapshot, useConfigurationSnapshot, close, startChat,
  } = props
  if (controller === undefined || useSnapshot === undefined || close === undefined || startChat === undefined) return null
  return (
    <Loaded
      controller={controller}
      {...configurationStudio === undefined ? {} : { configurationStudio }}
      {...previewWorkspace === undefined ? {} : { previewWorkspace }}
      useSnapshot={useSnapshot}
      {...useConfigurationSnapshot === undefined ? {} : { useConfigurationSnapshot }}
      close={close}
      startChat={startChat}
    />
  )
}

type LoadedProps = Omit<WorkspaceFace, 'configurationStudio' | 'previewWorkspace' | 'useConfigurationSnapshot'> & {
  configurationStudio?: WorkspaceFace['configurationStudio']
  previewWorkspace?: WorkspaceFace['previewWorkspace']
  useConfigurationSnapshot?: WorkspaceFace['useConfigurationSnapshot']
}

function Loaded({
  controller, configurationStudio, previewWorkspace, useSnapshot, useConfigurationSnapshot, close, startChat,
}: LoadedProps): ReactNode {
  const state = useSnapshot(value => value)
  const [displayName, setDisplayName] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [upgradeVersion, setUpgradeVersion] = useState('')
  const [importText, setImportText] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<'operations' | 'configuration'>('operations')
  useEffect(() => { void controller.load() }, [controller])
  useEffect(() => { if (configurationStudio !== undefined) void configurationStudio.load() }, [configurationStudio])
  const selected = state.detail
  const busy = state.busy !== null

  const create = (): void => {
    const template = state.templates.find(item => `${item.id}@${item.version}` === templateKey)
    if (template === undefined || displayName.trim() === '') return
    void controller.create(template.id, template.version, displayName.trim())
  }
  const importEmployee = (): void => {
    try {
      const artifact = JSON.parse(importText) as Parameters<DigitalEmployeeStore['importEmployee']>[0]
      setLocalError(null)
      void controller.importEmployee(artifact)
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className={css.workspace}>
      <aside className={css.inventory} aria-label="Digital employees">
        <div className={css.inventoryHeader}>
          <strong>Digital employees</strong>
          <span>{state.employees.length}</span>
        </div>
        {state.status === 'loading' && state.employees.length === 0
          ? <p className={css.empty}>Loading employees...</p>
          : state.employees.length === 0
            ? <p className={css.empty}>No digital employees.</p>
            : (
              <ul className={css.employeeList}>
                {state.employees.map(employee => (
                  <li key={employee.id}>
                    <button
                      type="button"
                      className={css.employeeButton}
                      aria-current={state.selectedId === employee.id}
                      onClick={() => { void controller.select(employee.id) }}
                    >
                      <span>{employee.displayName}</span>
                      <small>{employee.state}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        <div className={css.create}>
          <select aria-label="Employee template" value={templateKey} onChange={(event) => { setTemplateKey(event.target.value) }}>
            <option value="">Choose template</option>
            {state.templates.map(template => (
              <option key={`${template.id}@${template.version}`} value={`${template.id}@${template.version}`}>
                {template.display.name} · {template.version}
              </option>
            ))}
          </select>
          <input aria-label="Employee name" value={displayName} onChange={(event) => { setDisplayName(event.target.value) }} placeholder="Employee name" />
          <Button size="sm" variant="primary" disabled={busy || templateKey === '' || displayName.trim() === ''} onClick={create}>Create</Button>
        </div>
      </aside>

      <section className={css.detail}>
        <header className={css.header}>
          <div>
            <h1>{workspaceView === 'configuration' ? 'Template configuration' : selected?.displayName ?? 'Digital employees'}</h1>
            {workspaceView === 'configuration' || selected === null ? null : (
              <p>{selected.templateId} · {selected.templateVersion} · {selected.state}</p>
            )}
          </div>
          <button className={css.iconButton} type="button" aria-label="Close digital employees" onClick={close}>
            <IconCloseOutline16 />
          </button>
        </header>

        {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
        {configurationStudio === undefined || useConfigurationSnapshot === undefined ? null : (
          <div className={css.tabs} role="tablist" aria-label="Digital employee workspace">
            <button type="button" role="tab" aria-selected={workspaceView === 'operations'} onClick={() => { setWorkspaceView('operations') }}>
              Employee operations
            </button>
            <button type="button" role="tab" aria-selected={workspaceView === 'configuration'} onClick={() => { setWorkspaceView('configuration') }}>
              Template configuration
            </button>
          </div>
        )}
        {workspaceView === 'configuration' && configurationStudio !== undefined && useConfigurationSnapshot !== undefined
          ? <ConfigurationSummary
            controller={configurationStudio}
            {...previewWorkspace === undefined ? {} : { previewWorkspace }}
            useSnapshot={useConfigurationSnapshot}
          />
          : selected === null ? <p className={css.empty}>Select or create a digital employee.</p> : (
            <>
              <div className={css.actions}>
                {selected.state === 'active'
                  ? (
                    <Button onClick={() => { void controller.deactivate() }} disabled={state.busy !== null}>
                      <IconPauseOutline16 />Deactivate
                    </Button>
                  )
                  : (
                    <Button onClick={() => { void controller.activate() }} disabled={state.busy !== null}>
                      <IconPlayOutline16 />Activate
                    </Button>
                  )}
                <Button
                  variant="outline"
                  className={css.dangerButton}
                  onClick={() => { controller.requestDelete() }}
                  disabled={state.busy !== null}
                >
                  <IconTrashOutline16 />Delete employee
                </Button>
                <Button
                  variant="primary"
                  onClick={() => { startChat(selected.id) }}
                  disabled={busy || selected.state !== 'active'}
                >
                  <IconPlayOutline16 />Start chat
                </Button>
                <Button onClick={() => { void controller.exportEmployee(true) }} disabled={busy}>Export</Button>
              </div>
              <div className={css.inlineForm}>
                <input aria-label="Target template version" value={upgradeVersion} onChange={(event) => { setUpgradeVersion(event.target.value) }} placeholder="Target version" />
                <Button size="sm" disabled={busy || upgradeVersion.trim() === ''} onClick={() => { void controller.previewUpgrade(upgradeVersion.trim()) }}>Review upgrade</Button>
              </div>

              <div className={css.tabs} role="tablist" aria-label="Employee details">
                {VIEWS.map(view => (
                  <button
                    key={view.id}
                    type="button"
                    role="tab"
                    aria-selected={state.view === view.id}
                    onClick={() => { controller.setView(view.id) }}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <View state={state} controller={controller} />
              <section className={css.portability}>
                <h2>Import and export</h2>
                <textarea aria-label="Employee import JSON" value={importText} onChange={(event) => { setImportText(event.target.value) }} placeholder="Paste a digital employee export" />
                <Button size="sm" disabled={busy || importText.trim() === ''} onClick={importEmployee}>Import employee</Button>
                {localError === null ? null : <p className={css.error} role="alert">{localError}</p>}
                {state.exported === null ? null : <pre>{JSON.stringify(state.exported, null, 2)}</pre>}
              </section>
            </>
          )}
      </section>

      {state.confirmation?.kind === 'delete' ? (
        <div className={css.confirmation} role="dialog" aria-modal="true" aria-labelledby="employee-delete-title">
          <h2 id="employee-delete-title">Delete digital employee?</h2>
          <p>Active work and connections will be stopped before employee data is removed.</p>
          <div>
            <Button onClick={() => { controller.cancelConfirmation() }}>Cancel</Button>
            <Button variant="outline" className={css.dangerButton} onClick={() => { void controller.confirm() }}>Delete employee</Button>
          </div>
        </div>
      ) : state.confirmation?.kind === 'upgrade' ? (
        <div className={css.confirmation} role="dialog" aria-modal="true" aria-labelledby="employee-upgrade-title">
          <h2 id="employee-upgrade-title">Approve template upgrade?</h2>
          <p>{state.confirmation.preview.currentVersion} → {state.confirmation.preview.targetVersion}</p>
          <p>New capabilities remain ungranted unless explicitly approved.</p>
          <label className={css.checkbox}>
            <input
              type="checkbox"
              checked={state.confirmation.approvedCapabilities.allowSubagents}
              onChange={(event) => {
                const added = state.confirmation?.kind === 'upgrade' ? state.confirmation.preview.addedCapabilities : null
                if (added === null) return
                controller.approveUpgrade(event.target.checked ? added : {
                  skills: [], tools: [], mcpServers: [], experts: [], allowSubagents: false,
                })
              }}
            />
            Approve all newly requested capabilities
          </label>
          <div>
            <Button onClick={() => { controller.cancelConfirmation() }}>Cancel</Button>
            <Button variant="primary" onClick={() => { void controller.confirm() }}>Apply upgrade</Button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function ConfigurationSummary({ controller, previewWorkspace, useSnapshot }: {
  controller: DigitalEmployeeConfigurationStudioStore
  previewWorkspace?: () => string | undefined
  useSnapshot: (selector: (value: ReturnType<DigitalEmployeeConfigurationStudioStore['store']['getSnapshot']>) => unknown) => unknown
}): ReactNode {
  const state = useSnapshot(value => value) as ReturnType<DigitalEmployeeConfigurationStudioStore['store']['getSnapshot']>
  const [templateId, setTemplateId] = useState('')
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [publishTarget, setPublishTarget] = useState<DigitalEmployeeTemplateDraft | null>(null)
  const [editing, setEditing] = useState<DigitalEmployeeTemplateDraft | null>(null)
  const workspaceId = previewWorkspace?.()
  if (state.status !== 'ready') {
    return (
      <section className={css.portability} aria-label="Template configuration">
        <h2>Template configuration</h2>
        {state.status === 'error'
          ? <p className={css.error} role="alert">{state.error ?? 'Unable to load template configuration.'}</p>
          : <p className={css.empty}>Loading template configuration...</p>}
      </section>
    )
  }
  return (
    <section className={css.portability} aria-label="Template configuration">
      <h2>Template configuration</h2>
      <div className={css.inlineForm}>
        <input aria-label="Template ID" value={templateId} onChange={(event) => { setTemplateId(event.target.value) }} placeholder="Template ID" />
        <input aria-label="Template name" value={name} onChange={(event) => { setName(event.target.value) }} placeholder="Template name" />
        <input aria-label="Template instructions" value={instructions} onChange={(event) => { setInstructions(event.target.value) }} placeholder="Instructions" />
        <Button
          size="sm"
          disabled={templateId.trim() === '' || name.trim() === '' || instructions.trim() === ''}
          onClick={() => {
            void controller.create({
              templateId: templateId.trim(),
              display: { name: name.trim(), description: name.trim() },
              instructions: instructions.trim(),
            }).then(() => { setTemplateId(''); setName(''); setInstructions('') })
          }}
        >
          Create draft
        </Button>
      </div>
      <ul className={css.employeeList}>
        {state.drafts.map(draft => (
          <li key={draft.id}>
            <span>{draft.display.name} · r{draft.revision}</span>
            <div className={css.actions}>
              <Button size="sm" onClick={() => {
                setEditing(draft)
                void controller.loadAssets(draft.preset)
              }}>Edit</Button>
              <Button size="sm" onClick={() => { void controller.validate(draft.id) }}>Validate</Button>
              <Button size="sm" disabled={workspaceId === undefined} onClick={() => {
                if (workspaceId !== undefined) void controller.preview(draft, workspaceId)
              }}>Preview</Button>
              <Button size="sm" variant="primary" onClick={() => { setPublishTarget(draft) }}>Publish</Button>
              <Button size="sm" variant="outline" className={css.dangerButton} onClick={() => { void controller.delete(draft.id) }}>Delete</Button>
            </div>
            {(state.diagnostics[draft.id] ?? []).map(diagnostic => (
              <p key={`${diagnostic.code}-${diagnostic.path}`} className={css.error}>{diagnostic.message}</p>
            ))}
          </li>
        ))}
      </ul>
      <p>{state.publications.length} published versions</p>
      {editing === null ? null : (
        <DraftEditor
          draft={editing}
          assets={state.assets}
          assetStatus={state.assetStatus}
          assetError={state.assetError}
          controller={controller}
          onClose={() => { setEditing(null) }}
          onSaved={() => { setEditing(null) }}
        />
      )}
      {state.preview === null ? null : (
        <div className={css.actions}>
          <span>Preview session: {state.preview.sessionId}</span>
          <Button size="sm" onClick={() => { void controller.disposePreview() }}>Stop preview</Button>
        </div>
      )}
      {publishTarget === null ? null : (
        <div className={css.confirmation} role="dialog" aria-modal="true" aria-labelledby="template-publish-title">
          <h2 id="template-publish-title">Publish template version?</h2>
          <p>{publishTarget.display.name} revision {publishTarget.revision} becomes an immutable version.</p>
          <div>
            <Button onClick={() => { setPublishTarget(null) }}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              void controller.publish(publishTarget).then(() => { setPublishTarget(null) })
            }}>Publish template</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function DraftEditor({ draft, assets, assetStatus, assetError, controller, onClose, onSaved }: {
  draft: DigitalEmployeeTemplateDraft
  assets: readonly DigitalEmployeeConfigurationAsset[]
  assetStatus: 'idle' | 'loading' | 'ready' | 'error'
  assetError: string | null
  controller: DigitalEmployeeConfigurationStudioStore
  onClose: () => void
  onSaved: () => void
}): ReactNode {
  const [templateId, setTemplateId] = useState(draft.templateId)
  const [name, setName] = useState(draft.display.name)
  const [description, setDescription] = useState(draft.display.description)
  const [personality, setPersonality] = useState(draft.personality)
  const [preset, setPreset] = useState(draft.preset)
  const [instructions, setInstructions] = useState(draft.instructions)
  const [capabilities, setCapabilities] = useState(draft.capabilities)
  const [mcpServers, setMcpServers] = useState([...draft.mcpServers])
  const [experts, setExperts] = useState(JSON.stringify(draft.experts, null, 2))
  const [memorySeeds, setMemorySeeds] = useState(JSON.stringify(draft.memorySeeds, null, 2))
  const [error, setError] = useState<string | null>(null)
  const save = (): void => {
    try {
      const patch = {
        templateId: templateId.trim(),
        display: { name: name.trim(), description: description.trim() },
        personality: personality.trim(),
        preset: preset.trim(),
        instructions: instructions.trim(),
        capabilities,
        mcpServers,
        experts: JSON.parse(experts) as DigitalEmployeeConfigurationExpert[],
        memorySeeds: JSON.parse(memorySeeds) as DigitalEmployeeConfigurationMemorySeed[],
      }
      setError(null)
      void controller.update({ draftId: draft.id, revision: draft.revision, patch }).then(onSaved).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason))
      })
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  return (
    <section className={css.portability} aria-label={`Edit template ${draft.display.name}`}>
      <h2>Edit template</h2>
      <div className={css.inlineForm}>
        <input aria-label="Edit template ID" value={templateId} onChange={(event) => { setTemplateId(event.target.value) }} />
        <input aria-label="Edit template name" value={name} onChange={(event) => { setName(event.target.value) }} />
        <input aria-label="Edit template description" value={description} onChange={(event) => { setDescription(event.target.value) }} />
        <input aria-label="Edit template personality" value={personality} onChange={(event) => { setPersonality(event.target.value) }} />
        <input aria-label="Edit template preset" value={preset} onChange={(event) => {
          const next = event.target.value
          setPreset(next)
          void controller.loadAssets(next.trim())
        }} />
      </div>
      {assetStatus === 'loading' ? <p className={css.empty}>Loading skills for this preset...</p> : null}
      {assetStatus === 'error' ? <p className={css.error} role="alert">{assetError ?? 'Unable to load preset skills.'}</p> : null}
      <textarea aria-label="Edit template instructions" value={instructions} onChange={(event) => { setInstructions(event.target.value) }} />
      <CapabilitySelectors
        assets={assets}
        allowNewSelections={assetStatus === 'ready'}
        value={capabilities}
        mcpServers={mcpServers}
        onChange={setCapabilities}
        onMcpServersChange={(value) => { setMcpServers([...value]) }}
      />
      <textarea aria-label="Edit template experts" value={experts} onChange={(event) => { setExperts(event.target.value) }} />
      <textarea aria-label="Edit template memory seeds" value={memorySeeds} onChange={(event) => { setMemorySeeds(event.target.value) }} />
      {error === null ? null : <p className={css.error} role="alert">{error}</p>}
      <div className={css.actions}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save draft</Button>
      </div>
    </section>
  )
}

function CapabilitySelectors({ assets, allowNewSelections, value, mcpServers, onChange, onMcpServersChange }: {
  assets: readonly DigitalEmployeeConfigurationAsset[]
  allowNewSelections: boolean
  value: DigitalEmployeeConfigurationAuthority
  mcpServers: readonly import('@deepseek-ai/dsh-api-remotes/client').DigitalEmployeeConfigurationMcpServer[]
  onChange: (value: DigitalEmployeeConfigurationAuthority) => void
  onMcpServersChange: (
    value: readonly import('@deepseek-ai/dsh-api-remotes/client').DigitalEmployeeConfigurationMcpServer[],
  ) => void
}): ReactNode {
  const [search, setSearch] = useState('')
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const selected: Record<DigitalEmployeeConfigurationAsset['kind'], readonly string[]> = {
    skill: value.skills,
    tool: value.tools,
    mcp: value.mcpServers,
  }
  const labels: Record<DigitalEmployeeConfigurationAsset['kind'], string> = {
    skill: 'Skills',
    tool: 'Tools',
    mcp: 'MCP clients',
  }
  const update = (kind: DigitalEmployeeConfigurationAsset['kind'], id: string, checked: boolean): void => {
    const current = selected[kind]
    const next = checked
      ? [...current, id]
      : current.filter(candidate => candidate !== id)
    onChange({
      ...value,
      ...(kind === 'skill' ? { skills: next } : kind === 'tool' ? { tools: next } : { mcpServers: next }),
    })
    if (kind === 'mcp') {
      const asset = assets.find(candidate => candidate.kind === 'mcp' && candidate.label === id)
      if (checked && asset?.mcpServer !== undefined && !mcpServers.some(server => server.id === id)) {
        onMcpServersChange([...mcpServers, asset.mcpServer])
      } else if (!checked) {
        onMcpServersChange(mcpServers.filter(server => server.id !== id))
      }
    }
  }
  return (
    <section className={css.list} aria-label="Template capabilities">
      <h3>Capabilities</h3>
      <input aria-label="Search skills" value={search} onChange={(event) => { setSearch(event.target.value) }} placeholder="Search capabilities" />
      {(['skill', 'tool', 'mcp'] as const).map((kind) => {
        const label = labels[kind]
        const visible = assets.filter(asset => asset.kind === kind && (
          normalizedSearch === ''
          || asset.label.toLocaleLowerCase().includes(normalizedSearch)
          || asset.description?.toLocaleLowerCase().includes(normalizedSearch) === true
        ))
        const selectedIds = selected[kind]
        const unresolved = selectedIds.filter(id => !assets.some(asset => asset.kind === kind && asset.label === id))
        return (
          <section key={kind} className={css.list} aria-label={label}>
            <h4>{label}</h4>
            {visible.length === 0 ? <p className={css.empty}>No matching {label.toLocaleLowerCase()}.</p> : (
              <ul>{visible.map(asset => (
                <li key={asset.id}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={asset.label}
                      checked={selectedIds.includes(asset.label)}
                      disabled={(!allowNewSelections || !asset.available) && !selectedIds.includes(asset.label)}
                      onChange={(event) => { update(kind, asset.label, event.target.checked) }}
                    />
                    <span>{asset.label}</span>
                  </label>
                  {asset.description === undefined ? null : <small>{asset.description}</small>}
                  <small>
                    {asset.kind === 'skill'
                      ? asset.managedByMarket === true ? 'Marketplace' : 'Local skill'
                      : asset.source}
                    {asset.version === undefined ? '' : ` · ${asset.version}`}
                    {asset.publisher === undefined ? '' : ` · ${asset.publisher}`}
                  </small>
                  {asset.tags === undefined || asset.tags.length === 0 ? null : <small>{asset.tags.join(' · ')}</small>}
                  {asset.permissionSummary.length === 0 ? null : <small>{asset.permissionSummary.join(' · ')}</small>}
                  {asset.available ? null : <small>{asset.diagnostic ?? 'Unavailable'}</small>}
                </li>
              ))}</ul>
            )}
            {unresolved.map(id => (
              <p key={id} className={css.error}>
                Unavailable {kind}: {id}
                <Button onClick={() => { update(kind, id, false) }}>Remove</Button>
              </p>
            ))}
          </section>
        )
      })}
    </section>
  )
}

function View({ state, controller }: {
  state: ReturnType<DigitalEmployeeStore['store']['getSnapshot']>
  controller: DigitalEmployeeStore
}): ReactNode {
  const [expertFollowUps, setExpertFollowUps] = useState<Record<string, string>>({})
  const detail = state.detail
  if (detail === null) return null
  switch (state.view) {
    case 'overview':
      return (
        <dl className={css.grid}>
          <dt>Employee ID</dt><dd>{detail.id}</dd>
          <dt>Template</dt><dd>{detail.templateId}@{detail.templateVersion}</dd>
          <dt>Lifecycle</dt><dd>{detail.state}</dd>
        </dl>
      )
    case 'capabilities':
      return (
        <div className={css.columns}>
          <List title="Skills" values={detail.grants.skills} />
          <List title="Tools" values={detail.grants.tools} />
          <List title="MCP servers" values={detail.grants.mcpServers} />
        </div>
      )
    case 'experts':
      return <List title="Experts" values={state.experts.map(expert => `${expert.name}: ${expert.responsibility}`)} />
    case 'memory':
      return (
        <section className={css.list}>
          <h2>Long-term memory</h2>
          {state.memories.length === 0 ? <p className={css.empty}>Nothing to show.</p> : (
            <ul>{state.memories.map(memory => (
              <li key={memory.id}>
                <span>{memory.content}</span>
                <button type="button" aria-label={`Delete memory ${memory.id}`} onClick={() => { void controller.deleteMemory(memory.id) }}>
                  <IconTrashOutline16 />
                </button>
              </li>
            ))}</ul>
          )}
        </section>
      )
    case 'tasks':
      return (
        <section className={css.list}>
          <h2>Agent tree</h2>
          {state.taskTree.length === 0 ? <p className={css.empty}>Nothing to show.</p> : (
            <ul>{state.taskTree.map(entry => (
              <li key={entry.id}>
                <span>{entry.id}: {entry.kind === 'child' ? entry.activity : entry.reason}</span>
                {entry.kind !== 'child' ? null : (
                  <>
                    <button type="button" aria-label={`Interrupt ${entry.id}`} onClick={() => { void controller.interrupt(entry.parentId, entry.id) }}>
                      <IconPauseOutline16 />
                    </button>
                    {entry.mode !== 'continuable' ? null : (
                      <span className={css.inlineForm}>
                        <input
                          aria-label={`Follow up with ${entry.id}`}
                          value={expertFollowUps[entry.id] ?? ''}
                          onChange={(event) => {
                            setExpertFollowUps(current => ({ ...current, [entry.id]: event.target.value }))
                          }}
                        />
                        <button
                          type="button"
                          aria-label={`Continue ${entry.id}`}
                          disabled={(expertFollowUps[entry.id] ?? '').trim() === ''}
                          onClick={() => {
                            const text = (expertFollowUps[entry.id] ?? '').trim()
                            if (text === '') return
                            setExpertFollowUps(current => ({ ...current, [entry.id]: '' }))
                            void controller.continueExpert(entry.parentId, entry.id, text)
                          }}
                        >
                          <IconPlayOutline16 />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}</ul>
          )}
        </section>
      )
    case 'audit':
      return <List title="Audit history" values={state.audit.map(record => record.action)} />
  }
}

function List({ title, values }: { title: string; values: readonly string[] }): ReactNode {
  return (
    <section className={css.list}>
      <h2>{title}</h2>
      {values.length === 0 ? <p className={css.empty}>Nothing to show.</p> : <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>}
    </section>
  )
}
