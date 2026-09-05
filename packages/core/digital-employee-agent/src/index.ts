/**
 * Digital employee composition for existing Agent extension points.
 * @module @deepseek-ai/dsh-digital-employee-agent
 */

import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type {
  DigitalEmployeeAuthority,
  DigitalEmployeeCompositionId,
  DigitalEmployeeDelegationPolicy,
  DigitalEmployeeExpert,
  DigitalEmployeeInstanceId,
  DigitalEmployeeInstructionSource,
  DigitalEmployeeMemoryCandidate,
  DigitalEmployeeMemoryDecision,
  DigitalEmployeeMemoryRecord,
  DigitalEmployeeMemoryProjectionEvent,
  DigitalEmployeeMemoryQuery,
  DigitalEmployeeMcpServer,
  ExpertId,
  ResolvedDigitalEmployee,
} from '@deepseek-ai/dsh-digital-employee'
import { createDigitalEmployeeCompositionId } from '@deepseek-ai/dsh-digital-employee'
import type {
  Agent,
  AgentHandle,
  AgentOptions,
  CreateAgentOptions,
  ModelSelection,
} from '@deepseek-ai/dsh-agent'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {
  ContinuableStart,
  SubagentDescendantListEntry,
  SubagentFollowupOptions,
  SubagentInterruptAuthority,
  SubagentResult,
  SubagentRun,
  SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { McpServerConfig } from '@deepseek-ai/dsh-mcp-client'
import type { PostToolDecision, PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-mcp-client'
import { mountEmployeeHooks } from '@deepseek-ai/dsh-hooks-market'

declare module '@deepseek-ai/cordis' {
  interface Context {
    digitalEmployeeAgent: DigitalEmployeeAgent
  }
}

const IDENTITY_SECTION = 'digital-employee:identity'
const PERSONALITY_SECTION = 'digital-employee:personality'
const INSTRUCTIONS_SECTION = 'digital-employee:instructions'
const MEMORY_SECTION = 'digital-employee:memory'
const EXPERT_COMPOSITION_KEY = 'digitalEmployeeExpert'
const EXPERT_TOOL_NAME = 'delegate_to_expert'

interface DigitalEmployeeExpertComposition {
  readonly employeeId: string
  readonly expertId: string
  readonly mcpServerIds: readonly string[]
  readonly memoryProjection?: Record<string, unknown>
}

/** Input for creating one root task Agent owned by a digital employee. */
export interface CreateDigitalEmployeeTaskRequest {
  /** Active employee to resolve before Session creation. */
  readonly employeeId: DigitalEmployeeInstanceId
  /** Shared root Agent and Session identity. */
  readonly sessionId: SessionId
  /** Optional durable root Session metadata; the resolved preset always wins. */
  readonly meta?: CreateAgentOptions['meta']
  /** Optional model and loop configuration for the root Agent. */
  readonly agentOptions?: AgentOptions
  /** Optional complete model selection installed for prompt assembly and request routing. */
  readonly modelSelection?: ModelSelection
  /** Optional first message admitted into the unpublished Agent inbox. */
  readonly initialMessage?: UserMessage
  /** Optional bounded employee-memory retrieval performed before Session creation. */
  readonly memory?: Omit<DigitalEmployeeMemoryQuery, 'employeeId'>
  /** Optional cancellation for resolution and unpublished Agent setup. */
  readonly signal?: AbortSignal
}

/** Input for a short-lived composition preview that never resolves employee memory. */
export interface CreateDigitalEmployeePreviewTaskRequest {
  /** Synthetic resolved employee constructed from a validated unpublished template draft. */
  readonly employee: ResolvedDigitalEmployee
  /** Shared preview Agent and Session identity. */
  readonly sessionId: SessionId
  /** Absolute local workspace path available to the preview. */
  readonly workspacePath: string
  /** Optional model and loop configuration for the preview Agent. */
  readonly agentOptions?: AgentOptions
  /** Optional complete model selection installed for prompt assembly and request routing. */
  readonly modelSelection?: ModelSelection
}

/** Input for resolving one authorized template expert before delegation. */
export interface ResolveDigitalEmployeeExpertRequest {
  /** Active employee whose expert catalog owns the requested expert. */
  readonly employeeId: DigitalEmployeeInstanceId
  /** Stable expert identity enabled for the resolved employee. */
  readonly expertId: ExpertId
  /** Optional bounded retrieval projected only from expert-authorized scopes. */
  readonly memory?: {
    readonly text: string
    readonly limit: number
  }
}

/** Named composition ready to pass through the existing subagent runtime. */
export interface ResolvedDigitalEmployeeExpert {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly id: ExpertId
  readonly label: string
  readonly responsibility: string
  readonly persona: string
  readonly instructionRevision: string
  readonly agentOptions: AgentOptions
  readonly employeeAuthority: DigitalEmployeeAuthority
  readonly employeeDelegation: DigitalEmployeeDelegationPolicy
  readonly capabilities: DigitalEmployeeAuthority
  readonly memoryProjection?: DigitalEmployeeMemoryProjectionEvent
  readonly delegation: DigitalEmployeeDelegationPolicy & {
    readonly mode: 'one-shot' | 'continuable'
  }
}

/** Effective authority and scheduling state inherited by a delegating Agent. */
export interface DigitalEmployeeParentAuthority {
  readonly capabilities: DigitalEmployeeAuthority
  readonly delegation: DigitalEmployeeDelegationPolicy
  readonly depth: number
  readonly activeDelegations: number
}

/** Input for delegating one task to a resolved employee expert. */
export interface DelegateToDigitalEmployeeExpertRequest {
  readonly employeeId: DigitalEmployeeInstanceId
  readonly expertId: ExpertId
  /** Existing subagent provider selected by the owning deployment. */
  readonly provider: string
  readonly parent: Agent
  readonly parentAuthority: DigitalEmployeeParentAuthority
  readonly prompt: SubagentStartRequest['prompt']
  readonly signal: AbortSignal
  readonly memory?: ResolveDigitalEmployeeExpertRequest['memory']
}

/** Published one-shot run or accepted continuable child for one expert delegation. */
export type DigitalEmployeeExpertDelegation =
  | {
    readonly mode: 'one-shot'
    readonly expert: ResolvedDigitalEmployeeExpert
    readonly authority: DigitalEmployeeAuthority
    readonly delegation: DigitalEmployeeDelegationPolicy
    readonly run: SubagentRun
  }
  | {
    readonly mode: 'continuable'
    readonly expert: ResolvedDigitalEmployeeExpert
    readonly authority: DigitalEmployeeAuthority
    readonly delegation: DigitalEmployeeDelegationPolicy
    readonly childId: ContinuableStart['childId']
    readonly messageId: ContinuableStart['messageId']
  }

/** Composes a resolved employee through preset and system-prompt extensions. */
export class DigitalEmployeeAgent extends Service {
  static inject = ['agentPresets', 'agents', 'digitalEmployees', 'skills', 'subagents', 'systemPrompt', 'tools']
  private readonly rootHandles = new Map<DigitalEmployeeInstanceId, Set<AgentHandle>>()
  private readonly previewMemories = new Map<SessionId, DigitalEmployeeMemoryRecord[]>()

  constructor(ctx: Context) {
    super(ctx, 'digitalEmployeeAgent')
    ctx.on('subagent/compose', async (childCtx, data) => {
      const raw = data[EXPERT_COMPOSITION_KEY]
      if (raw === undefined) return
      const composition = parseExpertComposition(raw)
      await this.composeExpertMcp(childCtx, composition)
    })
    ctx.on('digital-employees/before-delete', async (employeeId) => {
      const handles = [...(this.rootHandles.get(employeeId) ?? [])]
      await this.ctx.subagents.drainContinuableDescendants(handles.map(handle => handle.agent))
      await Promise.all(handles.map(handle => handle.dispose()))
    })
    ctx.on('session/disposed', (session) => {
      this.previewMemories.delete(session.id)
    })
  }

  /**
   * Resolve an active employee, then create its fully composed root Agent.
   * @param request - employee identity plus root Agent creation options.
   * @param resolvedEmployee - exact Host-authorized composition, when already resolved.
   * @returns the published Agent handle.
   */
  async createTask(
    request: CreateDigitalEmployeeTaskRequest,
    resolvedEmployee?: ResolvedDigitalEmployee,
  ): Promise<AgentHandle> {
    const employee = resolvedEmployee ?? await this.ctx.digitalEmployees.resolve(request.employeeId)
    if (employee.instance.id !== request.employeeId) {
      throw new Error(
        `resolved digital employee "${employee.instance.id}" does not match requested employee `
        + `"${request.employeeId}"`,
      )
    }
    const mcpServers = await this.resolveMcpServers(employee, request.sessionId)
    const memoryProjection = request.memory === undefined
      ? undefined
      : projectMemory(await this.ctx.digitalEmployees.queryMemory({
        employeeId: employee.instance.id,
        ...request.memory,
      }))
    const agentOptions = request.modelSelection === undefined
      ? request.agentOptions
      : {
        ...request.agentOptions,
        provider: request.modelSelection.provider,
        model: request.modelSelection.model,
      }
    const handle = await this.ctx.agents.create({
      sessionId: request.sessionId,
      meta: {
        ...request.meta,
        agentPreset: employee.template.preset,
      },
      ...agentOptions === undefined ? {} : { agentOptions },
      ...request.initialMessage === undefined ? {} : { initialMessages: [request.initialMessage] },
      ...request.signal === undefined ? {} : { signal: request.signal },
      setup: async (agentCtx) => {
        const agent = agentCtx.agent
        if (agent === undefined) {
          throw new Error('digital employee task setup has no scoped Agent')
        }
        if (request.modelSelection !== undefined) {
          installModelSelection(agentCtx, {
            current: request.modelSelection,
            assembled: undefined,
          })
        }
        agent.session.append('digital-employee/identity', {
          employeeId: employee.instance.id,
          displayName: employee.instance.displayName,
          templateId: employee.template.id,
          templateVersion: employee.template.version,
          compositionId: digitalEmployeeCompositionId(employee),
          personality: employee.personality,
        })
        agent.session.append('digital-employee/instructions', {
          revision: employee.instructions.revision,
        })
        if (memoryProjection !== undefined) {
          agent.session.append('digital-employee/memory-projection', memoryProjection)
        }
        await this.compose(agentCtx, employee, memoryProjection, mcpServers)
      },
    })
    return this.trackRootHandle(employee.instance.id, handle)
  }

  /**
   * Create a temporary, non-persisted preview Agent from a validated synthetic employee.
   * @param request - isolated composition, Session identity, and workspace context.
   * @returns an owned handle whose disposer terminates the preview and its scoped resources.
   */
  async createPreviewTask(request: CreateDigitalEmployeePreviewTaskRequest): Promise<AgentHandle> {
    const mcpServers = await this.resolveMcpServers(request.employee, request.sessionId)
    const agentOptions = request.modelSelection === undefined
      ? request.agentOptions
      : {
        ...request.agentOptions,
        provider: request.modelSelection.provider,
        model: request.modelSelection.model,
      }
    return await this.ctx.agents.create({
      sessionId: request.sessionId,
      meta: {
        cwd: request.workspacePath,
        agentPreset: request.employee.template.preset,
        preview: true,
      },
      ...agentOptions === undefined ? {} : { agentOptions },
      setup: async (agentCtx) => {
        const agent = agentCtx.agent
        if (agent === undefined) throw new Error('digital employee preview setup has no scoped Agent')
        if (request.modelSelection !== undefined) {
          installModelSelection(agentCtx, { current: request.modelSelection, assembled: undefined })
        }
        agent.session.append('digital-employee/identity', {
          employeeId: request.employee.instance.id,
          displayName: request.employee.instance.displayName,
          templateId: request.employee.template.id,
          templateVersion: request.employee.template.version,
          compositionId: digitalEmployeeCompositionId(request.employee),
          personality: request.employee.personality,
        })
        agent.session.append('digital-employee/instructions', {
          revision: request.employee.instructions.revision,
        })
        await this.compose(agentCtx, request.employee, undefined, mcpServers, false)
      },
    })
  }

  /**
   * Resolve one enabled expert into a named composition without creating a child Session.
   * @param request - employee, expert, and optional bounded memory request.
   * @returns complete expert composition for the existing subagent runtime.
   */
  async resolveExpert(
    request: ResolveDigitalEmployeeExpertRequest,
  ): Promise<ResolvedDigitalEmployeeExpert> {
    const employee = await this.ctx.digitalEmployees.resolve(request.employeeId)
    const expert = employee.experts.find(candidate => candidate.id === request.expertId)
    if (expert === undefined) {
      throw new Error(
        `digital employee "${employee.instance.id}" does not authorize expert "${request.expertId}"`,
      )
    }
    const memoryProjection = request.memory === undefined
      ? undefined
      : projectMemory(await this.ctx.digitalEmployees.queryMemory({
        employeeId: employee.instance.id,
        text: request.memory.text,
        scopes: expert.memoryAccess,
        limit: request.memory.limit,
      }))
    return {
      employeeId: employee.instance.id,
      id: expert.id,
      label: expert.name,
      responsibility: expert.responsibility,
      persona: await readInstructionSource(
        expert.instructions,
        `digital employee "${employee.instance.id}" expert "${expert.id}"`,
      ),
      instructionRevision: expert.instructions.revision,
      agentOptions: { ...expert.modelSettings },
      employeeAuthority: copyAuthority(employee.authority),
      employeeDelegation: { ...employee.delegation },
      capabilities: copyAuthority(expert.capabilities),
      ...(memoryProjection === undefined ? {} : { memoryProjection }),
      delegation: { ...expert.delegation },
    }
  }

  /**
   * Delegate one task through the existing one-shot or continuable subagent path.
   * @param request - expert identity, provider route, parent, prompt, and cancellation.
   * @returns the published run or accepted durable child identity.
   */
  async delegateToExpert(
    request: DelegateToDigitalEmployeeExpertRequest,
  ): Promise<DigitalEmployeeExpertDelegation> {
    const expert = await this.resolveExpert({
      employeeId: request.employeeId,
      expertId: request.expertId,
      ...(request.memory === undefined ? {} : { memory: request.memory }),
    })
    let effective: ReturnType<typeof resolveChildAuthority>
    try {
      effective = resolveChildAuthority(expert, request.parentAuthority)
    } catch (error: unknown) {
      request.parent.session.append('digital-employee/expert-authorization-denied', {
        employeeId: expert.employeeId,
        expertId: expert.id,
        reason: errorMessage(error),
      })
      throw error
    }
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(effective.delegation.timeoutMs),
    ])
    const childRequest = {
      prompt: request.prompt,
      parent: request.parent,
      agentOptions: expert.agentOptions,
      maxDepth: effective.delegation.maxDepth,
      persona: expert.persona,
      toolFilter: { allow: effective.capabilities.tools },
      composition: {
        [EXPERT_COMPOSITION_KEY]: {
          employeeId: expert.employeeId,
          expertId: expert.id,
          mcpServerIds: [...effective.capabilities.mcpServers],
          ...(expert.memoryProjection === undefined
            ? {}
            : { memoryProjection: JSON.parse(JSON.stringify(expert.memoryProjection)) as Record<string, unknown> }),
        },
      } as unknown as Record<string, import('@deepseek-ai/dsh-session').JsonValue>,
    } satisfies Omit<SubagentStartRequest, 'label' | 'signal'>
    if (expert.delegation.mode === 'one-shot') {
      const run = await this.ctx.subagents.start(request.provider, {
        label: expert.label,
        ...childRequest,
        signal,
      })
      appendExpertDelegation(request, expert, effective, run.id)
      void run.result.then(
        (result) => {
          request.parent.session.append('digital-employee/expert-result', {
            employeeId: expert.employeeId,
            expertId: expert.id,
            childSessionId: run.id,
            output: result.output,
            stopReason: result.stopReason,
            ...(result.diagnostic === undefined ? {} : { diagnostic: result.diagnostic }),
          })
        },
        () => {
          // Infrastructure rejection has no provider-authored terminal result to persist.
        },
      )
      return {
        mode: 'one-shot',
        expert,
        authority: effective.capabilities,
        delegation: effective.delegation,
        run,
      }
    }
    const child = await this.ctx.subagents.startContinuable({
      provider: request.provider,
      label: expert.label,
      request: childRequest,
      signal,
    })
    appendExpertDelegation(request, expert, effective, child.childId)
    return {
      mode: 'continuable',
      expert,
      authority: effective.capabilities,
      delegation: effective.delegation,
      childId: child.childId,
      messageId: child.messageId,
    }
  }

  /**
   * Submit a long-term memory candidate and record its exact policy decision.
   * @param parent - owning live employee or expert Agent.
   * @param candidate - structured employee-owned memory candidate.
   * @returns provider-authored acceptance or rejection.
   */
  async promoteMemory(
    parent: Agent,
    candidate: DigitalEmployeeMemoryCandidate,
  ): Promise<DigitalEmployeeMemoryDecision> {
    if (parent.session.header?.preview === true) {
      const memory: DigitalEmployeeMemoryRecord = {
        id: `preview-memory-${randomUUID()}` as never,
        employeeId: candidate.employeeId,
        scope: 'long-term',
        content: candidate.content,
        tags: [...candidate.tags],
        sensitive: candidate.sensitive,
        ...(candidate.retentionDays === undefined
          ? {}
          : { expiresAt: new Date(Date.now() + candidate.retentionDays * 86_400_000).toISOString() }),
        provenance: { ...candidate.provenance },
      }
      const records = this.previewMemories.get(parent.session.id) ?? []
      records.push(memory)
      this.previewMemories.set(parent.session.id, records)
      const decision: DigitalEmployeeMemoryDecision = { kind: 'accepted', memory }
      parent.session.append('digital-employee/memory-decision', {
        employeeId: candidate.employeeId,
        candidate: copyMemoryCandidate(candidate),
        decision: { kind: 'accepted', memoryId: memory.id },
      })
      return decision
    }
    const decision = await this.ctx.digitalEmployees.promoteMemory(candidate)
    parent.session.append('digital-employee/memory-decision', {
      employeeId: candidate.employeeId,
      candidate: copyMemoryCandidate(candidate),
      decision: decision.kind === 'accepted'
        ? { kind: 'accepted', memoryId: decision.memory.id }
        : { kind: 'rejected', reason: decision.reason },
    })
    return decision
  }

  /**
   * List experts enabled by one active employee's resolved authorization.
   * @param employeeId - active employee whose catalog is requested.
   * @returns authorized template expert descriptors.
   */
  async listExperts(employeeId: DigitalEmployeeInstanceId): Promise<readonly DigitalEmployeeExpert[]> {
    const employee = await this.ctx.digitalEmployees.resolve(employeeId)
    return employee.experts
  }

  /**
   * Deliver a later turn to an existing continuable expert child.
   * @param parent - exact live direct parent.
   * @param childId - durable expert child Session.
   * @param content - user-role content for the next turn.
   * @param options - attribution and pre-acceptance cancellation.
   * @returns accepted inbox message identity.
   */
  followupExpert(
    parent: Agent,
    childId: SessionId,
    content: SubagentStartRequest['prompt'],
    options: SubagentFollowupOptions,
  ): ReturnType<Context['subagents']['followup']> {
    return this.ctx.subagents.followup(parent, childId, content, options)
  }

  /**
   * Interrupt one live continuable expert child through existing subtree cancellation.
   * @param childId - durable expert child Session.
   * @param authority - human parent address or exact live ancestor.
   */
  interruptExpert(childId: SessionId, authority: SubagentInterruptAuthority): void {
    this.ctx.subagents.interrupt(childId, authority)
  }

  /**
   * List the complete existing subagent subtree below an employee or expert Session.
   * @param rootSessionId - root Session whose descendants are requested.
   * @param signal - optional cancellation for persistence reads.
   * @returns stable pre-order descendant entries.
   */
  listExpertTree(
    rootSessionId: SessionId,
    signal?: AbortSignal,
  ): Promise<SubagentDescendantListEntry[]> {
    return this.ctx.subagents.listDescendants(rootSessionId, signal)
  }

  /**
   * Await the existing one-shot run's terminal result.
   * @param run - published one-shot subagent run.
   * @returns provider-authored terminal result.
   */
  expertResult(run: SubagentRun): Promise<SubagentResult> {
    return run.result
  }

  private trackRootHandle(employeeId: DigitalEmployeeInstanceId, handle: AgentHandle): AgentHandle {
    let handles = this.rootHandles.get(employeeId)
    if (handles === undefined) {
      handles = new Set()
      this.rootHandles.set(employeeId, handles)
    }
    const dispose = handle.dispose.bind(handle)
    let disposing: Promise<void> | undefined
    handle.dispose = () => {
      disposing ??= dispose().finally(() => {
        handles.delete(handle)
        if (handles.size === 0) this.rootHandles.delete(employeeId)
      })
      return disposing
    }
    handles.add(handle)
    return handle
  }

  /**
   * Mount the resolved preset and employee-specific prompt sections in one Agent scope.
   * @param agentCtx - unpublished scoped Agent context.
   * @param employee - complete employee resolution produced before Session creation.
   * @param memoryProjection - exact memory records rendered into this Agent's prompt.
   * @param mcpServers - pre-resolved MCP configurations, or `undefined` to resolve them now.
   * @param installAudit - whether this composition appends durable employee audit records.
   */
  async compose(
    agentCtx: Context,
    employee: ResolvedDigitalEmployee,
    memoryProjection?: DigitalEmployeeMemoryProjectionEvent,
    mcpServers?: readonly McpServerConfig[],
    installAudit: boolean = true,
  ): Promise<void> {
    const instructions = await readInstructions(employee)
    await this.ctx.agentPresets.mount(agentCtx, employee.template.preset)
    const skills = agentCtx.get('skills')
    const tools = agentCtx.get('tools')
    if (skills === undefined || tools === undefined) {
      throw new Error('digital employee Agent composition requires skills and tools in the Agent scope')
    }
    this.mountExpertDelegationTool(agentCtx, employee)
    skills.restrict({ allow: employee.authority.skills })
    tools.restrict({ allow: employee.authority.tools })
    const resolvedMcpServers = mcpServers ?? (employee.mcpServers.length === 0
      ? []
      : await this.resolveMcpServers(employee, requireMcpSessionId(agentCtx)))
    for (const config of resolvedMcpServers) {
      const mcpClients = this.ctx.get('mcpClients')
      if (mcpClients === undefined) {
        throw new Error('digital employee MCP composition requires the mcpClients manager')
      }
      await mcpClients.mount(agentCtx, config)
    }
    await this.mountEmployeeHooks(agentCtx, employee)
    if (installAudit) this.installAudit(agentCtx, employee, resolvedMcpServers)
    const systemPrompt = agentCtx.get('systemPrompt')
    if (systemPrompt === undefined) {
      throw new Error('digital employee Agent composition requires systemPrompt in the Agent scope')
    }
    systemPrompt.section({
      name: IDENTITY_SECTION,
      order: 10,
      text: renderIdentity(employee),
    })
    systemPrompt.section({
      name: PERSONALITY_SECTION,
      order: 20,
      text: renderPersonality(employee),
    })
    systemPrompt.section({
      name: INSTRUCTIONS_SECTION,
      order: 30,
      text: [
        `Digital employee instructions (revision ${employee.instructions.revision})`,
        instructions,
      ].join('\n'),
    })
    if (memoryProjection !== undefined && memoryProjection.memories.length > 0) {
      systemPrompt.section({
        name: MEMORY_SECTION,
        order: 40,
        text: renderMemory(memoryProjection),
      })
    }
  }

  /**
   * Resolve this employee's hook package references against installed packages
   * and mount the bridge: passive interception handlers plus invocable tools.
   * Unresolved references fail composition before any Session exists.
   * @param agentCtx - Agent scope context receiving the bridge handlers.
   * @param employee - resolved employee carrying the hook references.
   */
  private async mountEmployeeHooks(agentCtx: Context, employee: ResolvedDigitalEmployee): Promise<void> {
    const hookRefs = employee.hooks ?? employee.template.hooks ?? []
    if (hookRefs.length === 0) return
    const market = this.ctx.get('hookMarket')
    if (market === undefined) {
      throw new Error('digital employee hook composition requires the hooks-market gateway')
    }
    const installed = await market.installedPackages()
    const byId = new Map(installed.map(pkg => [pkg.packageId, pkg]))
    const unresolved = hookRefs.filter(ref => !byId.has(ref))
    if (unresolved.length > 0) {
      throw new Error(`digital employee hook references are unresolved: ${unresolved.join(', ')}`)
    }
    const bindings = hookRefs
      .map(ref => byId.get(ref))
      .filter((pkg): pkg is NonNullable<ReturnType<typeof byId.get>> => pkg !== undefined)
      .flatMap(pkg => pkg.descriptor.hooks.map(hook => ({ pkg, hook })))
    const dispose = mountEmployeeHooks(agentCtx, bindings)
    agentCtx.effect(() => dispose, 'hooks-market.employee-bindings')
  }

  private mountExpertDelegationTool(
    agentCtx: Context,
    employee: ResolvedDigitalEmployee,
  ): void {
    if (employee.experts.length === 0) return
    const scopedTools = agentCtx.get('tools')
    const subagents = this.ctx.subagents
    const providerName = subagents.list().includes('spawn') ? 'spawn' : subagents.list()[0] ?? 'spawn'
    const expertNames = employee.experts.map(expert => `${expert.id}: ${expert.name}`).join(', ')
    scopedTools?.register(defineTool({
      name: EXPERT_TOOL_NAME,
      description: `Delegate a task to an authorized digital employee expert. Available experts: ${expertNames}`,
      parameters: {
        expert_id: {
          type: 'string',
          required: true,
          description: 'The exact authorized expert id.',
        },
        prompt: {
          type: 'string',
          required: true,
          description: 'A non-empty task for the selected expert.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      isConcurrencySafe: () => true,
      execute: async (args, exec) => {
        if (exec.agent === undefined) {
          throw new Error('delegate_to_expert requires a calling agent')
        }
        const result = await this.delegateToExpert({
          employeeId: employee.instance.id,
          expertId: args.expert_id as ExpertId,
          provider: providerName,
          parent: exec.agent,
          parentAuthority: {
            capabilities: employee.authority,
            delegation: employee.delegation,
            depth: 0,
            activeDelegations: 0,
          },
          prompt: [{ type: 'text', text: args.prompt }] as ContentBlock[],
          signal: exec.signal,
        })
        if (result.mode === 'continuable') {
          return `started expert ${result.expert.id} (${result.childId})`
        }
        const output = result.run.result
        const settled = await output
        return settled.output
          .filter((block): block is { type: 'text'; text: string } =>
            typeof block === 'object' && block !== null && !Array.isArray(block)
            && block.type === 'text' && typeof block.text === 'string')
          .map(block => block.text)
          .join('')
      },
    }))
  }

  private async resolveMcpServers(
    employee: ResolvedDigitalEmployee,
    sessionId: SessionId,
  ): Promise<readonly McpServerConfig[]> {
    return await Promise.all(employee.mcpServers.map(async server => await resolveMcpServer(
      this.ctx,
      employee.instance.id,
      sessionId,
      server,
    )))
  }

  private async composeExpertMcp(
    childCtx: Context,
    composition: DigitalEmployeeExpertComposition,
  ): Promise<void> {
    const employeeId = composition.employeeId as DigitalEmployeeInstanceId
    const expertId = composition.expertId as ExpertId
    const employee = await this.ctx.digitalEmployees.resolve(employeeId)
    const expert = employee.experts.find(candidate => candidate.id === expertId)
    if (expert === undefined) {
      throw new Error(
        `digital employee "${employeeId}" does not authorize expert "${expertId}"`,
      )
    }
    const skills = childCtx.get('skills')
    const tools = childCtx.get('tools')
    if (skills === undefined || tools === undefined) {
      throw new Error('digital employee expert composition requires skills and tools in the Agent scope')
    }
    skills.restrict({
      allow: expert.capabilities.skills.filter(skill => employee.authority.skills.includes(skill)),
    })
    tools.restrict({
      allow: expert.capabilities.tools.filter(tool => employee.authority.tools.includes(tool)),
    })
    const authorized = new Set(expert.capabilities.mcpServers)
    const unauthorized = composition.mcpServerIds.find(id =>
      !authorized.has(id) || !employee.authority.mcpServers.includes(id))
    if (unauthorized !== undefined) {
      throw new Error(
        `digital employee "${employeeId}" expert "${expertId}" does not authorize MCP server "${unauthorized}"`,
      )
    }
    const requested = new Set(composition.mcpServerIds)
    const declarations = employee.mcpServers.filter(server => requested.has(server.id))
    const missing = composition.mcpServerIds.find(id =>
      !declarations.some(server => server.id === id))
    if (missing !== undefined) {
      throw new Error(
        `digital employee "${employeeId}" expert "${expertId}" requires unavailable MCP server "${missing}"`,
      )
    }
    const resolvedMcpServers = declarations.length === 0
      ? []
      : await Promise.all(declarations.map(server => resolveMcpServer(
        this.ctx,
        employeeId,
        requireMcpSessionId(childCtx),
        server,
      )))
    const mcpClients = this.ctx.get('mcpClients')
    if (resolvedMcpServers.length > 0 && mcpClients === undefined) {
      throw new Error('digital employee MCP composition requires the mcpClients manager')
    }
    if (mcpClients !== undefined) {
      for (const config of resolvedMcpServers) {
        await mcpClients.mount(childCtx, config)
      }
    }
    const systemPrompt = childCtx.get('systemPrompt')
    if (systemPrompt === undefined) {
      throw new Error('digital employee expert composition requires systemPrompt in the Agent scope')
    }
    const instructions = await readInstructionSource(
      expert.instructions,
      `digital employee "${employeeId}" expert "${expertId}"`,
    )
    systemPrompt.section({
      name: `${INSTRUCTIONS_SECTION}:expert`,
      order: 31,
      text: [
        `Digital employee expert instructions (revision ${expert.instructions.revision})`,
        instructions,
      ].join('\n'),
    })
    const memoryProjection = composition.memoryProjection as unknown as DigitalEmployeeMemoryProjectionEvent | undefined
    if (memoryProjection !== undefined && memoryProjection.memories.length > 0) {
      systemPrompt.section({
        name: `${MEMORY_SECTION}:expert`,
        order: 41,
        text: renderMemory(memoryProjection),
      })
    }
    this.installAudit(childCtx, {
      ...employee,
      authority: {
        ...employee.authority,
        skills: expert.capabilities.skills,
        tools: expert.capabilities.tools,
        mcpServers: [...composition.mcpServerIds],
        experts: expert.capabilities.experts,
        allowSubagents: expert.capabilities.allowSubagents,
      },
      mcpServers: declarations,
    }, resolvedMcpServers)
  }

  private installAudit(
    agentCtx: Context,
    employee: ResolvedDigitalEmployee,
    mcpServers: readonly McpServerConfig[],
  ): void {
    const agent = agentCtx.get('agent')
    if (agent === undefined) return
    const mcpIds = new Map(mcpServers.map((server, index) => [
      server.serverName,
      employee.mcpServers[index]?.id ?? server.serverName,
    ]))
    void this.ctx.digitalEmployees.appendAudit({
      employeeId: employee.instance.id,
      sessionId: agent.session.id,
      agentId: agent.id,
      category: 'capability',
      action: 'capabilities.configured',
      outcome: 'succeeded',
      metadata: {
        skillCount: employee.authority.skills.length,
        toolCount: employee.authority.tools.length,
        mcpServerCount: employee.authority.mcpServers.length,
        expertCount: employee.authority.experts.length,
        allowSubagents: employee.authority.allowSubagents,
      },
    }).catch((error: unknown) => {
      this.ctx.logger.error(error)
    })
    agentCtx.on('skill/selected', (selection) => {
      if (selection.sessionId !== agent.session.id || selection.agentId !== agent.id) return
      void this.ctx.digitalEmployees.appendAudit({
        employeeId: employee.instance.id,
        sessionId: agent.session.id,
        agentId: agent.id,
        category: 'capability',
        action: 'skill.selected',
        outcome: 'succeeded',
        metadata: {
          skill: selection.name,
          provider: selection.provider,
          source: selection.source,
          channel: selection.channel,
        },
      }).catch((error: unknown) => {
        this.ctx.logger.error(error)
      })
    })
    agentCtx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      const decision = await next()
      if (decision.kind !== 'allow') {
        await this.appendToolAudit(employee, exec, 'denied', decision.kind, mcpIds)
      }
      return decision
    })
    agentCtx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
      const decision = await next()
      await this.appendToolAudit(
        employee,
        exec,
        result.isError || decision.kind === 'block' ? 'failed' : 'succeeded',
        decision.kind,
        mcpIds,
      )
      return decision
    })
  }

  private async appendToolAudit(
    employee: ResolvedDigitalEmployee,
    exec: ToolExecution,
    outcome: 'succeeded' | 'denied' | 'failed',
    decision: string,
    mcpIds: ReadonlyMap<string, string>,
  ): Promise<void> {
    const mcp = parseMcpToolName(exec.name, mcpIds)
    await this.ctx.digitalEmployees.appendAudit({
      employeeId: employee.instance.id,
      ...(exec.agent === undefined
        ? {}
        : { sessionId: exec.agent.session.id, agentId: exec.agent.id }),
      category: 'capability',
      action: mcp === undefined ? 'tool.call' : 'mcp.call',
      outcome,
      metadata: {
        callId: String(exec.callId),
        decision,
        ...(mcp === undefined
          ? { tool: exec.name }
          : { mcpServer: mcp.serverId, operation: mcp.operation }),
      },
    })
  }
}

