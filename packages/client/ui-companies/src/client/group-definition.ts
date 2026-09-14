/** Conversation node definition projecting group messages into the chat surface. */

import type {
  ChatConversationViewNode, ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

/** Keyed Chat payload for one quoted company group message. */
export interface CompanyGroupMessageChatData {
  readonly speakerKind: 'user' | 'employee'
  readonly displayName: string
  readonly text: string
  readonly context?: string
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    /** One quoted company group message attributed to its speaker. */
    'company-group-message': CompanyGroupMessageChatData
  }
}

interface GroupMessageState extends CompanyGroupMessageChatData {
  readonly seq: number
}

/** One quoted group message rendered as one keyed Chat node. */
export const companyGroupMessageDefinition: ConversationNodeDefinition<GroupMessageState> = {
  kind: 'company-group-message',
  target: 'chat',
  match: event => event.type === 'company-group/message'
    ? { id: `company-group-message-${String(event.seq)}`, role: 'start' }
    : null,
  start: (_context, match) => {
    if (match.event.type !== 'company-group/message') {
      throw new Error('company-group-message start requires company-group/message')
    }
    const data = match.event.data
    return {
      seq: match.event.seq,
      speakerKind: data.speakerKind,
      displayName: data.displayName,
      text: data.text,
      ...data.context === undefined ? {} : { context: data.context },
    }
  },
  update: context => context.state,
  buildViewNode: (context): ChatConversationViewNode | null => {
    const state: GroupMessageState | undefined = context.state
    if (context.start === undefined || state === undefined) return null
    return {
      key: context.key,
      kind: 'company-group-message',
      id: context.id,
      target: 'chat',
      anchorSeq: state.seq,
      location: context.start.location,
      visibility: 'visible',
      data: {
        speakerKind: state.speakerKind,
        displayName: state.displayName,
        text: state.text,
        ...state.context === undefined ? {} : { context: state.context },
      },
    }
  },
}
