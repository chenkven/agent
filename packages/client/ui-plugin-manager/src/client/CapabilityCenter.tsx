/** Skill, MCP, Prompt, and plugin management in the Web main panel. */
import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ManagedMcpConfig } from '@deepseek-ai/dsh-plugin-manager/types'
import type { PluginManagerPageProps } from './PluginManagerPage.tsx'
import { PluginManagerPage } from './PluginManagerPage.tsx'
import { AgentsPanel } from './AgentsPanel.tsx'
import type { CapabilityFace, CapabilityMcp, CapabilityTab } from './capability-store.ts'
import css from './CapabilityCenter.module.css'

export type CapabilityCenterProps = PluginManagerPageProps & InjectFace<CapabilityFace> & PropsRenderSlots<'capabilities.models'>

function objectFields(text: string, errorText: string): Record<string, string> {
  const value: unknown = JSON.parse(text)
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.values(value).some(item => typeof item !== 'string')) throw new Error(errorText)
  return value as Record<string, string>
}

function McpEditor({ row, t, busy, onCancel, onSave }: {
  row: CapabilityMcp | undefined
  t: CapabilityCenterProps['t']
  busy: boolean
  onCancel: () => void
  onSave: (config: ManagedMcpConfig, id?: string) => Promise<boolean>
}): ReactNode {
  const config = row?.config
  const [name, setName] = useState(config?.serverName ?? '')
  const [transport, setTransport] = useState<'streamable-http' | 'stdio'>(config?.transport ?? 'streamable-http')
  const [url, setUrl] = useState(config?.transport === 'streamable-http' ? config.url : '')
  const [headers, setHeaders] = useState(JSON.stringify(config?.transport === 'streamable-http' ? config.headers : {}, null, 2))
  const [command, setCommand] = useState(config?.transport === 'stdio' ? config.command : '')
  const [args, setArgs] = useState(JSON.stringify(config?.transport === 'stdio' ? config.args : [], null, 2))
  const [env, setEnv] = useState(JSON.stringify(config?.transport === 'stdio' ? config.env : {}, null, 2))
  const [cwd, setCwd] = useState(config?.transport === 'stdio' ? config.cwd : '')
  const [error, setError] = useState<string | null>(null)
  return <form className={css.editor} onSubmit={(event) => {
    event.preventDefault()
    try {
      const next: ManagedMcpConfig = transport === 'streamable-http'
        ? { serverName: name.trim(), transport, url: url.trim(), headers: objectFields(headers, t('centerExpectedObject')) }
        : { serverName: name.trim(), transport, command: command.trim(), args: (() => {
          const parsed: unknown = JSON.parse(args)
          if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error(t('centerExpectedArray'))
          return parsed as string[]
        })(), env: objectFields(env, t('centerExpectedObject')), cwd: cwd.trim() }
      setError(null)
      void onSave(next, row?.managedId).then((saved) => { if (saved) onCancel() })
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }}>
    <h2>{t(row === undefined ? 'centerAddMcp' : 'centerEditMcp')}</h2>
    <label>{t('centerServerName')}<input required maxLength={32} pattern="[A-Za-z0-9_-]+" value={name} onChange={(event) =>{  setName(event.target.value) }} /></label>
    <label>{t('centerTransport')}<select value={transport} onChange={(event) =>{  setTransport(event.target.value as typeof transport) }}>
      <option value="streamable-http">{t('centerHttpTransport')}</option><option value="stdio">{t('centerStdioTransport')}</option>
    </select></label>
    {transport === 'streamable-http' ? <>
      <label>{t('centerUrl')}<input required type="url" value={url} onChange={(event) =>{  setUrl(event.target.value) }} placeholder={t('centerUrlPlaceholder')} /></label>
      <label>{t('centerHeaders')}<textarea spellCheck={false} value={headers} onChange={(event) =>{  setHeaders(event.target.value) }} /></label>
    </> : <>
      <p className={css.hint}>{t('centerStdioWarning')}</p>
      <label>{t('centerCommand')}<input required value={command} onChange={(event) =>{  setCommand(event.target.value) }} /></label>
      <label>{t('centerArgs')}<textarea spellCheck={false} value={args} onChange={(event) =>{  setArgs(event.target.value) }} /></label>
      <label>{t('centerEnv')}<textarea spellCheck={false} value={env} onChange={(event) =>{  setEnv(event.target.value) }} /></label>
      <label>{t('centerCwd')}<input value={cwd} onChange={(event) =>{  setCwd(event.target.value) }} /></label>
    </>}
    {error === null ? null : <p role="alert" className={css.error}>{t('centerInvalidJson')}: {error}</p>}
    <div className={css.actions}><button type="submit" disabled={busy}>{t('centerSaveMcp')}</button>
      <button type="button" onClick={onCancel}>{t('cancel')}</button></div>
  </form>
}

/** Render inventories selected from the sidebar's single capability entry. */
export function CapabilityCenter(props: CapabilityCenterProps): ReactNode {
  const state = props.useCapabilityCenter(snapshot => snapshot)
  const [confirmPermission, setConfirmPermission] = useState<string | null>(null)
  const [editingMcp, setEditingMcp] = useState<string | null>(null)
  const [confirmingMcp, setConfirmingMcp] = useState<string | null>(null)
  useEffect(() => { props.refreshCapabilities() }, [props.refreshCapabilities])
  const { t } = props
  const sessionId = state.selected !== undefined && state.sessions.some(row => row.id === state.selected)
    ? state.selected : state.sessions[0]?.id
  const selectedSession = state.sessions.find(row => row.id === sessionId)
  const tabs: readonly { id: CapabilityTab; label: string }[] = [
    { id: 'skills', label: t('centerSkills') }, { id: 'mcp', label: t('centerMcp') },
    { id: 'prompts', label: t('centerPrompts') }, { id: 'permissions', label: t('centerPermissions') },
    { id: 'models', label: t('centerModels') }, { id: 'agents', label: t('centerAgents') }, { id: 'plugins', label: t('centerPlugins') },
  ]
  return <section className={css.center} data-capability-center>
    <header className={css.header}>
      <div><h1>{t('centerTitle')}</h1><p>{t('centerIntro')}</p></div>
      {state.tab === 'plugins' || state.tab === 'models' ? null : <button type="button" onClick={props.refreshCapabilities}>{t('refresh')}</button>}
    </header>
    <nav className={css.tabs} aria-label={t('centerTitle')}>
      {tabs.map(item => <button key={item.id} type="button" aria-current={state.tab === item.id ? 'page' : undefined}
        onClick={() =>{  props.selectCapabilityTab(item.id) }}>{item.label}</button>)}
    </nav>
    {state.tab === 'plugins' ? <PluginManagerPage {...props} /> : <div className={css.body}>
      {state.tab === 'models' ? props.renderSlot('capabilities.models', {}) : null}
      {state.tab === 'agents' ? <AgentsPanel {...props} state={state} /> : null}
      {state.tab === 'permissions' ? <>
        <p className={css.hint}>{t('centerPermissionHint')}</p>
        <label className={css.selector}>{t('centerChooseSession')}<select value={sessionId ?? ''}
          onChange={(event) => { setConfirmPermission(null); props.selectCapabilitySession(event.target.value) }}>
          {state.sessions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select></label>
        <p className={css.scope}>{t('centerPermissionCurrent')}: {state.permissions?.current ?? t('centerNoPermissionSession')}</p>
        <p className={css.scope}>{t('centerPermissionDefault')}: {state.permissions?.defaultPreset}</p>
        <ul className={css.cards}>{state.permissions?.options.map(option => <li className={css.card} key={option.value}>
          <div className={css.cardTop}><h2>{option.name}</h2>
            {state.permissions?.current === option.value ? <span className={css.badge}>{t('centerPermissionCurrent')}</span> : null}</div>
          <p>{option.value === 'read-only' ? t('centerPermissionReadOnly') : option.value === 'workspace-write'
            ? t('centerPermissionWorkspace') : option.value === 'danger-full-access' ? t('centerPermissionFull')
              : option.description ?? option.value}</p>
          <button type="button" disabled={state.busy !== null || state.loading || state.permissions?.current === null
            || state.permissions?.current === option.value} onClick={() => {
            if (option.value === 'danger-full-access' || option.value === 'auto') setConfirmPermission(option.value)
            else props.selectCapabilityPermission(option.value)
          }}>{t('centerPermissionSwitch')}</button>
          {confirmPermission === option.value ? <div className={css.confirm}>
            <p>{t('centerPermissionConfirm')}</p><div className={css.actions}>
              <button type="button" onClick={() => { props.selectCapabilityPermission(option.value); setConfirmPermission(null) }}>
                {t('centerPermissionAccept')}</button>
              <button type="button" onClick={() =>{  setConfirmPermission(null) }}>{t('cancel')}</button>
            </div></div> : null}
        </li>)}</ul>
      </> : null}
      {state.tab === 'skills' ? <>
        <p className={css.hint}>{t('centerSkillHint')}</p>
        {state.sessions.length === 0 ? <p className={css.empty}>{t('centerNoSession')}</p> : <>
          <label className={css.selector}>{t('centerChooseSession')}<select value={sessionId} onChange={(event) =>{  props.selectCapabilitySession(event.target.value) }}>
            {state.sessions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>
          <p className={css.scope}>{t('centerScope')} · {t('centerSession')} · {selectedSession?.title}</p>
          {!state.loading && state.skills.length === 0 ? <p className={css.empty}>{t('centerNoSkills')}</p> : null}
          <ul className={css.cards}>{state.skills.map(skill => <li className={css.card} key={skill.name}>
            <div className={css.cardTop}><h2>/{skill.name}</h2><span className={css.badge}>{t(skill.source === 'project-dsh' || skill.source === 'project-agents' ? 'centerProjectSkill' : 'centerExternalSkill')}</span></div>
            <p>{skill.description}</p>{skill.whenToUse === undefined ? null : <p className={css.detail}>{skill.whenToUse}</p>}
            <div className={css.actions}><button type="button" disabled={!skill.editable || state.busy !== null}
              onClick={() =>{  props.toggleCapabilitySkill(skill.name, skill.modelInvocable, !skill.userInvocable) }}>
              {t('centerUserInvocation')}: {t(skill.userInvocable ? 'centerEnabled' : 'centerInactive')}</button>
            <button type="button" disabled={!skill.editable || state.busy !== null}
              onClick={() =>{  props.toggleCapabilitySkill(skill.name, !skill.modelInvocable, skill.userInvocable) }}>
              {t('centerModelInvocation')}: {t(skill.modelInvocable ? 'centerEnabled' : 'centerInactive')}</button></div>
            {skill.editable ? null : <p className={css.detail}>{t('centerSkillReadOnly')}</p>}
            {skill.path === undefined ? null : <code className={css.path}>{skill.path}</code>}
          </li>)}</ul>
        </>}
      </> : null}
      {state.tab === 'mcp' ? <>
        <p className={css.hint}>{t('centerMcpHint')}</p>
        <button type="button" className={css.addMcp} onClick={() =>{  setEditingMcp('new') }}>{t('centerAddMcp')}</button>{' '}
        <button type="button" className={css.addMcp} onClick={() => { props.selectCapabilityTab('plugins'); props.openInstall() }}>
          {t('centerAddMcpBundle')}
        </button>
        {editingMcp === null ? null : <McpEditor key={editingMcp} row={state.mcp.find(row => row.managedId === editingMcp)}
          t={t} busy={state.busy !== null} onCancel={() =>{  setEditingMcp(null) }} onSave={props.saveCapabilityMcp} />}
        <p className={css.scope}>{t('centerScope')} · {t('centerProfile')}</p>
        {!state.loading && state.mcp.length === 0 ? <p className={css.empty}>{t('centerNoMcp')}</p> : null}
        <ul className={css.cards}>{state.mcp.map(row => <li className={css.card} key={row.id}>
          <div className={css.cardTop}><h2>{row.name}</h2><span className={css.badge}>{t(!row.enabled ? 'centerInactive' : row.phase === 'active' ? 'centerActive' : row.phase === 'failed' ? 'centerFailed' : 'centerPending')}</span></div>
          <p className={css.path}>{row.id}</p>
          <div className={css.actions}><button type="button" disabled={row.readOnly || state.busy !== null} title={row.readOnly ? t('centerManaged') : undefined}
            onClick={() =>{  props.toggleCapabilityMcp(row.id, !row.enabled) }}>{t(row.enabled ? 'centerDisable' : 'centerEnable')}</button>
          {row.managedId === undefined ? null : <><button type="button" disabled={state.busy !== null} onClick={() =>{  setEditingMcp(row.managedId ?? row.id) }}>{t('centerEditMcp')}</button>
            <button type="button" disabled={state.busy !== null} onClick={() =>{  setConfirmingMcp(row.managedId ?? row.id) }}>{t('centerRemoveMcp')}</button></>}</div>
          {confirmingMcp !== row.managedId ? null : <div className={css.confirm}>
            <p>{t('centerRemoveMcpConfirm', { name: row.name })}</p>
            <div className={css.actions}><button type="button" disabled={state.busy !== null} onClick={() => {
              props.removeCapabilityMcp(row.managedId ?? row.id); setConfirmingMcp(null)
            }}>{t('centerRemoveMcp')}</button><button type="button" onClick={() =>{  setConfirmingMcp(null) }}>{t('cancel')}</button></div>
          </div>}
        </li>)}</ul>
      </> : null}
      {state.tab === 'prompts' ? <>
        <p className={css.hint}>{t('centerPromptHint')}</p><p className={css.scope}>{t('centerScope')} · {t('centerFuture')}</p>
        {!state.loading && state.prompts.length === 0 ? <p className={css.empty}>{t('centerNoPrompts')}</p> : null}
        <ul className={css.cards}>{state.prompts.map(row => <li className={css.card} key={row.id}>
          <div className={css.cardTop}><h2>{row.name}</h2>{row.isDefault ? <span className={css.badge}>{t('centerDefault')}</span> : null}</div>
          {row.description === undefined ? null : <p>{row.description}</p>}
          {row.broken === undefined ? null : <p className={css.error}>{row.broken}</p>}
          <div className={css.actions}><button type="button" disabled={state.busy !== null} onClick={() =>{  props.viewCapabilityPrompt(row.id) }}>
            {t(state.source?.id === row.id ? 'centerHide' : 'centerView')}</button>
          <button type="button" disabled={row.isDefault || row.broken !== undefined || state.busy !== null}
            onClick={() =>{  props.makeDefaultCapabilityPrompt(row.id) }}>{t(row.isDefault ? 'centerDefault' : 'centerMakeDefault')}</button></div>
          {state.source?.id === row.id ? <pre className={css.source}>{state.source.text}</pre> : null}
        </li>)}</ul>
      </> : null}
      {state.loading ? <p role="status" className={css.empty}>{t('centerLoading')}</p> : null}
      {state.notice === null ? null : <p role="status" className={css.hint}>{t('centerRestartRequired')}</p>}
      {state.error === null ? null : <p role="alert" className={css.error}>{t('centerUnavailable', { reason: state.error })}</p>}
    </div>}
  </section>
}
