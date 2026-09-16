/** Package-owned action seat for group turn views; apply() wires the remote. */

/** Cancel handler installed by the package registration; a no-op until wired. */
export const groupTurnActions: { cancel: (sessionId: string) => void } = {
  cancel: () => {},
}
