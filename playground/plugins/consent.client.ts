// A stand-in for @revenexx/consent-manager-nuxt: grants statistics after two seconds.
import { ref } from 'vue'

export default defineNuxtPlugin((nuxtApp) => {
  const granted = new Set<string>(['necessary'])
  const waiters: Array<{ purpose: string, resolve: () => void }> = []
  const provider = {
    ready: Promise.resolve(),
    allows: (_vendor: string, purpose: string) => granted.has(purpose),
    trigger(_vendor: string, purpose: string) {
      const consented = ref(granted.has(purpose))
      const p = new Promise<void>((resolve) => {
        if (consented.value) return resolve()
        waiters.push({ purpose, resolve: () => {
          consented.value = true
          resolve()
        } })
      }) as Promise<void> & { consented: typeof consented }
      p.consented = consented
      return p
    },
    googleSignals: () => ({ ad_storage: 'denied', analytics_storage: granted.has('statistics') ? 'granted' : 'denied', ad_user_data: 'denied', ad_personalization: 'denied', functionality_storage: 'denied', personalization_storage: 'denied', security_storage: 'granted' }) as const,
    onChange: () => () => {},
  }
  setTimeout(() => {
    granted.add('statistics')
    for (const w of waiters.filter(x => x.purpose === 'statistics')) w.resolve()
  }, 2000)
  nuxtApp.provide('consentProvider', provider)
})
