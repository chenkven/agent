/**
 * Plugin manager, browser half: the **Plugins** entry of the sidebar and the
 * management page it opens in the main column. The page installs, enables,
 * disables, and removes the bundles of the Host's profile through the
 * `pluginManager` Remote and switches their rows in the profile's user layer.
 * A plugin that carries its own configuration renders it on this page through
 * the slots the page declares (`slot-contract.ts`).
 */
import type {} from '@deepseek-ai/dsh-client-product-analytics/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
// Type-only: the root `main` keyed slot the page registers into, declared by
// ui-layout with the panel id brand, and the `sidebar.panellist` list the
// entry registers into, declared by ui-sidebar.
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the forwarded events' own declaration (`$on`'s key face resolves
// through the owning package's client-safe types subpath).
import type {} from '@deepseek-ai/dsh-plugin-manager/types'
import { CapabilityCenter } from './CapabilityCenter.tsx'
import { CapabilityController, capabilityFace, type CapabilityServices } from './capability-store.ts'
import { PluginRefreshToast, type PluginRefreshToastFace } from './PluginRefreshToast.tsx'
import { PluginsPanelIcon } from './PluginsPanelIcon.tsx'
import { configLedgerSource } from './config-ledger.ts'
import { PluginManagerController } from './manager-store.ts'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import { createNavigationStore } from './navigation-store.ts'
import type {} from './slot-contract.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Cross-plugin navigation to the Plugins panel. */
    pluginNavigation: {
      /**
       * Open a bundle's details without changing the current Session.
       * An absent bundle displays the plugin list after loading.
       * @param packageName - npm package name of the bundle.
       */
      openBundle(packageName: string): void
    }
  }
}

export type { PluginManagerPageProps } from './PluginManagerPage.tsx'
export type { ConfigLedger, OfficialItem } from './config-ledger.ts'
export type { PluginManagerFace } from './manager-store.ts'
export type { PluginManagerLocaleKey } from './locales.ts'
export type {
  ConfigPageForm, PluginActivationOwnerProps, PluginConfigViewProps, PluginDetailProps, PluginPackageRef, PluginRowRef, PluginsSubject,
} from './slot-contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Plugin manager tab copy. */
    'pluginManager': PluginManagerLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'pluginManager'

/** The id shared by the sidebar entry and the main panel it opens. */
export const PANEL_ID = 'plugins' as MainPanelId

/** Services required by the sidebar registration and the Remote methods; the inventory says whether the Host manages a profile. */
export const inject = [
  'slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe',
  'remote.skills', 'remote.agentPresets', 'remote.settings', 'remote.permissionPresets', 'remote.session', 'remote.commands', 'sessions', 'configForms', 'layout', 'uiWorkspace',
]

