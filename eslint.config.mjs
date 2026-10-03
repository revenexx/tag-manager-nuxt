import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    tooling: true,
  },
}).append({
  // The playground is a runnable reference example; it relies on Nuxt's
  // generated globals/types and is not part of the package build or lint.
  ignores: ['dist', 'coverage', 'node_modules', 'playground', '.nuxt', 'scripts/spec-check.mjs'],
}, {
  // Vendor globals (gtag, fbq, _etrackerOnReady, …) have no types worth
  // inventing; the adapters and their tests address them as `any` on purpose.
  files: ['src/runtime/core/adapters.ts', 'src/runtime/core/runtime.ts', 'src/runtime/plugin.ts', 'test/**'],
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
})
