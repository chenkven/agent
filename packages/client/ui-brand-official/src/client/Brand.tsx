import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en } from './locale.ts'

/**
 * Render the connected-node mark in the sidebar and empty conversation.
 * @param props - Host-supplied mark presentation.
 * @returns the product mark.
 */
export function ProductBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M9 10.5 22 7.5M9 10.5l5 14M22 7.5l2 13M14 24.5l10-4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="9" cy="10.5" r="3.5" fill="currentColor" />
      <circle cx="22" cy="7.5" r="3.5" fill="currentColor" />
      <circle cx="14" cy="24.5" r="3.5" fill="currentColor" />
      <circle cx="24" cy="20.5" r="3.5" fill="currentColor" />
    </svg>
  )
}

/**
 * Render the product name independently from its mark.
 * @returns the product name.
 */
export function ProductBrandName() {
  return <span>{en.name}</span>
}
