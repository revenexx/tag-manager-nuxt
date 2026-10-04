/**
 * Small pure helpers the runtime shares: the editor/preview test, variable
 * substitution, and trigger matching.
 */
import type { ThemeEventEnvelope } from '../events/types'
import type { ContainerTag, ContainerTrigger, ContainerVariable, TriggerConditions } from './types'

/** Hosts that count as editor context — the same default as the consent module's `editorHosts`. */
export const DEFAULT_EDITOR_HOSTS: string[] = ['*.theme.rvnxx.site']
/** Path prefixes that count as editor/preview context — the consent module's `editorPaths` default. */
export const DEFAULT_EDITOR_PATHS: string[] = ['/admin', '/preview']

export interface EditorContextOptions {
  /** `*.example.com` matches every subdomain, anything else the exact host. */
  hosts: string[]
  /** A prefix matches itself and everything below it (`/admin`, `/admin/**`). */
  paths: string[]
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '')
  const p = pattern.toLowerCase()
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1
  return h === p
}

/**
 * Editor and preview contexts load no optional script (ADR-0110), in step with
 * the consent module and matched the same way: by default the theme editor
 * host `*.theme.rvnxx.site` and the `/admin/**` and `/preview/**` paths.
 */
export function isEditorOrPreviewContext(host: string, path: string, options: EditorContextOptions = { hosts: DEFAULT_EDITOR_HOSTS, paths: DEFAULT_EDITOR_PATHS }): boolean {
  if (options.hosts.some(pattern => hostMatches(String(host || ''), pattern))) return true
  const clean = String(path || '/').split('?')[0]!.split('#')[0]!
  return options.paths.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`))
}

/** The purpose that needs no decision. Its code is fixed vocabulary (SHARED-CONTRACT). */
export const NECESSARY_PURPOSE = 'necessary'

/** Read a dotted path (`ecommerce.items.0.sku`) out of an object. */
export function readPath(source: unknown, path: string): unknown {
  let cur: unknown = source
  for (const seg of String(path).split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

export interface VariableScope {
  envelope?: ThemeEventEnvelope | null
  page?: { path: string, type?: string } | null
}

const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g
const WHOLE = /^\{\{\s*([a-z][a-z0-9_]*)\s*\}\}$/

function variableValue(v: ContainerVariable | undefined, scope: VariableScope): unknown {
  if (!v) return undefined
  if (v.kind === 'constant') return v.value
  if (v.kind === 'event_field') return scope.envelope ? readPath(scope.envelope, v.path ?? '') : undefined
  if (v.kind === 'page') return scope.page ? readPath(scope.page, v.path ?? '') : undefined
  return undefined
}

/**
 * Substitute `{{code}}` placeholders, recursively. A string that is exactly one
 * placeholder takes the variable's own type (a number stays a number); a
 * placeholder inside a longer string is interpolated as text. An unknown or
 * unresolved variable becomes undefined / an empty string — never the raw
 * placeholder, which would ship `{{x}}` to a vendor.
 */
export function substitute<T>(value: T, variables: ContainerVariable[], scope: VariableScope): T {
  const byCode = new Map(variables.map(v => [v.code, v]))
  const walk = (val: unknown): unknown => {
    if (typeof val === 'string') {
      const whole = WHOLE.exec(val)
      if (whole) return variableValue(byCode.get(whole[1]!), scope)
      return val.replace(PLACEHOLDER, (_m, code: string) => {
        const r = variableValue(byCode.get(code), scope)
        return r == null ? '' : String(r)
      })
    }
    if (Array.isArray(val)) return val.map(walk)
    if (val && typeof val === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(val)) out[k] = walk(v)
      return out
    }
    return val
  }
  return walk(value) as T
}

function conditionsMatch(c: TriggerConditions | undefined, page: { path: string, type?: string } | null, b2b: boolean | null): boolean {
  if (!c) return true
  if (c.path_prefixes?.length && !(page && c.path_prefixes.some(p => page.path.startsWith(p)))) return false
  if (c.page_types?.length && !(page?.type && c.page_types.includes(page.type))) return false
  if (typeof c.b2b === 'boolean' && b2b !== c.b2b) return false
  return true
}

/** Does this trigger fire for a page view of `page`? */
export function pageTriggerMatches(t: ContainerTrigger, page: { path: string, type?: string }, b2b: boolean | null): boolean {
  return t.kind === 'page_view' && conditionsMatch(t.conditions, page, b2b)
}

/** Does this trigger fire for this theme event? */
export function eventTriggerMatches(t: ContainerTrigger, envelope: ThemeEventEnvelope): boolean {
  return t.kind === 'theme_event' && t.event_name === envelope.event
    && conditionsMatch(t.conditions, envelope.page, envelope.customer?.b2b ?? null)
}

/** Whether a tag should be active on this page, before any event happens. */
export function tagWantedOnPage(tag: ContainerTag, page: { path: string, type?: string }, b2b: boolean | null): boolean {
  if (tag.every_page) return true
  return tag.triggers.some(t => pageTriggerMatches(t, page, b2b))
}