function parseExpertComposition(value: unknown): DigitalEmployeeExpertComposition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('digital employee expert composition must be an object')
  }
  const record = value as Record<string, unknown>
  const unknown = Object.keys(record).find(key =>
    key !== 'employeeId' && key !== 'expertId' && key !== 'mcpServerIds')
  if (unknown !== undefined) {
    throw new Error(`digital employee expert composition has unknown field "${unknown}"`)
  }
  if (typeof record['employeeId'] !== 'string' || record['employeeId'].length === 0) {
    throw new Error('digital employee expert composition employeeId must be a non-empty string')
  }
  if (typeof record['expertId'] !== 'string' || record['expertId'].length === 0) {
    throw new Error('digital employee expert composition expertId must be a non-empty string')
  }
  const rawMcpServerIds = record['mcpServerIds']
  if (!Array.isArray(rawMcpServerIds) || rawMcpServerIds.some(id => typeof id !== 'string' || id.length === 0)) {
    throw new Error('digital employee expert composition mcpServerIds must be an array of non-empty strings')
  }
  const mcpServerIds = rawMcpServerIds as string[]
  if (new Set(mcpServerIds).size !== mcpServerIds.length) {
    throw new Error('digital employee expert composition mcpServerIds must not contain duplicates')
  }
  return {
    employeeId: record['employeeId'],
    expertId: record['expertId'],
    mcpServerIds: [...mcpServerIds],
  }
}

