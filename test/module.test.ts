import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { defineNuxtModule, loadNuxt } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

/**
 * The module as Nuxt installs it: the playground app, loaded with its modules
 * set up and `modules:done` run, without a build.
 */
const rootDir = fileURLToPath(new URL('../playground', import.meta.url))
const buildDirs: string[] = []
afterAll(async () => {
  await Promise.all(buildDirs.map(dir => rm(dir, { recursive: true, force: true })))
})

async function setup(overrides: Record<string, unknown> = {}): Promise<Nuxt> {
  const buildDir = await mkdtemp(join(tmpdir(), 'tag-manager-module-'))
  buildDirs.push(buildDir)
  return loadNuxt({ cwd: rootDir, ready: true, dev: false, overrides: { buildDir, ...overrides } })
}

async function buildTemplate(nuxt: Nuxt): Promise<string> {
  const template = nuxt.options.build.templates.find(t => t.filename === 'tag-manager/build.mjs')
  expect(template, 'tag-manager/build.mjs template').toBeDefined()
  return String(await template!.getContents!({ nuxt, app: {} as never, options: {} }))
}

describe('the installed module', () => {
  it('registers the container route and points the plugin at it, both from the build-time endpoint', async () => {
    const nuxt = await setup({ tagManager: { endpoint: '/_shop/tags' } })
    try {
      const routes = nuxt.options.serverHandlers.map(h => h.route)
      expect(routes).toContain('/_shop/tags')
      expect(routes).not.toContain('/_tag-manager/container')
      expect(await buildTemplate(nuxt)).toContain('export const endpoint = "/_shop/tags"')
      // Not runtime config: NUXT_PUBLIC_TAG_MANAGER_ENDPOINT cannot move the fetch away from the route.
      expect(nuxt.options.runtimeConfig.public.tagManager).not.toHaveProperty('endpoint')
    }
    finally {
      await nuxt.close()
    }
  }, 60_000)

  it('exposes the editor hosts and paths as public runtime config, with the consent module\'s defaults', async () => {
    const nuxt = await setup()
    try {
      expect(nuxt.options.runtimeConfig.public.tagManager).toMatchObject({ editorHosts: ['*.theme.rvnxx.site'], editorPaths: ['/admin', '/preview'] })
    }
    finally {
      await nuxt.close()
    }
  }, 60_000)

  it('uses its own composable for a key @nuxt/scripts does not ship', async () => {
    const nuxt = await setup()
    try {
      const contents = await buildTemplate(nuxt)
      expect(contents).toMatch(/import \{ useScriptTawkTo as _r\d \} from ".*\/runtime\/registry\/tawk-to"/)
    }
    finally {
      await nuxt.close()
    }
  }, 60_000)

  it('uses @nuxt/scripts\' own composable everywhere when it ships the key', async () => {
    // Stands in for a @nuxt/scripts release whose registry already has tawkTo:
    // the entry is in the list before any `scripts:registry` hook sees it.
    const upstream = defineNuxtModule({
      meta: { name: 'upstream-tawk-to' },
      setup(_options, nuxt) {
        const hooks = nuxt.hooks as unknown as { callHook: (name: string, ...args: unknown[]) => Promise<unknown> }
        const callHook = hooks.callHook.bind(hooks)
        hooks.callHook = (name, ...args) => {
          if (name === 'scripts:registry') (args[0] as Array<Record<string, unknown>>).push({ registryKey: 'tawkTo', label: 'Tawk.to', import: { name: 'useScriptTawkTo', from: '/upstream/registry/tawk-to' } })
          return callHook(name, ...args)
        }
      },
    })
    const nuxt = await setup({ modules: [upstream] })
    try {
      const contents = await buildTemplate(nuxt)
      expect(contents).toContain('import { useScriptTawkTo as _r2 } from "/upstream/registry/tawk-to"')
      expect(contents).not.toMatch(/runtime\/registry\/tawk-to"/)
      // Its own composables still serve the keys upstream does not ship.
      expect(contents).toMatch(/runtime\/registry\/etracker"/)
    }
    finally {
      await nuxt.close()
    }
  }, 60_000)
})
