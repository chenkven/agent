/** Validate the browser boundary before persisting a delegation role. */
import type { ManagedAgentConfig } from './types.ts'
import { ManagementFailure } from './failure.ts'

/**
 * Validate bounded role fields and paired routes; reject invalid input with ManagementFailure.
 * @param value - untrusted browser configuration
 * @returns normalized role configuration.
 */
export function validateManagedAgent(value: unknown): ManagedAgentConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ManagementFailure('invalid-agent')
  const input = value as Record<string, unknown>
  if (typeof input.name !== 'string'
    || !/^[a-z][a-z0-9_]{0,31}$/.test(input.name)
    || typeof input.description !== 'string' || input.description.trim() === '' || input.description.length > 512
    || typeof input.persona !== 'string' || input.persona.trim() === '' || input.persona.length > 20_000) {
    throw new ManagementFailure('invalid-agent')
  }
  if ((input.provider === undefined) !== (input.model === undefined)
    || input.provider !== undefined && (typeof input.provider !== 'string' || input.provider.trim() === '' || input.provider.length > 128)
    || input.model !== undefined && (typeof input.model !== 'string' || input.model.trim() === '' || input.model.length > 256)
    || input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.length > 64
      || input.tools.some(tool => typeof tool !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(tool))
      || new Set(input.tools).size !== input.tools.length)) throw new ManagementFailure('invalid-agent')
  return { name: input.name, description: input.description.trim(), persona: input.persona.trim(),
    ...input.provider === undefined || input.model === undefined ? {} : { provider: input.provider, model: input.model },
    ...input.tools === undefined ? {} : { tools: [...input.tools as string[]] },
  }
}
