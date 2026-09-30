/**
 * Remote namespaces the Session cluster calls. One parameter for one concept:
 * the generated surface a Session and its manager reach the Host through.
 *
 * @module @qq296629801/dsh-client-runtime/client/sessions/remotes
 */

import type { Context } from '@qq296629801/cordis'
import type {} from '@qq296629801/dsh-api-remotes/client'

/** The generated Remote namespaces a Session and its manager call. */
export type SessionRemotes = Pick<Context['remote'], 'commands'>
