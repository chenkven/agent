/** Product name is a proper name and stays the same across locales. */
export const en = { name: 'agent base' } as const
export const zh: Record<keyof typeof en, string> = { name: 'agent base' }