function parseMcpToolName(
  name: string,
  mcpIds: ReadonlyMap<string, string>,
): { serverId: string; operation: string } | undefined {
  if (!name.startsWith('mcp__')) return undefined
  const separator = name.indexOf('__', 5)
  if (separator < 0) return undefined
  const serverName = name.slice(5, separator)
  return {
    serverId: mcpIds.get(serverName) ?? serverName,
    operation: name.slice(separator + 2),
  }
}

async function resolveMcpServer(
  ctx: Context,
  employeeId: DigitalEmployeeInstanceId,
  sessionId: SessionId,
  server: DigitalEmployeeMcpServer,
): Promise<McpServerConfig> {
  const serverName = `de-${createHash('sha256').update(
    `${employeeId}:${sessionId}:${server.id}`,
  ).digest('hex').slice(0, 24)}`
  const common = {
    serverName,
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
    failOnStartupError: server.failOnStartupError ?? true,
  }
  if (server.transport === 'stdio') {
    return {
      ...common,
      transport: 'stdio',
      command: server.command,
      args: [...server.args],
      env: {
        ...server.env,
        ...await resolveCredentials(ctx, server.envCredentials, server.id),
      },
      cwd: server.cwd,
    }
  }
  return {
    ...common,
    transport: 'streamable-http',
    url: server.url,
    headers: {
      ...server.headers,
      ...await resolveCredentials(ctx, server.headerCredentials, server.id),
    },
  }
}

