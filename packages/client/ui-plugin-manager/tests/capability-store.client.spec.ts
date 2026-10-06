import { describe, expect, it, vi } from 'vitest'
import { CapabilityController, type CapabilityServices } from '../src/client/capability-store.ts'

function services(): CapabilityServices {
  return {
    sessions: () => [{ id: 'session-a', title: 'Project A' }],
    subscribeSessions: () => () => {},
    skills: vi.fn(async () => [{ name: 'review', description: 'Review files', modelInvocable: true,
      userInvocable: true, source: 'project-agents', editable: true }]),
    setSkillInvocation: vi.fn(async () => {}),
    mcp: vi.fn(async () => [{ id: 'mcp:git', name: 'Git', enabled: false, phase: null, readOnly: false }]),
    setMcpEnabled: vi.fn(async () => 'applied' as const),
    saveMcp: vi.fn(async () => 'applied' as const),
    removeMcp: vi.fn(async () => 'applied' as const),
    agents: vi.fn(async () => []), models: vi.fn(async () => []), agentRuns: vi.fn(async () => []),
    saveAgent: vi.fn(async () => 'applied' as const), removeAgent: vi.fn(async () => 'applied' as const),
    delegateAgent: vi.fn(async () => {}), openAgentRun: vi.fn(),
    permissions: vi.fn(async () => ({ current: 'workspace-write', defaultPreset: 'workspace-write', options: [] })),
    setPermission: vi.fn(async () => {}),
    prompts: vi.fn(async () => [{ id: 'standard', name: 'Standard', isDefault: true }]),
    promptSource: vi.fn(async () => '- id: persona'),
    setDefaultPrompt: vi.fn(async () => {}),
    subscribeChanges: () => () => {},
  }
}

describe('capability inventory', () => {
  it('manages roles through the Host and submits delegation to the selected parent', async () => {
    const remote = services()
    const center = new CapabilityController(remote)
    center.selectTab('agents')
    await vi.waitFor(() =>{  expect(remote.agents).toHaveBeenCalled() })
    const config = { name: 'researcher', description: 'Research sources', persona: 'Cite evidence.', tools: ['read'] }
    expect(await center.saveAgent(config)).toBe(true)
    expect(remote.saveAgent).toHaveBeenCalledWith(config, undefined)
    expect(await center.delegateAgent('researcher', 'Review sources')).toBe(true)
    expect(remote.delegateAgent).toHaveBeenCalledWith('session-a', 'researcher', 'Review sources')
    await center.removeAgent('capability-agent-researcher')
    expect(remote.removeAgent).toHaveBeenCalledWith('capability-agent-researcher')
    center.dispose()
  })

  it('writes permission through the selected session and refreshes its authoritative value', async () => {
    let current = 'workspace-write'
    const remote: CapabilityServices = {
      ...services(),
      agents: vi.fn(async () => []), models: vi.fn(async () => []), agentRuns: vi.fn(async () => []),
      saveAgent: vi.fn(async () => 'applied' as const), removeAgent: vi.fn(async () => 'applied' as const),
      delegateAgent: vi.fn(async () => {}), openAgentRun: vi.fn(),
      permissions: vi.fn(async () => ({ current, defaultPreset: 'workspace-write', options: [] })),
      setPermission: vi.fn(async (_id: string, preset: string) => { current = preset }),
    }
    const center = new CapabilityController(remote)
    center.selectTab('permissions')
    await vi.waitFor(() =>{  expect(center.store.getSnapshot().permissions?.current).toBe('workspace-write') })
    await center.selectPermission('read-only')
    expect(remote.setPermission).toHaveBeenCalledWith('session-a', 'read-only')
    expect(center.store.getSnapshot().permissions?.current).toBe('read-only')
    center.dispose()
  })
  it('uses the selected session for Skill discovery and the Host for MCP enablement', async () => {
    const remote = services()
    const center = new CapabilityController(remote)
    await center.load()
    expect(remote.skills).toHaveBeenCalledWith('session-a')
    expect(center.store.getSnapshot().skills.map(row => row.name)).toEqual(['review'])
    center.selectTab('mcp')
    await vi.waitFor(() =>{  expect(center.store.getSnapshot().mcp).toHaveLength(1) })
    await center.toggleMcp('mcp:git', true)
    expect(remote.setMcpEnabled).toHaveBeenCalledWith('mcp:git', true)
    center.dispose()
  })

  it('discards a late catalog after switching tabs and reports a rejected mutation', async () => {
    let resolveSkills: ((value: Awaited<ReturnType<CapabilityServices['skills']>>) => void) | undefined
    const remote = { ...services(), skills: vi.fn(() => new Promise<Awaited<ReturnType<CapabilityServices['skills']>>>((resolve) => { resolveSkills = resolve })) }
    const center = new CapabilityController(remote)
    const old = center.load()
    center.selectTab('prompts')
    await vi.waitFor(() =>{  expect(center.store.getSnapshot().prompts).toHaveLength(1) })
    resolveSkills?.([{ name: 'stale', description: 'Old', modelInvocable: true,
      userInvocable: true, source: 'project-agents', editable: true }])
    await old
    expect(center.store.getSnapshot().skills).toEqual([])
    const failing = { ...services(), setMcpEnabled: vi.fn(async () => { throw new Error('Host refused') }) }
    const other = new CapabilityController(failing)
    await other.toggleMcp('mcp:git', true)
    expect(other.store.getSnapshot().error).toBe('Host refused')
    center.dispose()
    other.dispose()
  })

  it('saves and removes an MCP connection through the Host and refreshes the inventory', async () => {
    const remote = services()
    const center = new CapabilityController(remote)
    center.selectTab('mcp')
    const config = { serverName: 'docs', transport: 'streamable-http' as const, url: 'https://example.com/mcp', headers: {} }
    expect(await center.saveMcp(config)).toBe(true)
    expect(remote.saveMcp).toHaveBeenCalledWith(config, undefined)
    await center.removeMcp('capability-mcp-docs')
    expect(remote.removeMcp).toHaveBeenCalledWith('capability-mcp-docs')
    center.dispose()
  })

  it('changes invocation flags for the selected Session skill', async () => {
    const remote = services()
    const center = new CapabilityController(remote)
    await center.load()
    await center.toggleSkill('review', false, true)
    expect(remote.setSkillInvocation).toHaveBeenCalledWith('session-a', 'review', false, true)
    center.dispose()
  })
})
