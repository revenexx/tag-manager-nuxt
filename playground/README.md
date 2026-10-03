# Playground

`pnpm dev` runs this app against the module source. Set `NUXT_TAG_MANAGER_TENANT`
and `NUXT_TAG_MANAGER_API_KEY` to read a real tenant's published container; without
them the container is empty and the page shows the event emitter on its own.
`plugins/consent.client.ts` stands in for the consent module and grants `statistics`
after two seconds, so a statistics tag loads without a reload.
