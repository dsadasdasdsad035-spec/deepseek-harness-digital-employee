/** Full-screen 3D company campus console rendered as a shell overlay. */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Button, IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { CompanyFloorMember, CompanyId, DepartmentId, DigitalEmployeeInstanceId } from '@deepseek-ai/dsh-api-remotes/client'
import { CompanyScene, type FloorDepartment } from './scene.ts'
import { COMPANY_SKINS, DEFAULT_COMPANY_SKIN } from './skins.ts'
import type { CompanyGroupStore } from './store.ts'
import type { CompanyStore } from './store.ts'
import css from './CompanyWorkspace.module.css'

/** Values injected by the client plugin registration. */
export interface CompanyWorkspaceInjected {
  controller: CompanyStore
  groupStore: CompanyGroupStore
  hooks: {
    snapshot: CompanyStore['store']
    open: { getSnapshot(): { open: boolean }; subscribe(fn: () => void): () => void }
  }
  close: () => void
  /** Close the console and surface the digital employee workspace. */
  openEmployeeWorkspace: () => void
  /** Open one session in the main conversation surface. */
  openSession: (id: string) => void
}

/** Component props supplied by the shell overlay slot. */
export type CompanyWorkspaceProps = Partial<InjectFace<CompanyWorkspaceInjected>>
type WorkspaceFace = InjectFace<CompanyWorkspaceInjected>

/** Render the console while its overlay is open, or nothing. */
export function CompanyWorkspace(props: CompanyWorkspaceProps): ReactNode {
  const { controller, groupStore, useSnapshot, useOpen, close, openEmployeeWorkspace, openSession } = props
  if (controller === undefined || groupStore === undefined || useSnapshot === undefined || useOpen === undefined
    || close === undefined || openEmployeeWorkspace === undefined || openSession === undefined) return null
  return (
    <Console
      controller={controller}
      groupStore={groupStore}
      openSession={openSession}
      useSnapshot={useSnapshot}
      useOpen={useOpen}
      close={close}
      openEmployeeWorkspace={openEmployeeWorkspace}
    />
  )
}

type ConsoleProps = WorkspaceFace

type Mode = { kind: 'campus' } | { kind: 'floor'; companyId: CompanyId }