function requireMcpSessionId(agentCtx: Context): SessionId {
  const agent = agentCtx.agent
  if (agent === undefined) {
    throw new Error('digital employee MCP composition requires a scoped Agent')
  }
  return agent.id
}

async function resolveCredentials(
  ctx: Context,
  references: Readonly<Record<string, import('@deepseek-ai/dsh-credentials').CredentialRef>>,
  serverId: string,
): Promise<Record<string, string>> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    throw new Error(`digital employee MCP server "${serverId}" requires the credentials service`)
  }
  const entries = await Promise.all(Object.entries(references).map(async ([name, reference]) => {
    const resolved = await credentials.resolve(reference)
    if (resolved === undefined) {
      throw new Error(`digital employee MCP server "${serverId}" requires unavailable credential reference "${reference}"`)
    }
    return [name, resolved.value] as const
  }))
  return Object.fromEntries(entries)
}

function projectMemory(
  memories: Awaited<ReturnType<Context['digitalEmployees']['queryMemory']>>,
): DigitalEmployeeMemoryProjectionEvent {
  return {
    memories: memories.map(memory => ({
      id: memory.id,
      scope: memory.scope,
      content: memory.content,
      provenance: { ...memory.provenance },
    })),
  }
}

function renderIdentity(employee: ResolvedDigitalEmployee): string {
  return [
    'Digital employee identity',
    `Employee: ${employee.instance.displayName} (${employee.instance.id})`,
    `Template: ${employee.template.id}@${employee.template.version}`,
  ].join('\n')
}