/**
 * Contribute the Plugins entry to the sidebar with the management page it
 * opens, and keep it current on the Host's change events.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-plugin-manager: dictionaries')
  const t = ctx.locale.bind(NS)
  const controller = new PluginManagerController(ctx)
  ctx.effect(() => () => { controller.dispose() }, 'ui-plugin-manager: controller')
  // The Host says when what is installed, enabled, or composed changed — from
  // this page, the CLI, or another browser — and streams install output.
  ctx.effect(() => {
    // A page never rendered holds no snapshot to refresh.
    const refresh = (): void => {
      if (controller.getSnapshot().status !== 'idle') void controller.load()
    }
    const disposers = [
      ctx.remote.$on('plugin-manager/changed', refresh),
      ctx.remote.$on('plugin-manager/install-log', (chunk) => { controller.appendLog(chunk) }),
      ctx.remote.$on('plugin-manager/install-state', (progress) => { controller.installProgress(progress) }),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-plugin-manager: host invalidations')

  // The page is a global panel: it belongs to the profile, not to a Session,
  // and the sidebar's entry selects it. What is installed and switched on is
  // the page's own; a plugin's configuration arrives through the slots the
  // page declares here, so the page never names a configurable plugin.
  const configLedger = configLedgerSource(ctx)
  const face = controller.inject(configLedger, text => ctx.locale.resolveText(text))
  const sessionChoices = (snapshot: ReturnType<typeof ctx.sessions.list.getSnapshot>) =>
    Object.values(snapshot.byId)
      .filter(row => row.origin !== 'subagent')
      .sort((a, b) => Number(a.blank) - Number(b.blank) || b.updatedAt - a.updatedAt)
      .map(row => ({ id: row.id as string, title: row.displayTitle }))
  let lastSessions = ctx.sessions.list.getSnapshot()
  let sessionOptions = sessionChoices(lastSessions)
  const capabilityServices: CapabilityServices = {
    sessions: () => {
      const snapshot = ctx.sessions.list.getSnapshot()
      if (snapshot !== lastSessions) {
        lastSessions = snapshot
        sessionOptions = sessionChoices(snapshot)
      }
      return sessionOptions
    },
    subscribeSessions: listener => ctx.sessions.list.subscribe(listener),
    skills: async (sessionId) => {
      const result = await ctx.remote.skills.manageList({
        sessionId: sessionId as Parameters<typeof ctx.remote.skills.manageList>[0]['sessionId'],
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.skills
    },
    setSkillInvocation: async (sessionId, name, modelInvocable, userInvocable) => {
      const result = await ctx.remote.skills.setInvocation({
        sessionId: sessionId as Parameters<typeof ctx.remote.skills.setInvocation>[0]['sessionId'],
        name, modelInvocable, userInvocable,
      })
      if (!result.ok) throw new Error(result.error.message)
    },
    mcp: async () => {
      const [plugins, managed] = await Promise.all([
        ctx.remote.pluginManager.listPlugins(), ctx.remote.pluginManager.listManagedMcpServers(),
      ])
      if (!plugins.ok) throw new Error(plugins.error.message)
      if (!managed.ok) throw new Error(managed.error.message)
      const owned = new Map(managed.value.map(row => [row.id, row]))
      const visible = plugins.value.filter(row => row.moduleName === '@deepseek-ai/dsh-mcp-client').map((row) => {
        const configured = row.patchId === undefined ? undefined : owned.get(row.patchId)
        return {
          id: row.entryId, name: configured?.config.serverName ?? row.patchId ?? row.entryId,
          enabled: row.enabled, phase: row.fiberPhase, readOnly: row.readOnlyReason !== undefined,
          ...configured === undefined ? {} : { managedId: configured.id, config: configured.config },
        }
      })
      const shown = new Set(visible.map(row => row.managedId))
      return [...visible, ...managed.value.filter(row => !shown.has(row.id)).map(row => ({
        id: row.id, name: row.config.serverName, enabled: row.enabled, phase: null, readOnly: true,
        managedId: row.id, config: row.config,
      }))]
    },
    setMcpEnabled: async (id, enabled) => {
      const result = await ctx.remote.pluginManager.setPluginEnabled(
        id as Parameters<typeof ctx.remote.pluginManager.setPluginEnabled>[0], enabled,
      )
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.application)
      }
      return result.value.application === 'restart-required' ? 'restart-required' : 'applied'
    },
    saveMcp: async (config, id) => {
      const result = await ctx.remote.pluginManager.saveManagedMcpServer(config, id)
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.error?.code ?? result.value.application)
      }
      return result.value.application === 'restart-required' ? 'restart-required' : 'applied'
    },
    removeMcp: async (id) => {
      const result = await ctx.remote.pluginManager.removeManagedMcpServer(id)
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.error?.code ?? result.value.application)
      }
      return result.value.application === 'restart-required' ? 'restart-required' : 'applied'
    },
    agents: async () => {
      const [roles, plugins] = await Promise.all([ctx.remote.pluginManager.agentList(), ctx.remote.pluginManager.listPlugins()])
      if (!roles.ok) throw new Error(roles.error.message)
      if (!plugins.ok) throw new Error(plugins.error.message)
      return roles.value.map((role) => {
        const plugin = plugins.value.find(row => row.patchId === role.id)
        return { ...role, phase: plugin?.fiberPhase ?? null,
          ...plugin === undefined ? {} : { entryId: plugin.entryId },
        }
      })
    },
    models: async () => {
      const catalog = await ctx.remote.session.modelCatalog()
      if (!catalog.ok) throw new Error(catalog.error.message)
      return catalog.value.groups.flatMap(group => group.models.map(model => ({
        provider: group.id, model: model.id, label: `${group.name} / ${model.name}`,
      })))
    },
    agentRuns: async (sessionId) => {
      if (sessionId === undefined) return []
      const projection = await ctx.remote.session.projections({
        sessionId: sessionId as Parameters<typeof ctx.remote.session.projections>[0]['sessionId'],
      })
      if (!projection.ok) throw new Error(projection.error.message)
      return (projection.value?.values.subagentCatalog ?? []).slice(-50).map(row => ({
        id: row.id as string, parentId: sessionId, mode: row.mode, label: row.label ?? row.id as string,
        running: ctx.sessions.list.getSnapshot().byId[row.id]?.running === true,
      }))
    },
    saveAgent: async (config, id) => {
      const result = await ctx.remote.pluginManager.agentSave(config, id)
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.error?.code ?? result.value.application)
      }
      return result.value.application === 'restart-required' ? 'restart-required' : 'applied'
    },
    removeAgent: async (id) => {
      const result = await ctx.remote.pluginManager.agentDelete(id)
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.application === 'failed' || result.value.application === 'overridden') {
        throw new Error(result.value.error?.diagnostic ?? result.value.error?.code ?? result.value.application)
      }
      return result.value.application === 'restart-required' ? 'restart-required' : 'applied'
    },
    delegateAgent: async (sessionId, name, task) => {
      const result = await ctx.remote.session.prompt({
        requestId: randomUUID() as Parameters<typeof ctx.remote.session.prompt>[0]['requestId'],
        sessionId: sessionId as Parameters<typeof ctx.remote.session.prompt>[0]['sessionId'], mode: 'queue',
        content: [{ type: 'text', text: `Delegate this task to the delegate_${name} tool and summarize its result:\n${task}` }],
      })
      if (!result.ok) throw new Error(result.error.message)
    },
    openAgentRun: (run) =>{  ctx.uiWorkspace.openSession({
      parentSessionId: run.parentId as Parameters<typeof ctx.remote.session.projections>[0]['sessionId'],
      childSessionId: run.id as Parameters<typeof ctx.remote.session.projections>[0]['sessionId'], mode: run.mode,
    }) },
    permissions: async (sessionId) => {
      const catalog = await ctx.remote.permissionPresets.catalog()
      if (!catalog.ok) throw new Error(catalog.error.message)
      let current: string | null = null
      if (sessionId !== undefined) {
        const projection = await ctx.remote.session.projections({
          sessionId: sessionId as Parameters<typeof ctx.remote.session.projections>[0]['sessionId'],
        })
        if (!projection.ok) throw new Error(projection.error.message)
        current = projection.value?.values.permissions?.currentValue ?? null
      }
      return { current, defaultPreset: catalog.value.defaultPreset, options: catalog.value.options }
    },
    setPermission: async (sessionId, preset) => {
      const result = await ctx.remote.commands.execute(
        sessionId as Parameters<typeof ctx.remote.commands.execute>[0], `/permission ${preset}`, [],
      )
      if (!result.ok) throw new Error(result.error.message)
      if (result.value === undefined) throw new Error('Permission command unavailable')
      if (result.value.result.kind === 'error') throw new Error(result.value.result.text)
    },
    prompts: async () => {
      const result = await ctx.remote.agentPresets.list()
      if (!result.ok) throw new Error(result.error.message)
      return result.value.presets.map(row => ({
        id: row.id, name: row.name ?? row.id,
        ...row.description === undefined ? {} : { description: row.description },
        isDefault: row.isDefault,
        ...row.broken === undefined ? {} : { broken: row.broken },
      }))
    },
    promptSource: async (id) => {
      const result = await ctx.remote.agentPresets.read(id)
      if (!result.ok) throw new Error(result.error.message)
      return result.value.content
    },
    setDefaultPrompt: async (id) => {
      const result = await ctx.remote.settings.update('agent-preset-registry', { selectedDefault: id }, undefined)
      if (!result.ok) throw new Error(result.error.message)
    },
    subscribeChanges: (listener) => {
      const disposers = [
        ctx.remote.$on('plugin-manager/changed', listener),
        ctx.remote.$on('permission-presets/catalog-changed', listener),
        ctx.remote.$on('agent-preset/selected', listener),
        ctx.remote.$on('settings/document-updated', (ns) => { if (ns === 'agent-preset-registry') listener() }),
        ctx.on('connection/reset', listener),
      ]
      return () => { for (const dispose of disposers) dispose() }
    },
  }
  const capabilityController = new CapabilityController(capabilityServices)
  const capability = capabilityFace(capabilityController)
  ctx.effect(() => () =>{  capabilityController.dispose() }, 'ui-plugin-manager: capability inventory')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'plugin-manager.refresh-toast', locale: NS,
    inject: (): PluginRefreshToastFace => ({
      hooks: { pluginManager: face.hooks.pluginManager },
      dismissNotice: face.dismissNotice,
    }),
  }, PluginRefreshToast))
  ctx.slots.inject('main', function* () {
    const handle = createNavigationStore(), instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    yield ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      store,
      inject: () => ({ ...face, ...capability, hooks: { ...face.hooks, ...capability.hooks } }),
      children: {
        'capabilities.models': { kind: 'single', scope: 'root' },
        'plugins.item': { kind: 'list', scope: 'root' },
        'plugins.bundle.activation': { kind: 'keyed', scope: 'root' },
        'plugins.bundle.config': { kind: 'keyed', scope: 'root' },
        'plugins.row.config': { kind: 'keyed', scope: 'root' },
        'plugins.detail.actions': { kind: 'list', scope: 'root' },
        'plugins.detail.badge': { kind: 'list', scope: 'root' },
        'plugins.detail.section': { kind: 'list', scope: 'root' },
      },
    }, CapabilityCenter)
    yield ctx.layout.panelInfo.subscribe(() => {
      if (ctx.layout.panelInfo.getSnapshot().activePanelId !== PANEL_ID) instance.actions.setView({ kind: 'list' })
    })
    const disposeNavigation = ctx.reflect.provide('pluginNavigation', {
      openBundle: (packageName: string) => {
        capabilityController.selectTab('plugins')
        ctx.layout.selectPanel(PANEL_ID)
        instance.actions.setView({ kind: 'package', name: packageName })
      },
    })
    yield () => { void disposeNavigation() }
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 0,
    label: () => t('panel'),
    locale: NS,
  }, PluginsPanelIcon))

}
