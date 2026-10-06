/** Editable delegation roles and the selected parent's durable child catalog. */
import { useState, type ReactNode } from 'react'
import type { ManagedAgentConfig } from '@deepseek-ai/dsh-plugin-manager/types'
import type { CapabilityCenterProps } from './CapabilityCenter.tsx'
import type { CapabilityAgent, CapabilityModel, CapabilityState } from './capability-store.ts'
import css from './CapabilityCenter.module.css'

function AgentEditor({ row, models, t, busy, onSave, onCancel }: {
  row: CapabilityAgent | undefined
  models: readonly CapabilityModel[]
  t: CapabilityCenterProps['t']
  busy: boolean
  onSave: CapabilityCenterProps['saveCapabilityAgent']
  onCancel: () => void
}): ReactNode {
  const [name, setName] = useState(row?.config.name ?? '')
  const [description, setDescription] = useState(row?.config.description ?? '')
  const [persona, setPersona] = useState(row?.config.persona ?? '')
  const [route, setRoute] = useState(row?.config.provider === undefined ? ''
    : JSON.stringify([row.config.provider, row.config.model]))
  const [tools, setTools] = useState(row?.config.tools?.join('\n') ?? '')
  const [noTools, setNoTools] = useState(row?.config.tools?.length === 0)
  const choices = models.map(model => ({ ...model, value: JSON.stringify([model.provider, model.model]) }))
  return <form className={css.editor} onSubmit={(event) => {
    event.preventDefault()
    const model = choices.find(choice => choice.value === route)
    // Preserve a stored route when it is temporarily unavailable in the live catalog.
    const selection = model ?? (route === '' ? undefined : row?.config)
    const allowed = tools.split(/\s+/).filter(Boolean)
    const config: ManagedAgentConfig = { name: name.trim(), description, persona,
      ...selection?.provider === undefined ? {} : { provider: selection.provider, model: selection.model },
      ...noTools ? { tools: [] } : allowed.length === 0 ? {} : { tools: allowed },
    }
    void onSave(config, row?.id).then((saved) => { if (saved) onCancel() })
  }}>
    <h2>{t(row === undefined ? 'centerAgentAdd' : 'centerAgentEdit')}</h2>
    <label>{t('centerAgentName')}<input required maxLength={32} pattern="[a-z][a-z0-9_]*" value={name}
      onChange={(event) =>{  setName(event.target.value) }} /></label>
    <label>{t('centerAgentDescription')}<input required maxLength={512} value={description}
      onChange={(event) =>{  setDescription(event.target.value) }} /></label>
    <label>{t('centerAgentPersona')}<textarea required maxLength={20000} value={persona}
      onChange={(event) =>{  setPersona(event.target.value) }} /></label>
    <label>{t('centerAgentModel')}<select value={route} onChange={(event) =>{  setRoute(event.target.value) }}>
      <option value="">{t('centerAgentInherit')}</option>
      {route === '' || choices.some(choice => choice.value === route) ? null : <option value={route}>
        {row?.config.provider} / {row?.config.model}</option>}
      {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
    </select></label>
    <label>{t('centerAgentTools')}<textarea disabled={noTools} value={tools} onChange={(event) =>{  setTools(event.target.value) }} /></label>
    <label><input type="checkbox" checked={noTools} onChange={(event) =>{  setNoTools(event.target.checked) }} />{t('centerAgentNoTools')}</label>
    <div className={css.actions}><button type="submit" disabled={busy}>{t('centerAgentSave')}</button>
      <button type="button" onClick={onCancel}>{t('cancel')}</button></div>
  </form>
}

/** Management writes target the Host; task submission enters the selected main Agent's inbox. */
export function AgentsPanel(props: CapabilityCenterProps & { readonly state: CapabilityState }): ReactNode {
  const { state, t } = props
  const [editing, setEditing] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [delegating, setDelegating] = useState<string | null>(null)
  const [task, setTask] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const sessionId = state.selected !== undefined && state.sessions.some(row => row.id === state.selected)
    ? state.selected : state.sessions[0]?.id
  return <>
    <p className={css.hint}>{t('centerAgentHint')}</p>
    <div className={css.actions}><button className={css.addMcp} type="button" onClick={() =>{  setEditing('new') }}>
      {t('centerAgentAdd')}</button>
    <button className={css.addMcp} type="button" disabled={state.busy !== null || state.agents.some(row => row.config.name === 'researcher')}
      onClick={() => { void props.saveCapabilityAgent({ name: 'researcher', description: t('centerAgentExampleDescription'),
        persona: t('centerAgentExamplePersona'), tools: ['read', 'glob', 'grep'] }) }}>{t('centerAgentExample')}</button>
    </div>
    {editing === null ? null : <AgentEditor key={editing} row={state.agents.find(row => row.id === editing)} models={state.models}
      t={t} busy={state.busy !== null} onSave={props.saveCapabilityAgent} onCancel={() =>{  setEditing(null) }} />}
    {!state.loading && state.agents.length === 0 ? <p className={css.empty}>{t('centerAgentEmpty')}</p> : null}
    <ul className={css.cards}>{state.agents.map(row => <li className={css.card} key={row.id}>
      <div className={css.cardTop}><h2>{row.config.name}</h2><span className={css.badge}>
        {t(!row.enabled ? 'centerInactive' : row.phase === 'active' ? 'centerAgentReady'
          : row.phase === 'failed' ? 'centerFailed' : 'centerPending')}</span></div>
      <p>{row.config.description}</p><code className={css.path}>delegate_{row.config.name}</code>
      <p>{t('centerAgentModel')}: {row.config.provider === undefined ? t('centerAgentInherit')
        : `${row.config.provider} / ${row.config.model}`}</p>
      <p>{row.config.tools === undefined ? t('centerAgentTools') : row.config.tools.length === 0
        ? t('centerAgentNoTools') : row.config.tools.join(', ')}</p>
      <div className={css.actions}>
        <button type="button" disabled={state.busy !== null} onClick={() =>{  setEditing(row.id) }}>{t('centerAgentEdit')}</button>
        <button type="button" disabled={state.busy !== null || row.entryId === undefined} onClick={() => {
          if (row.entryId !== undefined) props.toggleCapabilityMcp(row.entryId, !row.enabled)
        }}>{t(row.enabled ? 'centerDisable' : 'centerEnable')}</button>
        <button type="button" disabled={state.busy !== null} onClick={() =>{  setRemoving(row.id) }}>{t('centerRemoveMcp')}</button>
        <button type="button" disabled={!row.enabled || row.phase !== 'active' || sessionId === undefined || state.busy !== null}
          onClick={() => { setDelegating(row.config.name); setTask(''); setSubmitted(false) }}>{t('centerAgentDelegate')}</button>
      </div>
      {removing !== row.id ? null : <div className={css.confirm}><p>{t('centerAgentDeleteConfirm')}</p>
        <div className={css.actions}><button type="button" onClick={() => { props.removeCapabilityAgent(row.id); setRemoving(null) }}>
          {t('centerRemoveMcp')}</button><button type="button" onClick={() =>{  setRemoving(null) }}>{t('cancel')}</button></div></div>}
    </li>)}</ul>
    <label className={css.selector}>{t('centerChooseSession')}<select value={sessionId ?? ''}
      onChange={(event) => { props.selectCapabilitySession(event.target.value); setSubmitted(false); setDelegating(null) }}>
      {state.sessions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
    </select></label>
    {delegating === null ? null : <form className={css.editor} onSubmit={(event) => {
      event.preventDefault()
      void props.delegateCapabilityAgent(delegating, task).then((accepted) => { if (accepted) { setSubmitted(true); setDelegating(null) } })
    }}><h2>{t('centerAgentDelegate')}: {delegating}</h2>
      <label>{t('centerAgentTask')}<textarea required value={task} maxLength={16000} onChange={(event) =>{  setTask(event.target.value) }} /></label>
      <div className={css.actions}><button type="submit" disabled={state.busy !== null || sessionId === undefined}>
        {t('centerAgentSubmit')}</button><button type="button" onClick={() =>{  setDelegating(null) }}>{t('cancel')}</button></div>
    </form>}
    {submitted ? <p role="status" className={css.hint}>{t('centerAgentSubmitted')}</p> : null}
    <h2>{t('centerAgentRuns')}</h2>
    {state.agentRuns.length === 0 ? <p className={css.empty}>{t('centerAgentNoRuns')}</p> : null}
    <ul className={css.cards}>{state.agentRuns.map(run => <li className={css.card} key={run.id}>
      <div className={css.cardTop}><h2>{run.label}</h2><span className={css.badge}>
        {t(run.running ? 'centerActive' : 'centerAgentInactive')}</span></div>
      <code className={css.path}>{run.id}</code>
      <button type="button" onClick={() =>{  props.openCapabilityAgentRun(run) }}>{t('centerAgentOpen')}</button>
    </li>)}</ul>
  </>
}
