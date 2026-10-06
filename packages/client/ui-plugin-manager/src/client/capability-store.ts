/** Client view state for the Skill, MCP, and Agent preset inventory. */
import type { SkillManagementEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { ManagedMcpConfig } from '@deepseek-ai/dsh-plugin-manager/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

export interface CapabilitySession { readonly id: string; readonly title: string }
export interface CapabilityMcp {
  readonly id: string
  readonly name: string
  readonly enabled: boolean
  readonly phase: string | null
  readonly readOnly: boolean
  readonly managedId?: string
  readonly config?: ManagedMcpConfig
}
export interface CapabilityPrompt {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly isDefault: boolean
  readonly broken?: string
}
export interface CapabilityPermissions {
  readonly current: string | null
  readonly defaultPreset: string
  readonly options: readonly { readonly value: string; readonly name: string; readonly description?: string }[]
}
export type CapabilityTab = 'skills' | 'mcp' | 'prompts' | 'plugins' | 'permissions'

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
  readonly store: SnapshotStore<CapabilityState>
  private generation = 0
  private readonly disposers: readonly (() => void)[]

  constructor(private readonly services: CapabilityServices) {
    this.store = createSnapshotStore<CapabilityState>({
      tab: 'skills', sessions: services.sessions(), skills: [], mcp: [], prompts: [],
      permissions: null, source: null, busy: null, loading: false, error: null, notice: null,
    })
    this.disposers = [
      services.subscribeSessions(() => {
        const previous = this.store.getSnapshot()
        const sessions = services.sessions()
        this.store.set({ ...previous, sessions })
        if (previous.tab === 'skills' || previous.tab === 'permissions') void this.load()
      }),
      services.subscribeChanges(() => { void this.load() }),
    ]
  }

  private patch(patch: Partial<CapabilityState>): void { this.store.set({ ...this.store.getSnapshot(), ...patch }) }
  private sessionId(): string | undefined {
    const { selected, sessions } = this.store.getSnapshot()
    return selected !== undefined && sessions.some(row => row.id === selected) ? selected : sessions[0]?.id
  }
  selectTab(tab: CapabilityTab): void { this.patch({ tab, error: null }); void this.load() }
  selectSession(id: string): void { this.patch({ selected: id }); void this.load() }

  /** Read the selected inventory, ignoring a response superseded by navigation or another read. */
  async load(): Promise<void> {
    const generation = ++this.generation
    const { tab } = this.store.getSnapshot()
    if (tab === 'plugins') { this.patch({ loading: false, error: null }); return }
    this.patch({ loading: true, error: null })
    try {
      if (tab === 'skills') {
        const id = this.sessionId()
        const skills = id === undefined ? [] : await this.services.skills(id)
        if (generation === this.generation) this.patch({ skills })
      } else if (tab === 'mcp') {
        const mcp = await this.services.mcp()
        if (generation === this.generation) this.patch({ mcp })
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

  async selectPermission(preset: string): Promise<void> {
    const sessionId = this.sessionId()
    if (sessionId === undefined || this.store.getSnapshot().busy !== null) return
    this.patch({ busy: preset, error: null })
    try { await this.services.setPermission(sessionId, preset); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

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

  async toggleSkill(name: string, modelInvocable: boolean, userInvocable: boolean): Promise<void> {
    const sessionId = this.sessionId()
    if (sessionId === undefined) return
    this.patch({ busy: name, error: null })
    try { await this.services.setSkillInvocation(sessionId, name, modelInvocable, userInvocable); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

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

  async removeMcp(id: string): Promise<void> {
    this.patch({ busy: id, error: null, notice: null })
    try {
      const application = await this.services.removeMcp(id)
      await this.load()
      if (application === 'restart-required') this.patch({ notice: 'restart-required' })
    } catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  async makeDefault(id: string): Promise<void> {
    this.patch({ busy: id, error: null })
    try { await this.services.setDefaultPrompt(id); await this.load() }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  async viewSource(id: string): Promise<void> {
    if (this.store.getSnapshot().source?.id === id) { this.patch({ source: null }); return }
    this.patch({ busy: id, error: null, source: null })
    try { this.patch({ source: { id, text: await this.services.promptSource(id) } }) }
    catch (reason: unknown) { this.patch({ error: errorText(reason) }) }
    finally { this.patch({ busy: null }) }
  }

  dispose(): void { this.generation++; for (const dispose of this.disposers) dispose() }
}

/** Injected action and observable face assembled by the slot renderer. */
export interface CapabilityFace {
  readonly hooks: { readonly capabilityCenter: SnapshotStore<CapabilityState> }
  readonly selectCapabilityTab: (tab: CapabilityTab) => void
  readonly selectCapabilitySession: (id: string) => void
  readonly refreshCapabilities: () => void
  readonly selectCapabilityPermission: (preset: string) => void
  readonly toggleCapabilityMcp: (id: string, enabled: boolean) => void
  readonly toggleCapabilitySkill: (name: string, modelInvocable: boolean, userInvocable: boolean) => void
  readonly saveCapabilityMcp: (config: ManagedMcpConfig, id?: string) => Promise<boolean>
  readonly removeCapabilityMcp: (id: string) => void
  readonly makeDefaultCapabilityPrompt: (id: string) => void
  readonly viewCapabilityPrompt: (id: string) => void
}

/** Bind actions to one controller without passing it into a component. */
export function capabilityFace(controller: CapabilityController): CapabilityFace {
  return {
    hooks: { capabilityCenter: controller.store },
    selectCapabilityTab: tab => controller.selectTab(tab),
    selectCapabilitySession: id => controller.selectSession(id),
    refreshCapabilities: () => { void controller.load() },
    selectCapabilityPermission: (preset) => { void controller.selectPermission(preset) },
    toggleCapabilityMcp: (id, enabled) => { void controller.toggleMcp(id, enabled) },
    toggleCapabilitySkill: (name, modelInvocable, userInvocable) => { void controller.toggleSkill(name, modelInvocable, userInvocable) },
    saveCapabilityMcp: (config, id) => controller.saveMcp(config, id),
    removeCapabilityMcp: (id) => { void controller.removeMcp(id) },
    makeDefaultCapabilityPrompt: (id) => { void controller.makeDefault(id) },
    viewCapabilityPrompt: (id) => { void controller.viewSource(id) },
  }
}
