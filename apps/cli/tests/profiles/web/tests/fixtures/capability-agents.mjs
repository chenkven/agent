/** Keyless role management and real in-process delegation in the shipped Web profile. */
import { LlmAdapter } from '@deepseek-ai/dsh-llm'

export const inject = ['agents', 'agentPresets', 'llm', 'tools', 'pluginManager', 'permissionPresets', 'sessionProjections', 'sandboxPolicy', 'approval']

export function apply(ctx) {
  const requests = []
  class RoleAdapter extends LlmAdapter {
    async * stream(options) {
      requests.push({ model: options.model, messages: JSON.stringify(options.messages), tools: options.tools?.map(tool => tool.name) })
      const text = 'Research complete.'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
  ctx.llm.registerAdapter(['capability-role-test'], new RoleAdapter())
  const receive = phase => {
    if (phase !== 'roles' && phase !== 'restored') return
    void inspect(phase).then(result => process.send({ result }), error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => {
    process.on('message', receive)
    return () => process.off('message', receive)
  })
  async function inspect(phase) {
    let saved
    if (phase === 'roles') saved = await ctx.pluginManager.agentSave({ name: 'researcher',
      description: 'Research with evidence', persona: 'Research sources without editing.',
      provider: 'capability-role-test', model: 'mock', tools: ['read'],
    })
    const [role] = await ctx.pluginManager.agentList()
    const handle = await ctx.agents.create({ sessionId: `${phase}-role-parent`, meta: { cwd: process.cwd() },
      agentOptions: { provider: 'capability-role-test', model: 'mock' },
      setup: scope => ctx.agentPresets.mount(scope, 'cordis').then(() => undefined),
    })
    const started = []
    const catalog = []
    const stopCatalog = ctx.on('session/event', (session, event) => {
      if (session.id === handle.agent.session.id && event.type === 'subagent/catalog') catalog.push(event.data)
    })
    const stop = ctx.on('subagent/start', info => {
      const child = ctx.agents.get(info.id)
      started.push({ id: info.id, permission: child === undefined ? null : ctx.permissionPresets.current(child.session),
        sandbox: child === undefined ? null : ctx.sandboxPolicy.overrideOf(child.session),
        approval: child === undefined ? null : ctx.approval.overrideOf(child.session) })
    })
    try {
      ctx.permissionPresets.set(handle.agent.session, 'read-only')
      const visible = ctx.tools.schemas(handle.agent).map(tool => tool.name)
      const schema = ctx.tools.schemas(handle.agent).find(tool => tool.name === 'delegate_researcher')
      const response = await ctx.tools.execute({ name: 'delegate_researcher',
        arguments: { description: 'Research role test', prompt: 'Summarize the available sources.' },
        agent: handle.agent, callId: `${phase}-delegate`, signal: new AbortController().signal,
      })
      let removed
      if (phase === 'restored') removed = await ctx.pluginManager.agentDelete(role.id)
      return { saved, role, visible, description: schema.description, response, started, catalog,
        requests, removed, remaining: ctx.tools.schemas(handle.agent).map(tool => tool.name) }
    } finally { stop(); stopCatalog(); await handle.dispose() }
  }
}
