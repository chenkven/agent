/** Test-only IPC assertions over real Creator presets and profile management. */
export const inject = ['agents', 'agentPresets', 'tools', 'pluginManager', 'permissionPresets', 'sessionSkillCatalog']

export function apply(ctx, config) {
  const receive = message => {
    if (message !== 'initial' && message !== 'restart' && message !== 'managed' && message !== 'skill') return
    void inspect(message).then(result => process.send({ result }), error => process.send({ error: String(error.stack ?? error) }))
  }
  ctx.effect(() => {
    process.on('message', receive)
    return () => process.off('message', receive)
  })
  async function inspect(phase) {
    if (phase === 'skill') {
      const sessionId = 'capability-skill-test'
      const handle = await ctx.agents.create({ sessionId, meta: { cwd: process.cwd() },
        setup: scope => ctx.agentPresets.mount(scope, 'cordis').then(() => undefined) })
      const signal = new AbortController().signal
      try {
        const before = (await ctx.sessionSkillCatalog.manageList({ sessionId }, signal)).skills.find(row => row.name === 'capability-test')
        await ctx.sessionSkillCatalog.setInvocation({ sessionId, name: 'capability-test',
          modelInvocable: false, userInvocable: false }, signal)
        const after = (await ctx.sessionSkillCatalog.manageList({ sessionId }, signal)).skills.find(row => row.name === 'capability-test')
        return { skill: { before, after } }
      } finally { await handle.dispose() }
    }
    if (phase === 'managed') {
      const handle = await ctx.agents.create({ sessionId: 'managed-mcp-test', cwd: process.cwd(),
        setup: scope => ctx.agentPresets.mount(scope, 'cordis').then(() => undefined) })
      try {
        const configInput = { serverName: 'capability_test', transport: 'streamable-http', url: config.url, headers: {} }
        const saved = await ctx.pluginManager.saveManagedMcpServer(configInput)
        const [server] = await ctx.pluginManager.listManagedMcpServers()
        const entry = (await ctx.pluginManager.listPlugins()).find(row => row.patchId === server.id)
        const enabled = await ctx.pluginManager.setPluginEnabled(entry.entryId, true)
        const visible = ctx.tools.schemas(handle.agent).map(tool => tool.name)
        const ping = await ctx.tools.execute({ name: 'mcp__capability_test__ping', arguments: {}, agent: handle.agent,
          callId: 'managed-ping', signal: new AbortController().signal })
        const removed = await ctx.pluginManager.removeManagedMcpServer(server.id)
        return { managed: { saved, server, enabled, visible, ping, removed,
          remaining: ctx.tools.schemas(handle.agent).map(tool => tool.name) } }
      } finally { await handle.dispose() }
    }
    const handles = []
    let activeSession
    let answer = 'rejected'
    const approvals = []
    const disposeApproval = ctx.on('approval/request', (request, next) => {
      if (request.toolName !== 'plugin_manager') return next()
      approvals.push(answer)
      return Promise.resolve(answer)
    }, { prepend: true })
    const make = async id => {
      const handle = await ctx.agents.create({ sessionId: id, cwd: process.cwd(),
        setup: scope => ctx.agentPresets.mount(scope, 'cordis').then(() => undefined) })
      handles.push(handle)
      return handle.agent
    }
    const names = agent => ctx.tools.schemas(agent).map(tool => tool.name)
    try {
      const first = await make(`${phase}-first`)
      const before = names(first)
      const manage = args => ctx.tools.execute({ name: 'plugin_manager', arguments: args, agent: first,
        callId: `${phase}-manage`, signal: new AbortController().signal })
      ctx.permissionPresets.set(first.session, 'workspace-write')
      first.session.append('turn/start', { turn: 1 })
      activeSession = first.session
      const denied = await manage({ action: 'install_bundle', target: config.bundle })
      const afterDenied = names(first)
      const bundlesAfterDenied = await ctx.pluginManager.listBundles()
      answer = 'allowed-once'
      const result = phase === 'initial'
        ? JSON.parse((await manage({ action: 'install_bundle', target: config.bundle })).value)
        : await ctx.pluginManager.listBundles()
      const second = await make(`${phase}-second`)
      const after = names(first)
      const other = names(second)
      const ping = await ctx.tools.execute({ name: 'mcp__demo__ping', arguments: {}, agent: first,
        callId: `${phase}-ping`, signal: new AbortController().signal })
      const removed = phase === 'restart'
        ? JSON.parse((await manage({ action: 'remove_bundle', target: '@test/creator-mcp' })).value) : undefined
      return { approvals, permission: ctx.permissionPresets.current(first.session), before, denied, afterDenied, bundlesAfterDenied, result, after, other, ping, removed, remaining: names(first) }
    } finally {
      disposeApproval()
      activeSession?.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      await Promise.all(handles.map(handle => handle.dispose()))
    }
  }
}
