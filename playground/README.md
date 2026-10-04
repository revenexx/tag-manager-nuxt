# Playground

A minimal Nuxt app that runs `@revenexx/tag-manager-nuxt` from source. It is a reference
example and not part of the package's build or test run.

- `plugins/consent.client.ts` stands in for a consent module. It allows `necessary` at once
  and grants `statistics` after two seconds, so a statistics tag can be seen loading **without**
  a reload.
- `app.vue` emits theme events through `createThemeEvents` (`add_to_cart`, and a `purchase`
  that is only sent once per order) and shows the container version and its hosts.
- `debug: true` logs every decision with the prefix `[revenexx tag-manager]`.

## Run it

From the repository root:

```bash
pnpm install
pnpm dev:prepare
pnpm dev
```

To read a real tenant's published container:

```bash
# playground/.env (never commit it)
NUXT_TAG_MANAGER_TENANT=<your-tenant>
NUXT_TAG_MANAGER_API_KEY=<your-gateway-api-key>
```

Without them the container is empty, and the page shows the event emitter on its own. Open
`/_tag-manager/container` to see what the server received, and append
`?rvx_tm_preview=<token>` to load a draft.
