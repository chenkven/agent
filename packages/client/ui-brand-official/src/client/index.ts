/** Product brand occupants for the sidebar and empty conversation. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ProductBrandMark, ProductBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Register the sidebar pair and hero independently of their declaring surfaces.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, ProductBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, ProductBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', function* () {
    yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, ProductBrandMark)
  })
}
