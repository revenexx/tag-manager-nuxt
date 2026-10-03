import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('the events subpath', () => {
  it('imports nothing from Nuxt or Vue, so a theme can emit without the module', () => {
    for (const file of ['emitter', 'validate', 'vocabulary', 'types', 'index']) {
      const src = readFileSync(new URL(`../src/runtime/events/${file}.ts`, import.meta.url), 'utf8')
      expect(src, file).not.toMatch(/from ['"](?:#app|#imports|nuxt|vue|@nuxt\/[^'"]+)['"]/)
    }
  })
})