function Console({ controller, groupStore, useSnapshot, useOpen, close, openEmployeeWorkspace, openSession }: ConsoleProps): ReactNode {
  const state = useSnapshot(value => value)
  const open = useOpen(value => value.open)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<CompanyScene | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'campus' })
  const [selectedMember, setSelectedMember] = useState<DigitalEmployeeInstanceId | null>(null)
  const [promoImages, setPromoImages] = useState<ReadonlyMap<string, string>>(new Map())
  const [promoError, setPromoError] = useState<string | null>(null)
  const [departmentName, setDepartmentName] = useState('')
  const [bindDepartment, setBindDepartment] = useState<DepartmentId | null>(null)
  const [bindInstance, setBindInstance] = useState<string>('')
  const [renameDraft, setRenameDraft] = useState<DepartmentId | null>(null)
  const [renameText, setRenameText] = useState('')
  const [form, setForm] = useState({ name: '', category: '', legalRepresentative: '', address: '' })
  const [edit, setEdit] = useState({ name: '', category: '', legalRepresentative: '', address: '' })

  useEffect(() => {
    if (!open) return
    void controller.load()
    controller.startPolling()
    const reportWorld = (): void => {
      const snapshot = sceneRef.current?.snapshotWorldState()
      if (snapshot !== undefined) void controller.reportWorldState(snapshot)
    }
    const worldTimer = setInterval(reportWorld, 5_000)
    return () => {
      controller.stopPolling()
      clearInterval(worldTimer)
      reportWorld()
    }
  }, [controller, open])

  const floor = mode.kind === 'floor' ? state.floors[mode.companyId as string] : undefined
  const selected = mode.kind === 'floor'
    ? state.companies.find(company => company.id === mode.companyId)
    : undefined

  useEffect(() => {
    if (!open || mode.kind !== 'floor') return
    void controller.loadFloor(mode.companyId)
  }, [controller, mode, open])

  const selectedId = selected?.id
  useEffect(() => {
    if (selectedId === undefined) return
    setEdit({ name: '', category: '', legalRepresentative: '', address: '' })
  }, [selectedId])

  useEffect(() => {
    if (selected !== undefined && (edit.name === '' && edit.category === '' && edit.legalRepresentative === ''
      && edit.address === '')) {
      setEdit({
        name: selected.name,
        category: selected.category,
        legalRepresentative: selected.legalRepresentative,
        address: selected.address,
      })
    }
  }, [selected, edit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!open || canvas === null || sceneRef.current !== null) return
    const scene = new CompanyScene(canvas, {
      onCompanyClick: (companyId) => { setMode({ kind: 'floor', companyId: companyId as CompanyId }) },
      onMemberClick: (memberKey) => { setSelectedMember(memberKey as DigitalEmployeeInstanceId) },
      onSeatClick: (departmentKey) => { setBindDepartment(departmentKey === null ? null : departmentKey as DepartmentId) },
    })
    sceneRef.current = scene
    scene.visitReporter = controller.visitReporter
    return () => {
      scene.dispose()
      sceneRef.current = null
    }
  }, [open])

  const campusCompanies = useMemo(() => state.companies.map((company) => {
    const companyFloor = state.floors[company.id as string]
    const members = companyFloor === undefined ? [] : companyFloor.groups.flatMap(group => group.members)
    return {
      id: company.id,
      name: company.name,
      category: company.category,
      address: company.address,
      ...(company.skinId === undefined ? {} : { skinId: company.skinId }),
      memberCount: members.length,
      busyCount: members.filter(member => controller.verdictOf(member).busy).length,
    }
  }), [state.companies, state.floors, controller])

  // Structural signature: busy-count churn must NOT rebuild the campus (the
  // whole scene — cars included — would otherwise reset on every poll); the
  // busy text refreshes through updateCampusSummaries instead.
  const campusStructureKey = campusCompanies.map(company => [
    company.id, company.name, company.category, company.address,
    company.skinId ?? '', String(company.memberCount),
  ].join(':')).join('|') + `#${String(promoImages.size)}`

  useEffect(() => {
    if (!open || sceneRef.current === null || mode.kind !== 'campus') return
    // In-place rebuilds resume from the LIVE motion snapshot (exact cars and
    // rails); the durable host state seeds only the first build.
    const live = sceneRef.current.preserveMotion()
    const savedCars = Object.keys(live.cars).length > 0 ? live.cars : controller.worldState?.cars
    sceneRef.current.setCampus(campusCompanies, promoImages, savedCars, live.rails)
    // The key (not campusCompanies) is the trigger: busy-poll identity churn
    // must never rebuild the campus and reset its motion.
  }, [open, mode, campusStructureKey])

  useEffect(() => {
    if (!open || sceneRef.current === null || mode.kind !== 'campus') return
    sceneRef.current.updateCampusSummaries(campusCompanies)
  }, [open, mode, campusCompanies])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.all(state.companies
      .filter(company => company.promoImage !== undefined)
      .map(async company => [company.id as string, await controller.promoImage(company.id)] as const))
      .then((entries) => {
        if (!cancelled) setPromoImages(new Map(entries.flatMap(([id, url]) => url === null ? [] : [[id, url] as const])))
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [open, state.companies, controller])

  useEffect(() => {
    if (!open || sceneRef.current === null || mode.kind !== 'floor' || floor === undefined) return
    const departments: FloorDepartment[] = floor.groups.map((group) => {
      const members = group.members.map(member => ({
        ...member.chatTail === undefined ? {} : { chatTail: member.chatTail },
        key: member.instanceId as string,
        displayName: member.displayName,
        busy: controller.verdictOf(member).busy,
      }))
      const spare = members.length % 3 === 0 ? 3 : 3 - (members.length % 3)
      return {
        key: group.department === null ? null : group.department.id,
        name: group.department === null ? '未分配' : group.department.name,
        color: group.department === null ? '#94a3b8' : group.department.color,
        members,
        emptySeats: group.department === null ? 0 : spare,
      }
    })
    sceneRef.current.setFloor(
      floor.company.name, floor.company.skinId, departments,
      String(floor.company.id), controller.worldState?.employees,
    )
  }, [open, mode, floor, controller])

  useEffect(() => {
    if (mode.kind !== 'floor' || floor === undefined || sceneRef.current === null) return
    for (const group of floor.groups) {
      for (const member of group.members) {
        sceneRef.current.updateBusy(member.instanceId, controller.verdictOf(member).busy)
      }
    }
  }, [mode, floor, state.runningSessions, controller])

  const memberDetail = useMemo<{ member: CompanyFloorMember; busy: boolean } | null>(() => {
    if (selectedMember === null || floor === undefined) return null
    for (const group of floor.groups) {
      const member = group.members.find(candidate => candidate.instanceId === selectedMember)
      if (member !== undefined) return { member, busy: controller.verdictOf(member).busy }
    }
    return null
  }, [selectedMember, floor, controller])

  const uploadPromo = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    if (file === undefined || selected === undefined) return
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      const prefix = `data:${file.type};base64,`
      if (!dataUrl.startsWith(prefix)) {
        setPromoError('宣传图仅支持 PNG、JPEG、WebP 与 GIF')
        return
      }
      setPromoError(null)
      void controller.setPromoImage(selected.id, { mediaType: file.type, data: dataUrl.slice(prefix.length), name: file.name })
        .catch(() => undefined)
    })
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  if (!open) return null

  const createCompany = (): void => {
    if (form.name.trim() === '') return
    void controller.create({
      name: form.name.trim(),
      ...(form.category.trim() === '' ? {} : { category: form.category.trim() }),
      ...(form.legalRepresentative.trim() === '' ? {} : { legalRepresentative: form.legalRepresentative.trim() }),
      ...(form.address.trim() === '' ? {} : { address: form.address.trim() }),
    })
    setForm({ name: '', category: '', legalRepresentative: '', address: '' })
  }

  const assign = (): void => {
    if (mode.kind !== 'floor' || bindInstance === '') return
    void controller.assignEmployee(bindInstance as DigitalEmployeeInstanceId, mode.companyId, bindDepartment)
    setBindInstance('')
  }

  const sidePanelBody = (
    <>
      {mode.kind === 'floor' ? (
        <button
          className={css.headerButton}
          type="button"
          onClick={() => {
            void groupStore.openSession(mode.companyId).then((sessionId) => {
              openSession(sessionId)
              close()
            }).catch(() => undefined)
          }}
        >💬 公司群聊</button>
      ) : null}
      {state.error !== null ? <div className={css.errorText}>{state.error}</div> : null}
      {state.status === 'loading' && state.companies.length === 0 ? <span className={css.companyMeta}>加载中…</span> : null}

      {mode.kind === 'campus' ? (
        <>
          <span className={css.sectionTitle}>创建公司</span>
          <label className={css.field}>
            名称
            <input className={css.input} value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }) }} />
          </label>
          <label className={css.field}>
            分类
            <input className={css.input} value={form.category} placeholder="科技 / 贸易 / …" onChange={(event) => { setForm({ ...form, category: event.target.value }) }} />
          </label>
          <label className={css.field}>
            法人
            <input
              className={css.input}
              value={form.legalRepresentative}
              onChange={(event) => { setForm({ ...form, legalRepresentative: event.target.value }) }}
            />
          </label>
          <label className={css.field}>
            地址
            <input
              className={css.input}
              value={form.address}
              onChange={(event) => { setForm({ ...form, address: event.target.value }) }}
            />
          </label>
          <span className={css.sectionTitle}>公司（点击进入）</span>
          {campusCompanies.map(company => (
            <div
              key={company.id}
              className={css.companyCard}
              onClick={() => { setMode({ kind: 'floor', companyId: company.id }) }}
              onKeyDown={(event) => { if (event.key === 'Enter') setMode({ kind: 'floor', companyId: company.id }) }}
              role="button"
              tabIndex={0}
            >
              <span className={css.companyName}>{company.name}</span>
              <span className={css.companyMeta}>
                {company.category === '' ? '未分类' : company.category} · {String(company.memberCount)} 人 · 在忙 {String(company.busyCount)}
              </span>
              {company.address === '' ? null : <span className={css.companyMeta}>{company.address}</span>}
            </div>
          ))}
        </>
      ) : (
        <>
          <span className={css.sectionTitle}>公司信息</span>
          <label className={css.field}>
            名称
            <input className={css.input} value={edit.name} onChange={(event) => { setEdit({ ...edit, name: event.target.value }) }} />
          </label>
          <label className={css.field}>
            分类
            <input
              className={css.input}
              value={edit.category}
              onChange={(event) => { setEdit({ ...edit, category: event.target.value }) }}
            />
          </label>
          <label className={css.field}>
            法人
            <input
              className={css.input}
              value={edit.legalRepresentative}
              onChange={(event) => { setEdit({ ...edit, legalRepresentative: event.target.value }) }}
            />
          </label>
          <label className={css.field}>
            地址
            <input
              className={css.input}
              value={edit.address}
              onChange={(event) => { setEdit({ ...edit, address: event.target.value }) }}
            />
          </label>
          <div className={css.row}>
            <button
              className={css.headerButton}
              type="button"
              onClick={() => {
                if (edit.name.trim() === '') return
                void controller.update({
                  companyId: mode.companyId,
                  name: edit.name.trim(),
                  ...(edit.category.trim() === '' ? {} : { category: edit.category.trim() }),
                  legalRepresentative: edit.legalRepresentative.trim(),
                  address: edit.address.trim(),
                })
              }}
            >
              保存修改
            </button>
            <button
              className={css.headerButton}
              type="button"
              onClick={() => {
                if (window.confirm(`删除公司「${edit.name}」并解除全部成员绑定？`)) {
                  void controller.delete(mode.companyId)
                  setMode({ kind: 'campus' })
                }
              }}
            >
              删除公司
            </button>
          </div>
          <label className={css.field}>
            宣传图
            <input className={css.input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadPromo} />
          </label>
          {promoError !== null ? <div className={css.errorText}>{promoError}</div> : null}
          {[...promoImages.entries()].find(([id]) => id === mode.companyId)?.[1]
            ? <img className={css.promoImage} src={promoImages.get(mode.companyId)} alt="宣传图" />
            : null}

          <span className={css.sectionTitle}>公司皮肤</span>
          <div className={css.skinGrid}>
            {COMPANY_SKINS.map((skin) => {
              const active = (floor?.company.skinId ?? DEFAULT_COMPANY_SKIN.id) === skin.id
              return (
                <button
                  key={skin.id}
                  type="button"
                  className={`${css.skinCard} ${active ? css.skinCardActive : ''}`}
                  onClick={() => {
                    void controller.update({ companyId: mode.companyId, skinId: skin.id })
                      .then(() => controller.loadFloor(mode.companyId))
                      .catch(() => undefined)
                  }}
                >
                  <span className={css.skinSwatches}>
                    {skin.preview.map(color => (
                      <span key={color} className={css.skinSwatch} style={{ background: color }} />
                    ))}
                  </span>
                  <span className={css.skinLabel}>
                    {skin.label}{skin.id === DEFAULT_COMPANY_SKIN.id ? '（默认）' : ''}
                  </span>
                </button>
              )
            })}
          </div>

          <span className={css.sectionTitle}>部门</span>
          <div className={css.row}>
            <input
              className={css.input}
              value={departmentName}
              placeholder="新部门名称"
              onChange={(event) => { setDepartmentName(event.target.value) }}
            />
            <button
              className={css.headerButton}
              type="button"
              onClick={() => {
                if (departmentName.trim() === '') return
                void controller.addDepartment(mode.companyId, departmentName.trim())
                setDepartmentName('')
              }}
            >
              添加
            </button>
          </div>
          {(selected?.departments ?? []).map((department) => {
            const members = floor?.groups
              .find(group => group.department?.id === department.id)?.members ?? []
            return (
              <div key={department.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={css.departmentRow}>
                  <span className={css.departmentDot} style={{ background: department.color }} />
                  {renameDraft === department.id
                    ? (
                      <>
                        <input
                          className={css.input}
                          value={renameText}
                          onChange={(event) => { setRenameText(event.target.value) }}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' || renameText.trim() === '') return
                            void controller.renameDepartment(mode.companyId, department.id, renameText.trim())
                            setRenameDraft(null)
                          }}
                        />
                        <button className={css.headerButton} type="button" onClick={() => {
                          if (renameText.trim() === '') return
                          void controller.renameDepartment(mode.companyId, department.id, renameText.trim())
                          setRenameDraft(null)
                        }}>✓</button>
                      </>
                    )
                    : (
                      <>
                        <span style={{ flex: 1 }}>{department.name} · {String(members.length)} 人</span>
                        <button className={css.headerButton} type="button" onClick={() => { setRenameDraft(department.id); setRenameText(department.name) }}>改名</button>
                        <button className={css.headerButton} type="button" onClick={() => {
                          if (window.confirm(`删除部门「${department.name}」？成员将移入未分配。`)) {
                            void controller.deleteDepartment(mode.companyId, department.id)
                          }
                        }}>删除</button>
                      </>
                    )}
                </div>
                {members.map(member => (
                  <span key={member.instanceId} className={`${css.memberChip} ${controller.verdictOf(member).busy ? css.memberChipBusy : ''}`}>
                    <span className={css.statusDot} style={{ background: controller.verdictOf(member).busy ? '#ef4444' : '#10b981' }} />
                    {member.displayName}
                    <button
                      className={css.headerButton}
                      type="button"
                      aria-label={`解绑 ${member.displayName}`}
                      onClick={() => { void controller.unassignEmployee(member.instanceId) }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )
          })}
          {floor?.groups.some(group => group.department === null)
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className={css.departmentRow}>
                  <span className={css.departmentDot} style={{ background: '#94a3b8' }} />
                  <span style={{ flex: 1 }}>
                    未分配 · {String(floor.groups.find(group => group.department === null)?.members.length ?? 0)} 人
                  </span>
                </div>
                {floor.groups.find(group => group.department === null)?.members.map(member => (
                  <span key={member.instanceId} className={`${css.memberChip} ${controller.verdictOf(member).busy ? css.memberChipBusy : ''}`}>
                    <span className={css.statusDot} style={{ background: controller.verdictOf(member).busy ? '#ef4444' : '#10b981' }} />
                    {member.displayName}
                    <button className={css.headerButton} type="button" aria-label={`解绑 ${member.displayName}`} onClick={() => { void controller.unassignEmployee(member.instanceId) }}>×</button>
                  </span>
                ))}
              </div>
            )
            : null}

          <span className={css.sectionTitle}>绑定员工实例</span>
          <select
            className={css.input}
            value={bindDepartment === null ? '' : bindDepartment}
            onChange={(event) => { setBindDepartment(event.target.value === '' ? null : event.target.value as DepartmentId) }}
          >
            <option value="">未分配</option>
            {(selected?.departments ?? []).map(department => (
              <option key={department.id as string} value={department.id as string}>{department.name}</option>
            ))}
          </select>
          <select className={css.input} value={bindInstance} onChange={(event) => { setBindInstance(event.target.value) }}>
            <option value="">选择在职未绑定实例…</option>
            {state.candidates.map(candidate => (
              <option key={candidate.instanceId as string} value={candidate.instanceId as string}>
                {candidate.displayName}（{candidate.state === 'active' ? '在职' : '未激活'}）
              </option>
            ))}
          </select>
          <button className={`${css.headerButton} ${css.headerButtonPrimary}`} type="button" onClick={assign} disabled={bindInstance === ''}>
            绑定到{bindDepartment === null ? '未分配' : selected?.departments.find(department => department.id === bindDepartment)?.name ?? ''}
          </button>
        </>
      )}
    </>
  )

  return (
    <div className={css.shell}>
      <div className={css.header}>
        <span className={css.title}>{mode.kind === 'campus' ? '公司园区' : `${floor?.company.name ?? ''} · 公司内部`}</span>
        <span className={css.spacer} />
        {mode.kind === 'floor'
          ? <button className={css.headerButton} type="button" onClick={() => { setMode({ kind: 'campus' }); setSelectedMember(null) }}>← 返回园区</button>
          : null}
        <button className={`${css.headerButton} ${css.headerButtonPrimary}`} type="button" onClick={createCompany}>＋ 创建公司</button>
        <Button aria-label="Close" variant="ghost" onClick={close}><IconCloseOutline16 /></Button>
      </div>
      <div className={css.body}>
        <div className={css.canvasPane}>
          <canvas ref={canvasRef} className={css.canvas} />
          {memberDetail !== null
            ? (
              <div className={css.detailPanel}>
                <strong>{memberDetail.member.displayName}</strong>
                <span className={css.companyMeta}>
                  {memberDetail.busy ? '在忙' : '空闲'}
                  {memberDetail.member.busyKind === null ? '' : memberDetail.busy ? ` · ${memberDetail.member.busyKind === 'chat' ? '会话' : '自主任务'}` : ''}
                </span>
                <span className={css.companyMeta}>模板 {memberDetail.member.templateId}</span>
                <button className={css.headerButton} type="button" onClick={() => { setSelectedMember(null); openEmployeeWorkspace() }}>
                  打开员工工作区 →
                </button>
                <button className={css.headerButton} type="button" onClick={() => { setSelectedMember(null) }}>关闭</button>
              </div>
            )
            : null}
        </div>
        <div className={css.sidePanel}>
          {sidePanelBody}

        </div>
      </div>
    </div>
  )
}
