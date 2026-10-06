/** Comment-preserving profile plugin enablement edits. */
import { readFile } from 'node:fs/promises'
import { isMap, isSeq, parseDocument } from 'yaml'
import { loadOptionalPatches } from '@deepseek-ai/dsh-app-boot'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { ManagedMcpConfig, ManagedMcpServer } from './types.ts'

const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'
const MCP_ID_PREFIX = 'capability-mcp-'

async function patchDocument(filename: string) {
  let content: string
  try { content = await readFile(filename, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    content = '[]\n'
  }
  const document = parseDocument(content, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  if (document.errors[0] !== undefined) throw document.errors[0]
  const contents = document.contents
  if (!isSeq(contents)) throw new Error('Profile patch must be a YAML sequence')
  loadOptionalPatches('dsh', filename)
  return { document, items: contents.items }
}

/** Return only dedicated MCP rows, never arbitrary bundle or profile entries. */
export async function readManagedMcpServers(filename: string): Promise<ManagedMcpServer[]> {
  const { document, items } = await patchDocument(filename)
  const entries: ManagedMcpServer[] = []
  for (const item of items) {
    if (!isMap(item)) continue
    const inserted = item.get('insert', true)
    if (!isSeq(inserted) || inserted.items.length !== 1 || !isMap(inserted.items[0])) continue
    const row = inserted.items[0]
    const id = row.get('id')
    if (typeof id !== 'string' || !id.startsWith(MCP_ID_PREFIX) || row.get('name') !== MCP_MODULE) continue
    const configNode = row.get('config', true)
    if (!isMap(configNode)) continue
    const config = configNode.toJSON() as ManagedMcpConfig
    const override = items.findLastIndex((candidate, index) => isMap(candidate) && !candidate.has('insert')
      && document.getIn([index, 'id']) === id
      && (!candidate.has('name') || document.getIn([index, 'name']) === MCP_MODULE)
      && typeof document.getIn([index, 'disabled']) === 'boolean')
    const enabled = override < 0 ? row.get('disabled') !== true : document.getIn([override, 'disabled']) !== true
    entries.push({ id, enabled, config })
  }
  return entries
}

/** Save or remove a dedicated MCP row while preserving adjacent YAML comments. */
export async function writeManagedMcpServer(filename: string, id: string, config?: ManagedMcpConfig): Promise<void> {
  if (!id.startsWith(MCP_ID_PREFIX)) throw new Error('MCP row id is outside the capability center namespace')
  const { document, items } = await patchDocument(filename)
  const index = items.findIndex((item) => {
    if (!isMap(item)) return false
    const inserted = item.get('insert', true)
    return isSeq(inserted) && inserted.items.length === 1 && isMap(inserted.items[0])
      && inserted.items[0].get('id') === id && inserted.items[0].get('name') === MCP_MODULE
  })
  if (config === undefined) {
    if (index < 0) throw new Error('MCP server is not managed by the capability center')
    items.splice(index, 1)
    for (let offset = items.length - 1; offset >= 0; offset--) {
      const item = items[offset]
      if (isMap(item) && !item.has('insert') && document.getIn([offset, 'id']) === id) items.splice(offset, 1)
    }
  } else if (index < 0) {
    document.add({ insert: [{ id, name: MCP_MODULE, config, disabled: true }] })
  } else {
    const item = items[index]
    if (!isMap(item)) throw new Error('MCP patch row changed while editing')
    const inserted = item.get('insert', true)
    if (!isSeq(inserted) || !isMap(inserted.items[0])) throw new Error('MCP patch row changed while editing')
    inserted.items[0].set('config', config)
  }
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
}

/** Replace the last matching override or append one after existing insertions.
 * @param filename Current profile patch file.
 * @param id Unique composition entry id.
 * @param name Module name used to match name-qualified overrides.
 * @param enabled Desired entry enablement.
 * @returns Whether the file changed.
 */
export async function writePluginEnabled(filename: string, id: string, name: string, enabled: boolean): Promise<boolean> {
  let text: string
  try {
    text = await readFile(filename, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    text = '[]\n'
  }
  const document = parseDocument(text, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
  })
  const error = document.errors[0]
  if (error !== undefined) throw error
  if (!isSeq(document.contents)) throw new Error('Profile patch must be a YAML sequence')
  loadOptionalPatches('dsh', filename)
  const items = document.contents.items
  const target = items.findLast((item, index) => {
    if (!isMap(item) || document.getIn([index, 'id']) !== id || item.has('insert')) return false
    const expectedName = document.getIn([index, 'name'])
    return !expectedName || expectedName === name
  })
  if (isMap(target)) {
    if (document.getIn([items.indexOf(target), 'disabled']) === !enabled) return false
    document.setIn([items.indexOf(target), 'disabled'], !enabled)
  } else {
    document.add({ id, disabled: !enabled })
  }
  await writeFileAtomic(filename, String(document), { mode: 0o600 })
  return true
}
