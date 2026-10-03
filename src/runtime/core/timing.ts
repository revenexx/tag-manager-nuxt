/** When a tag with a given load timing may start, in a browser. */
import type { LoadTiming } from './types'

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const

export function browserTiming(w: Window & typeof globalThis): (load: LoadTiming) => Promise<void> {
  let interacted: Promise<void> | null = null
  const firstInteraction = (): Promise<void> => {
    interacted ??= new Promise<void>((resolve) => {
      const done = () => {
        for (const e of INTERACTION_EVENTS) w.removeEventListener(e, done)
        resolve()
      }
      for (const e of INTERACTION_EVENTS) w.addEventListener(e, done, { once: true, passive: true })
    })
    return interacted
  }
  return (load) => {
    if (load === 'immediate') return Promise.resolve()
    if (load === 'interaction') return firstInteraction()
    return new Promise<void>((resolve) => {
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve(), { timeout: 3000 })
      else w.setTimeout(resolve, 1)
    })
  }
}
