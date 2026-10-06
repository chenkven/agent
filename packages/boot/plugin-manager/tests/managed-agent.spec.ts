import { expect, it } from 'vitest'
import { validateManagedAgent } from '../src/managed-agent.ts'

const role = { name: 'researcher', description: 'Research', persona: 'Read and cite' }

it('accepts inherited or explicit routes and distinguishes no tools from inherited tools', () => {
  expect(validateManagedAgent(role)).toEqual(role)
  expect(validateManagedAgent({ ...role, tools: [] })).toEqual({ ...role, tools: [] })
  expect(validateManagedAgent({ ...role, provider: 'deepseek-official', model: 'deepseek-chat', tools: ['read'] }))
    .toMatchObject({ provider: 'deepseek-official', model: 'deepseek-chat', tools: ['read'] })
})

it.each([
  { name: '../escape' }, { name: 'X' }, { description: '' }, { persona: '' },
  { provider: 'route' }, { model: 'model' }, { tools: ['read', 'read'] }, { tools: ['invalid name'] },
])('rejects malformed role input before any file write: %j', (invalid) => {
  expect(() => validateManagedAgent({ ...role, ...invalid })).toThrow('invalid-agent')
})
