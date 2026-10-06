/** Client view state for the Skill, MCP, and Agent preset inventory. */
import type { SkillManagementEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { ManagedAgent, ManagedAgentConfig, ManagedMcpConfig } from '@deepseek-ai/dsh-plugin-manager/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Selectable main Session. */
export interface CapabilitySession { readonly id: string; readonly title: string }
/** MCP inventory with ownership and live activation state. */
export interface CapabilityMcp {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly phase: string | null
  readonly readOnly: boolean
  readonly managedId?: string
  readonly config?: ManagedMcpConfig
}
/** Agent preset available to new Sessions. */
export interface CapabilityPrompt {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly isDefault: boolean
  readonly broken?: string
}
/** Effective selection and the current permission catalog. */
export interface CapabilityPermissions {
  readonly current: string | null
  readonly defaultPreset: string
  readonly options: readonly { readonly value: string; readonly name: string; readonly description?: string }[]
}
/** Saved role with its live plugin row. */
export interface CapabilityAgent extends ManagedAgent { readonly entryId?: string; readonly phase: string | null }
/** Durable direct-child address and current activity. */
export interface CapabilityAgentRun {
  readonly id: string
  readonly parentId: string
  readonly mode: 'one-shot' | 'continuable' | 'unknown'
  readonly label: string
  readonly running: boolean
}
/** One exact route advertised by the Host. */
export interface CapabilityModel { readonly provider: string; readonly model: string; readonly label: string }
/** Inventory selected in the capability center. */
export type CapabilityTab = 'skills' | 'mcp' | 'prompts' | 'plugins' | 'permissions' | 'agents' | 'models'

/** Browser actions backed by the existing Host Remotes. */
export interface CapabilityServices {
  readonly sessions: () => readonly CapabilitySession[]
  readonly subscribeSessions: (listener: () => void) => () => void
  readonly skills: (sessionId: string) => Promise<readonly SkillManagementEntry[]>
  readonly setSkillInvocation: (sessionId: string, name: string, modelInvocable: boolean, userInvocable: boolean) => Promise<void>
  readonly mcp: () => Promise<readonly CapabilityMcp[]>
  readonly setMcpEnabled: (id: string, enabled: boolean) => Promise<'applied' | 'restart-required'>
  readonly saveMcp: (config: ManagedMcpConfig, id?: string) => Promise<'applied' | 'restart-required'>
  readonly removeMcp: (id: string) => Promise<'applied' | 'restart-required'>
  readonly agents: () => Promise<readonly CapabilityAgent[]>
  readonly models: () => Promise<readonly CapabilityModel[]>
  readonly agentRuns: (sessionId?: string) => Promise<readonly CapabilityAgentRun[]>
  readonly saveAgent: (config: ManagedAgentConfig, id?: string) => Promise<'applied' | 'restart-required'>
  readonly removeAgent: (id: string) => Promise<'applied' | 'restart-required'>
  readonly delegateAgent: (sessionId: string, name: string, task: string) => Promise<void>
  readonly openAgentRun: (run: CapabilityAgentRun) => void
  readonly permissions: (sessionId?: string) => Promise<CapabilityPermissions>
  readonly setPermission: (sessionId: string, preset: string) => Promise<void>
  readonly prompts: () => Promise<readonly CapabilityPrompt[]>
  readonly promptSource: (id: string) => Promise<string>
  readonly setDefaultPrompt: (id: string) => Promise<void>
  readonly subscribeChanges: (listener: () => void) => () => void
}

/** Snapshot consumed through the slot renderer's injected hook. */
export interface CapabilityState {
  readonly tab: CapabilityTab
  readonly sessions: readonly CapabilitySession[]
  readonly selected?: string
  readonly skills: readonly SkillManagementEntry[]
  readonly mcp: readonly CapabilityMcp[]
  readonly prompts: readonly CapabilityPrompt[]
  readonly agents: readonly CapabilityAgent[]
  readonly models: readonly CapabilityModel[]
  readonly agentRuns: readonly CapabilityAgentRun[]
  readonly permissions: CapabilityPermissions | null
  readonly source: { readonly id: string; readonly text: string } | null
  readonly busy: string | null
  readonly loading: boolean
  readonly error: string | null
  readonly notice: 'restart-required' | null
}

const errorText = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

/** Owns remote reads, mutations, and superseded request handling for the center. */
export class CapabilityController {
  /** Observable inventory, mutation status, and read failures. */
  readonly store: SnapshotStore<CapabilityState>
  private generation = 0
  private readonly disposers: readonly (() => void)[]

  constructor(private readonly services: CapabilityServices) {
    this.store = createSnapshotStore<CapabilityState>({
      tab: 'skills', sessions: services.sessions(), skills: [], mcp: [], prompts: [],
      agents: [], models: [], agentRuns: [], permissions: null, source: null, busy: null, loading: false, error: null, notice: null,
    })
    this.disposers = [
      services.subscribeSessions(() => {
        const previous = this.store.getSnapshot()
        const sessions = services.sessions()
        this.store.set({ ...previous, sessions })
        if (previous.tab === 'skills' || previous.tab === 'permissions') void this.load()
        if (previous.tab === 'agents') void this.refreshAgentRuns()
      }),
      services.subscribeChanges(() => { void this.load() }),
    ]
  }

  private patch(patch: Partial<CapabilityState>): void { this.store.set({ ...this.store.getSnapshot(), ...patch }) }
  private sessionId(): string | undefined {
    const { selected, sessions } = this.store.getSnapshot()
    return selected !== undefined && sessions.some(row => row.id === selected) ? selected : sessions[0]?.id
  }
  /**
   * Select an inventory and supersede earlier reads.
   * @param tab - inventory to open
   */
  selectTab(tab: CapabilityTab): void { this.patch({ tab, error: null }); void this.load() }
  /**
   * Select the main Session for reads and task submission.
   * @param id - main Session identity
   */
  selectSession(id: string): void { this.patch({ selected: id }); void this.load() }

  /** Read the selected inventory, ignoring a response superseded by navigation or another read. */
  async load(): Promise<void> {
    const generation = ++this.generation
    const { tab } = this.store.getSnapshot()
    if (tab === 'plugins' || tab === 'models') { this.patch({ loading: false, error: null }); return }
    this.patch({ loading: true, error: null })
    try {
      if (tab === 'skills') {
        const id = this.sessionId()
        const skills = id === undefined ? [] : await this.services.skills(id)
        if (generation === this.generation) this.patch({ skills })
      } else if (tab === 'mcp') {
        const mcp = await this.services.mcp()
        if (generation === this.generation) this.patch({ mcp })
      } else if (tab === 'agents') {
        const [agents, models, agentRuns] = await Promise.all([
          this.services.agents(), this.services.models(), this.services.agentRuns(this.sessionId()),
        ])
        if (generation === this.generation) this.patch({ agents, models, agentRuns })
      } else if (tab === 'permissions') {
        const permissions = await this.services.permissions(this.sessionId())
        if (generation === this.generation) this.patch({ permissions })
      } else {
        const prompts = await this.services.prompts()
        if (generation === this.generation) this.patch({ prompts })
      }
    } catch (reason: unknown) {
      if (generation === this.generation) this.patch({ error: errorText(reason) })
    } finally {
      if (generation === this.generation) this.patch({ loading: false })
    }
  }

  private async refreshAgentRuns(): Promise<void> {
    const generation = this.generation
    const sessionId = this.sessionId()
    try {
      const agentRuns = await this.services.agentRuns(sessionId)
      if (generation === this.generation && this.store.getSnapshot().tab === 'agents') this.patch({ agentRuns })
    } catch { /* Explicit refresh reports read failures without disrupting streaming. */ }
  }

  /**
   * Persist a role through the Host and refresh its inventory.
   * @param config - validated role fields
   * @param id - owned role to edit; absent creates a role
   * @returns true after persistence; false with an error published in the store.
   */
  async saveAgent(config: ManagedAgentConfig, id?: string): Promise<boolean> {
    this.patch({ busy: id ?? 'new-agent', error: null, notice: null })
    try {
      const application = await this.services.saveAgent(config, id)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
      return true
    } catch (reason: unknown) { this.patch({ error: errorText(reason) }); return false }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Delete an owned role and refresh; failures are published in the store.
   * @param id - owned role identity
   */
  async removeAgent(id: string): Promise<void> {
    this.patch({ busy: id, error: null, notice: null })
    try {
      const application = await this.services.removeAgent(id)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
    } catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Queue a delegation request in the selected main Session.
   * @param name - role tool suffix
   * @param task - human task text
   * @returns whether the inbox accepted the request; this does not establish that a child started.
   */
  async delegateAgent(name: string, task: string): Promise<boolean> {
    const sessionId = this.sessionId()
    if (sessionId === undefined || task.trim() === '') return false
    this.patch({ busy: name, error: null })
    try { await this.services.delegateAgent(sessionId, name, task); await this.load(); return true }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }); return false }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Open an existing child conversation.
   * @param run - durable parent and child address
   */
  openAgentRun(run: CapabilityAgentRun): void { this.services.openAgentRun(run) }

  /**
   * Apply a permission preset to the selected Session and reread its effective value.
   * @param preset - catalog preset name
   */
  async selectPermission(preset: string): Promise<void> {
    const sessionId = this.sessionId()
    if (sessionId === undefined || this.store.getSnapshot().busy !== null) return
    this.patch({ busy: preset, error: null })
    try { await this.services.setPermission(sessionId, preset); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Change an addressable plugin row; roles and MCP connections share this Host operation.
   * @param id - composition entry identity
   * @param enabled - desired enablement
   */
  async toggleMcp(id: string, enabled: boolean): Promise<void> {
    this.patch({ busy: id, error: null, notice: null })
    try {
      const application = await this.services.setMcpEnabled(id, enabled)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
    }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Persist invocation flags for an editable project Skill.
   * @param name - winning Skill name
   * @param modelInvocable - whether the model may invoke it
   * @param userInvocable - whether slash invocation is available
   */
  async toggleSkill(name: string, modelInvocable: boolean, userInvocable: boolean): Promise<void> {
    const sessionId = this.sessionId()
    if (sessionId === undefined) return
    this.patch({ busy: name, error: null })
    try { await this.services.setSkillInvocation(sessionId, name, modelInvocable, userInvocable); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Persist a connection through the Host and refresh.
   * @param config - connection fields
   * @param id - owned connection to edit; absent creates a disabled row
   * @returns true after persistence; false with an error published in the store.
   */
  async saveMcp(config: ManagedMcpConfig, id?: string): Promise<boolean> {
    this.patch({ busy: id ?? 'new-mcp', error: null, notice: null })
    try {
      const application = await this.services.saveMcp(config, id)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
      return true
    } catch (reason: unknown) { this.patch({ error: errorText(reason) }); return false }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Remove an owned connection and refresh; failures are published in the store.
   * @param id - owned connection identity
   */
  async removeMcp(id: string): Promise<void> {
    this.patch({ busy: id, error: null, notice: null })
    try {
      const application = await this.services.removeMcp(id)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
    } catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Set the preset for new Sessions; existing Sessions keep their composition.
   * @param id - preset identity
   */
  async makeDefault(id: string): Promise<void> {
    this.patch({ busy: id, error: null })
    try { await this.services.setDefaultPrompt(id); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Toggle the selected preset composition preview.
   * @param id - preset identity
   */
  async viewSource(id: string): Promise<void> {
    if (this.store.getSnapshot().source?.id === id) { this.patch({ source: null }); return }
    this.patch({ busy: id, error: null, source: null })
    try { this.patch({ source: { id, text: await this.services.promptSource(id) } }) }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  /**
   * Unsubscribe invalidations and discard pending read responses.
   */
  dispose(): void { this.generation++; for (const dispose of this.disposers) dispose() }
}

/** Injected action and observable face assembled by the slot renderer. */
export interface CapabilityFace {
  readonly hooks: { readonly capabilityCenter: SnapshotStore<CapabilityState> }
  readonly selectCapabilityTab: (tab: CapabilityTab) => void
  readonly selectCapabilitySession: (id: string) => void
  readonly refreshCapabilities: () => void
  readonly saveCapabilityAgent: (config: ManagedAgentConfig, id?: string) => Promise<boolean>
  readonly removeCapabilityAgent: (id: string) => void
  readonly delegateCapabilityAgent: (name: string, task: string) => Promise<boolean>
  readonly openCapabilityAgentRun: (run: CapabilityAgentRun) => void
  readonly selectCapabilityPermission: (preset: string) => void
  readonly toggleCapabilityMcp: (id: string, enabled: boolean) => void
  readonly toggleCapabilitySkill: (name: string, modelInvocable: boolean, userInvocable: boolean) => void
  readonly saveCapabilityMcp: (config: ManagedMcpConfig, id?: string) => Promise<boolean>
  readonly removeCapabilityMcp: (id: string) => void
  readonly makeDefaultCapabilityPrompt: (id: string) => void
  readonly viewCapabilityPrompt: (id: string) => void
}

/**
 * Bind actions without giving the component a controller.
 * @param controller - inventory owner
 * @returns stable callbacks and its observable store.
 */
export function capabilityFace(controller: CapabilityController): CapabilityFace {
  return {
    hooks: { capabilityCenter: controller.store },
    selectCapabilityTab: (tab) =>{  controller.selectTab(tab) },
    selectCapabilitySession: (id) =>{  controller.selectSession(id) },
    refreshCapabilities: () => { void controller.load() },
    saveCapabilityAgent: (config, id) => controller.saveAgent(config, id),
    removeCapabilityAgent: (id) => { void controller.removeAgent(id) },
    delegateCapabilityAgent: (name, task) => controller.delegateAgent(name, task),
    openCapabilityAgentRun: (run) =>{  controller.openAgentRun(run) },
    selectCapabilityPermission: (preset) => { void controller.selectPermission(preset) },
    toggleCapabilityMcp: (id, enabled) => { void controller.toggleMcp(id, enabled) },
    toggleCapabilitySkill: (name, modelInvocable, userInvocable) => { void controller.toggleSkill(name, modelInvocable, userInvocable) },
    saveCapabilityMcp: (config, id) => controller.saveMcp(config, id),
    removeCapabilityMcp: (id) => { void controller.removeMcp(id) },
    makeDefaultCapabilityPrompt: (id) => { void controller.makeDefault(id) },
    viewCapabilityPrompt: (id) => { void controller.viewSource(id) },
  }
}
