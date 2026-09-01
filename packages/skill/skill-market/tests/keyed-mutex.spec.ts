import { describe, expect, it } from 'vitest'
import { KeyedMutex } from '@deepseek-ai/dsh-marketplace-core'

interface Deferred {
  readonly promise: Promise<void>
  readonly resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('KeyedMutex', () => {
  it('serializes install, upgrade, and uninstall for the same skill name', async () => {
    const mutex = new KeyedMutex<string>()
    const releaseInstall = deferred()
    const releaseUpgrade = deferred()
    const upgradeStarted = deferred()
    const events: string[] = []

    const install = mutex.runExclusive('demo-skill', async () => {
      events.push('install:start')
      await releaseInstall.promise
      events.push('install:end')
    })
    const upgrade = mutex.runExclusive('demo-skill', async () => {
      events.push('upgrade:start')
      upgradeStarted.resolve()
      await releaseUpgrade.promise
      events.push('upgrade:end')
    })
    const uninstall = mutex.runExclusive('demo-skill', () => {
      events.push('uninstall:start')
      events.push('uninstall:end')
    })

    await Promise.resolve()
    expect(events).toEqual(['install:start'])

    releaseInstall.resolve()
    await install
    await upgradeStarted.promise
    expect(events).toEqual(['install:start', 'install:end', 'upgrade:start'])

    releaseUpgrade.resolve()
    await Promise.all([upgrade, uninstall])
    expect(events).toEqual([
      'install:start',
      'install:end',
      'upgrade:start',
      'upgrade:end',
      'uninstall:start',
      'uninstall:end',
    ])
  })

  it('allows different skill names to progress independently', async () => {
    const mutex = new KeyedMutex<string>()
    const releaseFirst = deferred()
    const events: string[] = []

    const first = mutex.runExclusive('first-skill', async () => {
      events.push('first:start')
      await releaseFirst.promise
      events.push('first:end')
    })
    const second = mutex.runExclusive('second-skill', () => {
      events.push('second:start')
      events.push('second:end')
    })

    await second
    expect(events).toEqual(['first:start', 'second:start', 'second:end'])

    releaseFirst.resolve()
    await first
  })

  it('removes a key after its final owner and waiter settle', async () => {
    const mutex = new KeyedMutex<string>()
    const releaseOwner = deferred()

    const owner = mutex.runExclusive('demo-skill', () => releaseOwner.promise)
    const waiter = mutex.runExclusive('demo-skill', () => undefined)

    await Promise.resolve()
    expect(mutex.pendingKeyCount).toBe(1)

    releaseOwner.resolve()
    await Promise.all([owner, waiter])
    expect(mutex.pendingKeyCount).toBe(0)
  })
})
