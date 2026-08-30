/** Operational digital employee workspace. */
import { useEffect, useState, type ReactNode } from 'react'
import type { DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-api-remotes/client'
import {
  Button, IconCloseOutline16, IconPauseOutline16, IconPlayOutline16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { DigitalEmployeeStore, DigitalEmployeeView } from './store.ts'
import css from './DigitalEmployeeWorkspace.module.css'

/** Values injected by the client plugin registration. */
export interface DigitalEmployeeWorkspaceInjected {
  controller: DigitalEmployeeStore
  hooks: { snapshot: DigitalEmployeeStore['store'] }
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
  const { controller, useSnapshot, close, startChat } = props
  if (controller === undefined || useSnapshot === undefined || close === undefined || startChat === undefined) return null
  return <Loaded controller={controller} useSnapshot={useSnapshot} close={close} startChat={startChat} />
}

function Loaded({ controller, useSnapshot, close, startChat }: WorkspaceFace): ReactNode {
  const state = useSnapshot(value => value)
  const [displayName, setDisplayName] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [upgradeVersion, setUpgradeVersion] = useState('')
  const [importText, setImportText] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => { void controller.load() }, [controller])
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
            <h1>{selected?.displayName ?? 'Digital employees'}</h1>
            {selected === null ? null : (
              <p>{selected.templateId} · {selected.templateVersion} · {selected.state}</p>
            )}
          </div>
          <button className={css.iconButton} type="button" aria-label="Close digital employees" onClick={close}>
            <IconCloseOutline16 />
          </button>
        </header>

        {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
        {selected === null ? <p className={css.empty}>Select or create a digital employee.</p> : (
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
