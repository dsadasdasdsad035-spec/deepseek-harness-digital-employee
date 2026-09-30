import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@qq296629801/dsh-api-remotes',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
