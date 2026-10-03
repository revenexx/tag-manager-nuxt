---
feature: loader
title: The loader obeys the gating rule
where:
  - The module in a theme — modules list after @nuxt/scripts and the consent module
  - The storefront event hook — revenexx:event
docs:
  - docs/index.md
updated: 2026-10-03
---

# The loader obeys the gating rule

**The loader** is the part of the module that decides, on every page, which marketing tag
may load and which storefront event may reach it. It does not decide what the visitor
consented to. That answer comes from the consent provider the consent module registers, and
the loader asks it for every tag and for every event.

Two failures would make the whole product dishonest. A tag that loads before the visitor
agreed is the one a regulator fines. An event that reaches a vendor the visitor objected to is
the same failure arriving later. So the loader asks at the moment a tag would load, and asks
again at the moment an event happens.

**A tag loads only when the consent provider allows its vendor and purpose, and an event reaches
only the tags allowed at that moment.**

## Acceptance criteria

### AC-1 — Without a consent provider only necessary tags load

- **Given** no consent provider registered
- **When** the page renders
- **Then** only tags under the necessary purpose are loaded
- **Because** a theme that forgot the consent module must fail closed, not open
- verify: unit

### AC-2 — A consent tag loads after its purpose is granted

- **Given** a statistics tag and no decision yet
- **When** statistics is granted
- **Then** the tag loads without a page reload
- verify: unit

### AC-3 — An objectable tag loads at once and stops on objection

- **Given** a tag under legitimate interest
- **When** the visitor objects
- **Then** the reloaded page runs without that tag
- **Because** a loaded script cannot be unloaded, so the consent module reloads the page
- verify: unit

### AC-4 — Events reach only allowed tags

- **Given** an allowed and a denied tag that both map add_to_cart
- **When** add_to_cart is emitted
- **Then** only the allowed tag's vendor call is made
- verify: unit

### AC-5 — Early events are delivered once the tag is ready, up to fifty

- **Given** events emitted before an allowed tag finished loading
- **When** the tag is ready
- **Then** the buffered events reach it in order
- **And** at most fifty are held for one tag
- verify: unit

### AC-6 — etracker receives the four e-commerce events by their own names

- **Given** an allowed etracker tag with the default map
- **When** view_item, view_item_list, add_to_cart and purchase are emitted
- **Then** etracker receives viewProduct, viewProductList, insertToBasket and order
- verify: unit

## Gaps

**Known**

- **What a vendor's servers receive is not observed here.** Every criterion stops at the call
  made to the vendor's own global. Whether etracker books the order is a live check against a
  real account.
- **First-party proxying needs the theme's build.** The tenant setting can switch a tag's proxy
  off. Switching it on needs the registry key enabled in the theme's own configuration.

## Tickets

- [RAD-181](https://linear.app/revenexx/issue/RAD-181) — the storefront modules, and the Tag
  Manager loader on @nuxt/scripts.