/**
 * Derive the stable identity of one resolved root Agent composition.
 * Instruction installation roots, object key order, and set-like declaration
 * order do not affect the digest. MCP command and working-directory paths are
 * semantic execution settings and therefore do affect it.
 * @param employee - resolved employee composition before Agent creation.
 * @returns SHA-256 identity of the semantic composition.
 */
export function digitalEmployeeCompositionId(
  employee: ResolvedDigitalEmployee,
): DigitalEmployeeCompositionId {
  const composition = canonicalJson({
    templateId: employee.template.id,
    templateVersion: employee.template.version,
    preset: employee.template.preset,
    personality: employee.personality,
    instructions: {
      kind: employee.instructions.kind,
      path: employee.instructions.path,
      revision: employee.instructions.revision,
    },
    authority: canonicalAuthority(employee.authority),
    mcpServers: [...employee.mcpServers].sort(compareIds),
    experts: employee.experts.map(expert => ({
      id: expert.id,
      name: expert.name,
      responsibility: expert.responsibility,
      instructions: {
        kind: expert.instructions.kind,
        path: expert.instructions.path,
        revision: expert.instructions.revision,
      },
      modelSettings: expert.modelSettings,
      capabilities: canonicalAuthority(expert.capabilities),
      memoryAccess: [...expert.memoryAccess].sort(),
      delegation: expert.delegation,
    })).sort(compareIds),
    delegation: employee.delegation,
  })
  return createDigitalEmployeeCompositionId(
    `sha256:${createHash('sha256').update(composition).digest('hex')}`,
  )
}

