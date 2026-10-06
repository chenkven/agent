/** Session-addressed, cold-readable skill catalog Remote. */

import type { Context } from '@deepseek-ai/cordis'
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { SessionQueryError } from '@deepseek-ai/dsh-session-query'
import { isUserInvocable } from '@deepseek-ai/dsh-skill'
import type { SkillSummary } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { isMap, parseDocument } from 'yaml'
import type { SkillInvocationChange, SkillListRequest, SkillListValue, SkillManagementEntry, SkillManagementValue } from './types.ts'

function projectSkillRoot(cwd: string, source: string): string | undefined {
  if (source === 'project-dsh') return resolve(cwd, '.dsh/skills')
  if (source === 'project-agents') return resolve(cwd, '.agents/skills')
  return undefined
}

async function editableSkill(cwd: string, skill: SkillSummary): Promise<boolean> {
  if (projectSkillRoot(cwd, skill.source) === undefined || skill.path === undefined) return false
  try {
    const realCwd = await realpath(cwd)
    const root = projectSkillRoot(realCwd, skill.source)
    if (root === undefined) return false
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(skill.path)])
    if (relative(root, realRoot) !== '') return false
    const inside = relative(realRoot, realFile)
    return inside !== '' && inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside)
  } catch { return false }
}

/** Replace only invocation keys in a project-owned SKILL.md frontmatter. */
async function writeSkillInvocation(path: string, change: SkillInvocationChange): Promise<void> {
  const content = await readFile(path, 'utf8')
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n)/.exec(content)
  if (match === null || match[2] === undefined) throw new Error('Skill file has no YAML frontmatter')
  const document = parseDocument(match[2])
  if (document.errors[0] !== undefined) throw document.errors[0]
  if (!isMap(document.contents)) throw new Error('Skill frontmatter must be a YAML mapping')
  if (document.get('name') !== change.name) throw new Error('Skill identity changed during editing')
  document.set('disable-model-invocation', !change.modelInvocable)
  document.set('user-invocable', change.userInvocable)
  await writeFileAtomic(path, `${match[1]}${String(document).trimEnd()}${match[3]}${content.slice(match[0].length)}`, { mode: 0o600 })
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the Session-addressed `skills` Remote namespace. */
    sessionSkillCatalog: SessionSkillCatalog
  }
}

/** Host service backing `ctx.remote.skills` without activating a cold Agent. */
export class SessionSkillCatalog extends TypertRemoteService {
  static inject = ['agents', 'sessionQuery', 'typert']

  /** @param ctx - Host context carrying Session reads and optional skill/preset services. */
  constructor(ctx: Context) {
    super(ctx, 'sessionSkillCatalog', { namespace: 'skills' })
  }

  /**
   * List the user-invocable skills visible to one Session composition.
   * @param request - Session identity whose cwd and preset select the catalog view.
   * @param signal - caller lifetime carried by the Remote transport; admitted catalog reads retain their existing completion semantics.
   * @returns user-invocable skill metadata without loading skill bodies.
   * @throws RemoteError when the Session cannot be inspected or no registry can serve it.
   */
  @Remote
  async list(request: SkillListRequest, signal: AbortSignal): Promise<SkillListValue> {
    const { skills } = await this.observe(request, signal)
    return { skills: skills.filter(isUserInvocable).map(skill => ({
      name: skill.name,
      ...skill.path === undefined ? {} : { path: skill.path },
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      modelInvocable: skill.invocation.modelInvocable,
    })) }
  }

  /** Inventory every skill visible to a Session, including those disabled for user invocation. */
  @Remote
  async manageList(request: SkillListRequest, signal: AbortSignal): Promise<SkillManagementValue> {
    const { skills, cwd } = await this.observe(request, signal)
    return { skills: await Promise.all(skills.map(async (skill): Promise<SkillManagementEntry> => ({
      name: skill.name,
      ...skill.path === undefined ? {} : { path: skill.path },
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
      source: skill.source,
      editable: await editableSkill(cwd, skill),
    }))) }
  }

  /** Edit invocation flags only for a winning Skill file inside this Session's project skill roots. */
  @Remote
  async setInvocation(change: SkillInvocationChange, signal: AbortSignal): Promise<void> {
    const { skills, cwd, registry } = await this.observe(change, signal)
    const skill = skills.find(row => row.name === change.name)
    const path = skill?.path
    if (skill === undefined || path === undefined || !(await editableSkill(cwd, skill))) {
      throw new RemoteError('gateway/internal', `skill "${change.name}" is not an editable project skill`, {})
    }
    await withFileLock(path, async () => {
      if (!(await editableSkill(cwd, skill))) throw new Error('Skill source moved outside the project')
      await writeSkillInvocation(path, change)
    })
    registry.invalidateCatalog()
  }

  private async observe(request: SkillListRequest, signal: AbortSignal) {
    void signal
    const { sessionId } = request
    let cwd: string | undefined
    let agentPreset: string | undefined
    try {
      using observation = await this.ctx.sessionQuery.observeSession(sessionId)
      if (observation.projections === undefined) {
        throw new Error('skill catalog requires a projected Session observation')
      }
      cwd = observation.header.cwd
      agentPreset = observation.projections.values.agentPreset ?? undefined
    } catch (error: unknown) {
      if (error instanceof SessionQueryError
        && error.code === 'SESSION_QUERY_SESSION_NOT_FOUND') {
        throw new RemoteError('session/not-found', `session "${sessionId}" not found`, { sessionId })
      }
      throw new RemoteError(
        'gateway/internal',
        `session "${sessionId}" could not be inspected: ${String(error)}`,
        {},
      )
    }
    if (cwd === undefined) {
      throw new RemoteError('gateway/internal', `session "${sessionId}" has no project cwd`, {})
    }

    const live = this.ctx.agents.get(sessionId)
    const presets = this.ctx.get('agentPresets')
    const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills')
    const skillRegistry = scoped ?? this.ctx.get('skills')
    if (skillRegistry === undefined) {
      throw new RemoteError(
        'gateway/internal',
        'skill registry is absent: neither this session\'s agent preset nor the host composition mounts @deepseek-ai/dsh-skill',
        {},
      )
    }

    await using lease = live === undefined ? await this.scopeFor(agentPreset) : undefined
    const scope = live ?? lease?.key
    try {
      return { skills: await skillRegistry.list({ cwd, scope }), cwd, registry: skillRegistry }
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill listing failed: ${String(error)}`, {})
    }
  }

  /** Resolve a live or standing preset scope without creating an Agent. */
  private async scopeFor(
    agentPreset: string | undefined,
  ): Promise<({ key: ScopeKey } & AsyncDisposable) | undefined> {
    const presets = this.ctx.get('agentPresets')
    if (presets === undefined) return undefined
    try {
      return await presets.acquireScope(agentPreset)
    } catch {
      // An unknown or unusable recorded preset falls back to the global registry.
      return undefined
    }
  }
}

export default SessionSkillCatalog
