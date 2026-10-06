/** Role persistence and delegation through a real Web CLI profile, without provider credentials. */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

interface Observation {
  result?: {
    saved?: { application: string }
    role: { id: string; config: { name: string; tools: string[] } }
    visible: string[]
    description: string
    response: unknown
    started: { id: string; permission: string; sandbox: string; approval: string }[]
    catalog: { childId: string }[]
    requests: { model: string; tools: string[]; messages: string }[]
    removed?: { application: string }
    remaining: string[]
  }
  error?: string
}

it('saves a researcher, delegates with inherited permissions, restores after restart, and removes its tool', async (test) => {
  const root = await mkdtemp(join(tmpdir(), 'capability-agents-'))
  test.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const patch = join(root, 'observer.patch.yml')
  await writeFile(patch, JSON.stringify([{ insert: [{ id: 'role-observer',
    name: new URL('./fixtures/capability-agents.mjs', import.meta.url).href,
  }] }]))
  async function run(phase: 'roles' | 'restored'): Promise<Observation['result']> {
    const repo = fileURLToPath(new URL('../../../../../../', import.meta.url))
    const child = spawn(process.execPath, [join(repo, 'apps/cli/lib/bin.js'), '--profile', 'web',
      '--patch', patch, '--port', '0', '--no-open'], { cwd: workspace,
      env: { ...process.env, DSH_HOME: join(root, 'home'), DSH_AGENTS_HOME: join(root, 'agents'),
        DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'keyless-no-model-calls' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let output = ''
    const done = new Promise<void>((resolve, reject) => {
      child.once('close', () =>{  resolve() })
      child.once('error', reject)
    })
    const close = async (): Promise<void> => { if (child.exitCode === null) child.kill('SIGTERM'); await done }
    test.onTestFinished(close)
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', (data) => { output = (output + String(data)).slice(-30_000) })
    }
    try {
      await expect.poll(() => {
        if (child.exitCode !== null) throw new Error(output)
        return output.includes('dsh web: http://')
      }, { timeout: 60_000 }).toBe(true)
      const observation = await new Promise<Observation>((resolve, reject) => {
        const timer = setTimeout(() =>{  reject(new Error(`Role observer timed out: ${output}`)) }, 30_000)
        child.once('message', (message) => { clearTimeout(timer); resolve(message as Observation) })
        child.send(phase)
      })
      if (observation.error !== undefined) throw new Error(observation.error)
      if (JSON.stringify(observation.result?.response).includes('"isError":true')) {
        throw new Error(`${JSON.stringify(observation.result)}\n${output}`)
      }
      return observation.result
    } finally { await close() }
  }
  const first = await run('roles')
  expect(first?.saved?.application).toBe('applied')
  expect(first?.visible).toContain('delegate_researcher')
  expect(first?.description).toContain('Research with evidence')
  expect(JSON.stringify(first?.response)).toContain('Research complete.')
  expect(first?.requests[0]).toMatchObject({ model: 'mock', tools: ['read', 'subagent'] })
  expect(first?.requests[0]?.messages).toContain('Research sources without editing.')
  expect(first?.started).toHaveLength(1)
  expect(first?.started[0]?.sandbox).toBe('read-only')
  expect(first?.started[0]?.approval).toBe('never')
  expect(first?.catalog[0]?.childId).toBe(first?.started[0]?.id)
  const restored = await run('restored')
  expect(restored?.role).toEqual(first?.role)
  expect(JSON.stringify(restored?.response)).toContain('Research complete.')
  expect(restored?.removed?.application).toBe('applied')
  expect(restored?.remaining).not.toContain('delegate_researcher')
})