function canonicalAuthority(authority: DigitalEmployeeAuthority): DigitalEmployeeAuthority {
  return {
    skills: [...authority.skills].sort(),
    tools: [...authority.tools].sort(),
    mcpServers: [...authority.mcpServers].sort(),
    experts: [...authority.experts].sort(),
    allowSubagents: authority.allowSubagents,
  }
}

function compareIds(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id.localeCompare(b.id)
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Readonly<Record<string, unknown>>
  return `{${Object.keys(record)
    .filter(key => record[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function renderPersonality(employee: ResolvedDigitalEmployee): string {
  return [
    'Digital employee personality',
    `Template: ${employee.template.personality}`,
    ...(employee.instance.personality === undefined
      ? []
      : [`Instance override: ${employee.instance.personality}`]),
  ].join('\n')
}

function renderMemory(projection: DigitalEmployeeMemoryProjectionEvent): string {
  return [
    'Digital employee memory',
    ...projection.memories.map(memory => `[${memory.id}] (${memory.scope}) ${memory.content}`),
  ].join('\n')
}

async function readInstructions(employee: ResolvedDigitalEmployee): Promise<string> {
  return await readInstructionSource(
    employee.instructions,
    `digital employee "${employee.instance.id}"`,
  )
}

async function readInstructionSource(
  source: DigitalEmployeeInstructionSource,
  owner: string,
): Promise<string> {
  const absolutePath = resolve(source.root, source.path)
  const relativePath = relative(source.root, absolutePath)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`${owner} instruction path "${source.path}" escapes plugin root`)
  }
  const content = (await readFile(absolutePath, 'utf8')).trim()
  if (content.length === 0) {
    throw new Error(`${owner} instruction file is empty: ${absolutePath}`)
  }
  return content
}

function copyAuthority(authority: DigitalEmployeeAuthority): DigitalEmployeeAuthority {
  return {
    skills: [...authority.skills],
    tools: [...authority.tools],
    mcpServers: [...authority.mcpServers],
    experts: [...authority.experts],
    allowSubagents: authority.allowSubagents,
  }
}

function appendExpertDelegation(
  request: DelegateToDigitalEmployeeExpertRequest,
  expert: ResolvedDigitalEmployeeExpert,
  effective: ReturnType<typeof resolveChildAuthority>,
  childSessionId: SessionId,
): void {
  request.parent.session.append('digital-employee/expert-delegation', {
    employeeId: expert.employeeId,
    expertId: expert.id,
    childSessionId,
    mode: expert.delegation.mode,
    provider: request.provider,
    label: expert.label,
    instructionRevision: expert.instructionRevision,
    prompt: request.prompt,
    ...(expert.memoryProjection === undefined
      ? {}
      : { memoryProjection: expert.memoryProjection }),
    authority: effective.capabilities,
    delegation: effective.delegation,
  })
}

function copyMemoryCandidate(
  candidate: DigitalEmployeeMemoryCandidate,
): DigitalEmployeeMemoryCandidate {
  return {
    ...candidate,
    tags: [...candidate.tags],
    provenance: { ...candidate.provenance },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveChildAuthority(
  expert: ResolvedDigitalEmployeeExpert,
  parent: DigitalEmployeeParentAuthority,
): {
  capabilities: DigitalEmployeeAuthority
  delegation: DigitalEmployeeDelegationPolicy
} {
  if (!parent.capabilities.experts.includes(expert.id)) {
    throw new Error(`parent Agent does not authorize expert "${expert.id}"`)
  }
  const delegation = {
    maxDepth: Math.min(
      expert.employeeDelegation.maxDepth,
      expert.delegation.maxDepth,
      parent.delegation.maxDepth,
    ),
    maxConcurrency: Math.min(
      expert.employeeDelegation.maxConcurrency,
      expert.delegation.maxConcurrency,
      parent.delegation.maxConcurrency,
    ),
    timeoutMs: Math.min(
      expert.employeeDelegation.timeoutMs,
      expert.delegation.timeoutMs,
      parent.delegation.timeoutMs,
    ),
  }
  if (parent.depth + 1 > delegation.maxDepth) {
    throw new Error(`expert "${expert.id}" delegation exceeds maximum depth ${delegation.maxDepth}`)
  }
  if (parent.activeDelegations >= delegation.maxConcurrency) {
    throw new Error(
      `expert "${expert.id}" delegation exceeds maximum concurrency ${delegation.maxConcurrency}`,
    )
  }
  return {
    capabilities: intersectAuthorities(
      expert.capabilities,
      expert.employeeAuthority,
      parent.capabilities,
    ),
    delegation,
  }
}

function intersectAuthorities(
  first: DigitalEmployeeAuthority,
  second: DigitalEmployeeAuthority,
  third: DigitalEmployeeAuthority,
): DigitalEmployeeAuthority {
  return {
    skills: intersection(first.skills, second.skills, third.skills),
    tools: intersection(first.tools, second.tools, third.tools),
    mcpServers: intersection(first.mcpServers, second.mcpServers, third.mcpServers),
    experts: intersection(first.experts, second.experts, third.experts),
    allowSubagents: first.allowSubagents && second.allowSubagents && third.allowSubagents,
  }
}

function intersection<T>(
  first: readonly T[],
  second: readonly T[],
  third: readonly T[],
): T[] {
  const secondSet = new Set(second)
  const thirdSet = new Set(third)
  return first.filter(value => secondSet.has(value) && thirdSet.has(value))
}

export default DigitalEmployeeAgent
