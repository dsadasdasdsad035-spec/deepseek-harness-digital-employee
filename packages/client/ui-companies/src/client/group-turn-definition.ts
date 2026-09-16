/** Conversation node definition projecting a member delivery's live progress. */

import type {
  ChatConversationViewNode, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Keyed Chat payload for one in-flight or settled member delivery. */
export interface CompanyGroupTurnChatData {
  readonly displayName: string
  readonly context: string
  readonly settled: boolean
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One member delivery's typing indicator attributed to its speaker. */
    'company-group-turn': CompanyGroupTurnChatData
  }
}

interface GroupTurnState extends CompanyGroupTurnChatData {
  readonly seq: number
}

/** One member delivery rendered as a transient typing indicator Chat node. */
export const companyGroupTurnDefinition: ConversationNodeDefinition<GroupTurnState> = {
  kind: 'company-group-turn',
  target: 'chat',
  match: (event) => {
    if (event.type === 'company-group/turn-queued') {
      return { id: `company-group-turn-${String(event.seq)}`, role: 'start' }
    }
    if (event.type === 'company-group/turn-delivered') {
      return { id: `company-group-turn-${String(event.data.queueSeq)}`, role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'company-group/turn-queued') {
      throw new Error('company-group-turn start requires company-group/turn-queued')
    }
    const data = match.event.data
    return {
      seq: match.event.seq,
      displayName: data.displayName,
      context: data.context,
      settled: false,
    }
  },
  update: context => ({ ...context.state, settled: true }),
  buildViewNode: (context): ChatConversationViewNode | null => {
    const state: GroupTurnState | undefined = context.state
    if (context.start === undefined || state === undefined) return null
    // The engine forbids withdrawing a materialized node (assembler throws on
    // null-after-non-null), so a settled delivery hides its indicator in place;
    // the utterance itself arrives as its own message node.
    return {
      key: context.key,
      kind: 'company-group-turn',
      id: context.id,
      target: 'chat',
      anchorSeq: state.seq,
      location: context.start.location,
      visibility: state.settled ? 'hidden' : 'visible',
      data: {
        displayName: state.displayName,
        context: state.context,
        settled: state.settled,
      },
    }
  },
}
