<script setup lang="ts">
import { createThemeEvents } from '../src/runtime/events'

const nuxtApp = useNuxtApp()
const { hosts, container } = useTagManager()

const events = createThemeEvents({
  context: () => ({
    market: 'de',
    locale: 'de-DE',
    currency: 'EUR',
    page: { path: '/p/ls-b16-1p', type: 'product' },
    customer: { authenticated: false, b2b: true },
  }),
  callHook: (name, envelope) => nuxtApp.callHook(name, envelope),
  validate: true,
})

const item = { sku: 'LS-B16-1P', name: 'Leitungsschutzschalter B16 1-polig', brand: 'Hager', category_path: ['Installation', 'Schutzgeräte'], price_net: 4.18, price_gross: 4.97, quantity: 1 }

function addToCart() {
  events.emit('add_to_cart', { ecommerce: { items: [item] } })
}

function purchase() {
  events.emit('purchase', { ecommerce: { transaction_id: 'ORD-000123', value_net: 4.18, value_gross: 4.97, tax: 0.79, shipping: 0, items: [item] } })
}
</script>

<template>
  <main>
    <h1>@revenexx/tag-manager-nuxt playground</h1>
    <p>Container version: {{ container.container.version ?? 'none' }} · hosts: {{ hosts.join(', ') || '—' }}</p>
    <button @click="addToCart">
      add_to_cart
    </button>
    <button @click="purchase">
      purchase (once per order)
    </button>
  </main>
</template>
