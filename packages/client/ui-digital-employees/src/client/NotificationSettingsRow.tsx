/**
 * Notification settings row: one entry per registered channel with its
 * credential configuration facts, plus a clearly-labeled test send through
 * the production delivery contract. The row renders nothing when the host
 * composes no notification capability.
 */

import { useCallback, useEffect, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { NotificationChannelStatus, NotificationChannelTestResult } from '@deepseek-ai/dsh-api-remotes/client'
import css from './NotificationSettingsRow.module.css'

/** Registration-side business face: channel data and the test action. */
export interface NotificationRowInjected {
  /** Describe the registered channels and their credential states. */
  describe: () => Promise<readonly NotificationChannelStatus[]>
  /** Send one labeled test message through one channel. */
  test: (channel: string) => Promise<NotificationChannelTestResult>
}

/** Full component props. */
export type NotificationSettingsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.notifications'>
  & InjectFace<NotificationRowInjected>

/**
 * Render the notification channel configuration row.
 * @param props - composed slot props.
 * @returns the row, or null when no channel is registered.
 */
export function NotificationSettingsRow({ describe, test, t }: NotificationSettingsRowProps) {
  const [channels, setChannels] = useState<readonly NotificationChannelStatus[] | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, NotificationChannelTestResult>>({})

  const refresh = useCallback(async () => {
    setChannels(await describe())
  }, [describe])
  useEffect(() => { void refresh() }, [refresh])

  if (channels === null || channels.length === 0) return null

  const run = async (channel: string): Promise<void> => {
    setTesting(channel)
    try {
      const outcome = await test(channel)
      setResults(current => ({ ...current, [channel]: outcome }))
      await refresh()
    } finally {
      setTesting(null)
    }
  }

  return (
    <section className={css.row} aria-label={t('title')}>
      <h2>{t('title')}</h2>
      <p className={css.hint}>{t('hint')}</p>
      <ul>
        {channels.map((channel) => {
          const result = results[channel.id]
          return (
            <li key={channel.id}>
              <span>{channel.id}</span>
              <span className={css.credentials}>
                {channel.credentials.map(state => (
                  <span key={state.ref} className={state.configured ? css.configured : css.unconfigured}>
                    {state.configured ? '✓' : '○'} {state.ref}
                  </span>
                ))}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={testing !== null}
                onClick={() => { void run(channel.id) }}
              >
                {testing === channel.id ? t('sending') : t('sendTest')}
              </Button>
              {result === undefined ? null : (
                <span className={result.delivered ? css.configured : css.unconfigured}>
                  {result.delivered ? t('sent') : `${t('failed')}: ${result.reason ?? ''}`}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
