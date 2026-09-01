/**
 * In-process mutex that serializes work per key without blocking other keys.
 */
export class KeyedMutex<Key> {
  private readonly entries = new Map<Key, MutexEntry>()

  /**
   * Number of keys with an active owner or queued waiter.
   *
   * @returns current lock-table size.
   */
  get pendingKeyCount(): number {
    return this.entries.size
  }

  /**
   * Run one operation after earlier operations for the same key settle.
   *
   * @param key - serialization key.
   * @param operation - work performed while the key is exclusively owned.
   * @returns the operation result.
   */
  async runExclusive<Result>(
    key: Key,
    operation: () => Result | PromiseLike<Result>,
  ): Promise<Result> {
    let entry = this.entries.get(key)
    if (entry === undefined) {
      entry = {
        tail: Promise.resolve(),
        participants: 0,
      }
      this.entries.set(key, entry)
    }

    entry.participants += 1
    const predecessor = entry.tail
    let release!: () => void
    const owned = new Promise<void>((resolve) => {
      release = resolve
    })
    entry.tail = predecessor.then(() => owned)

    await predecessor
    try {
      return await operation()
    } finally {
      release()
      entry.participants -= 1
      if (entry.participants === 0 && this.entries.get(key) === entry) {
        this.entries.delete(key)
      }
    }
  }
}

interface MutexEntry {
  tail: Promise<void>
  participants: number
}
