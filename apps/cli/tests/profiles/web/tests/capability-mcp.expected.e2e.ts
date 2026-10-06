/** Capability-center MCP edits in a real Web profile and agent composition. */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { startHttpMcpFixture } from '../../../../../../packages/mcp/mcp-client/tests/http-fixture.ts'

const repo = fileURLToPath(new URL('../../../../../../', import.meta.url))

interface ManagedObservation {
  result?: { managed?: {
    saved: { application: string
      changed: boolean }
    server: { enabled: boolean }
    enabled: { application: string
      changed: boolean }
    visible: string[]
    ping: unknown
    removed: { application: string
      changed: boolean }
    remaining: string[]
  }
  skill?: { before: { editable: boolean
    modelInvocable: boolean
    userInvocable: boolean }
  after: { editable: boolean
    modelInvocable: boolean
    userInvocable: boolean } } }
  error?: string
}

it('adds a disabled MCP connection, enables its tool, and removes it from a live Web profile', async (test) => {
  const root = await mkdtemp(join(tmpdir(), 'capability-mcp-'))
  test.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const mcp = await startHttpMcpFixture()
  test.onTestFinished(mcp.close)
  const workspace = join(root, 'workspace')
  await mkdir(workspace)
  const skillDir = join(workspace, '.agents', 'skills', 'capability-test')
  await mkdir(skillDir, { recursive: true })
  await writeFile(join(skillDir, 'SKILL.md'), '---\nname: capability-test\ndescription: Test project skill\n---\n\nTest instructions.\n')
  const patch = join(root, 'observer.patch.yml')
  await writeFile(patch, JSON.stringify([{ insert: [{ id: 'capability-mcp-observer',
    name: new URL('./fixtures/creator-plugin-manager.mjs', import.meta.url).href, config: { url: mcp.url },
  }] }]))
  const child = spawn(process.execPath, [join(repo, 'apps/cli/lib/bin.js'), '--profile', 'web', '--patch', patch,
    '--port', '0', '--no-open'], { cwd: workspace,
    env: { ...process.env, DSH_HOME: join(root, 'home'), DSH_AGENTS_HOME: join(root, 'agents'),
      DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'keyless-no-model-calls' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  const completion = new Promise<void>((resolve, reject) => {
    child.once('close', () => resolve())
    child.once('error', reject)
  })
  test.onTestFinished(async () => { if (child.exitCode === null) child.kill('SIGTERM')
    await completion })
  for (const stream of [child.stdout, child.stderr]) stream!.on('data', (data) => { output = (output + String(data)).slice(-30_000) })
  await expect.poll(() => {
    if (child.exitCode !== null) throw new Error(output)
    return output.includes('dsh web: http://')
  }, { timeout: 60_000 }).toBe(true)
  const answer = await new Promise<ManagedObservation>((resolve, reject) => {
    child.once('message', (message: { error?: string }) => {
      if (message.error !== undefined) reject(new Error(message.error))
      else resolve(message as ManagedObservation)
    })
    child.send('managed')
  })
  const result = answer.result?.managed
  expect(result?.saved).toMatchObject({ application: 'applied', changed: true })
  expect(result?.server).toMatchObject({ enabled: false })
  expect(result?.enabled).toMatchObject({ application: 'applied', changed: true })
  expect(result?.visible).toContain('mcp__capability_test__ping')
  expect(JSON.stringify(result?.ping)).toContain('pong')
  expect(result?.removed).toMatchObject({ application: 'applied', changed: true })
  expect(result?.remaining).not.toContain('mcp__capability_test__ping')
  expect(mcp.calls).toEqual(['ping'])
  const skill = await new Promise<ManagedObservation>((resolve, reject) => {
    child.once('message', (message: { error?: string }) => {
      if (message.error !== undefined) reject(new Error(message.error))
      else resolve(message as ManagedObservation)
    })
    child.send('skill')
  })
  expect(skill.result?.skill?.before).toMatchObject({ editable: true, modelInvocable: true, userInvocable: true })
  expect(skill.result?.skill?.after).toMatchObject({ editable: true, modelInvocable: false, userInvocable: false })
})
