/** Models editor shared by Settings and the capability center. */
import type { ReactNode } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './slot-contract.ts'

/**
 * Render an independent editor draft backed by the plugin's shared inventory.
 * @param props - factory rendering supplied by the owning slot.
 * @returns the shared Models editor.
 */
export function ModelsPanel(props: PropsRenderFactories): ReactNode {
  return props.renderFactorySlot('settings.models.editor', {})
}
