/** Accessible settings surface for marketplace-managed skills. */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, ReactNode } from 'react'
import {
  Button, IconCloseOutline16, IconSearchOutline16, IconTrashOutline16, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillMarketEntry, SkillMarketSkillId } from '@deepseek-ai/dsh-api-remotes/client'
import { filterSkills, MAX_UPLOAD_BYTES } from './store.ts'
import type { SkillMarketStore } from './store.ts'
import type { SkillMarketKey } from './locales.ts'
import css from './SkillMarketSection.module.css'

export interface SkillMarketSectionInjected {
  controller: SkillMarketStore
  hooks: { snapshot: SkillMarketStore['store'] }
  t: (key: SkillMarketKey) => string
}

export type SkillMarketSectionProps = Partial<InjectFace<SkillMarketSectionInjected>>
type SkillMarketFace = InjectFace<SkillMarketSectionInjected>

/** Public Vite asset containing the verified marketplace example package. */
export const TEMPLATE_ARCHIVE_URL = '/skill-market-template.zip'
/** Filename proposed by browsers when saving {@link TEMPLATE_ARCHIVE_URL}. */
export const TEMPLATE_ARCHIVE_FILENAME = 'skill-market-template.zip'

interface UploaderProps {
  readonly uploading: boolean
  readonly error: string | null
  readonly t: (key: SkillMarketKey) => string
  readonly onPickFile: (file: File) => void
}

function Uploader({ uploading, error, t, onPickFile }: UploaderProps): ReactNode {
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
      aria-describedby="skill-market-upload-hint"
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
      <strong className={css.dropzoneTitle}>{t('uploadTitle')}</strong>
      <span id="skill-market-upload-hint" className={css.muted}>
        {t('uploadHint')} ({String(MAX_UPLOAD_BYTES / 1024 / 1024)} MiB)
      </span>
      <span className={css.uploadCommand}>{uploading ? t('installing') : t('uploadButton')}</span>
      <a
        className={css.templateDownload}
        href={TEMPLATE_ARCHIVE_URL}
        download={TEMPLATE_ARCHIVE_FILENAME}
        onClick={(event) => { event.stopPropagation() }}
      >
        {t('templateDownload')}
      </a>
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
  const { controller, useSnapshot, t } = props
  if (controller === undefined || useSnapshot === undefined || t === undefined) return null
  return <Loaded injected={{ controller, useSnapshot, t }} />
}

function Loaded({ injected: { controller, useSnapshot, t } }: { injected: SkillMarketFace }): ReactNode {
  const state = useSnapshot(value => value)
  useEffect(() => {
    if (state.status === 'idle') void controller.load()
  }, [controller, state.status])
  const skills = useMemo(() => filterSkills(state.skills, state.query), [state.query, state.skills])
  const upgrade = state.pendingUpgrade
  return (
    <section className={css.section} aria-labelledby="skill-market-title">
      <header className={css.header}>
        <div>
          <h2 id="skill-market-title" className={css.title}>{t('title')}</h2>
          <p className={css.intro}>{t('intro')}</p>
        </div>
      </header>
      <Uploader
        uploading={state.uploading}
        error={state.uploadError === null ? null : t(state.uploadError)}
        t={t}
        onPickFile={(file) => { void controller.upload(file) }}
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
    </section>
  )
}

export const __testing = { Uploader, SkillCard, Loaded }
