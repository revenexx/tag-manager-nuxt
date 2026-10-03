---
feature: storefront-events
title: Storefront events are one versioned contract
where:
  - The contract — storefront-events/1
  - The emitter — @revenexx/tag-manager-nuxt/events
docs:
  - docs/contract.md
updated: 2026-10-03
---

# Storefront events are one versioned contract

**Storefront events** are the things that happen in a shop, said once in one shape: a product
seen, an item added, an order placed, a quote requested. The theme says them and any number of
listeners hear them — the Tag Manager in the browser today, the Analytics Studio on the server
later. The contract belongs to neither side, which is why it carries a version of its own.

The names follow GA4, because the other vendors map onto it most easily. Three B2B events are
added that GA4 has no word for. The contract carries no personal data at all: the visitor is
two booleans, and every object refuses a field it does not list.

**Every event is one envelope that validates against the version it names, and no envelope can
carry a person.**

## Acceptance criteria

### AC-1 — Every emitted event validates against the schema version it names

- **Given** any emitted event
- **When** it is validated against its schema version
- **Then** it passes
- verify: unit

### AC-2 — add_to_cart fires only for an accepted add

- **Given** an add the cart refuses
- **When** the add returns
- **Then** no add_to_cart is emitted
- **Because** a refused add is not a basket a vendor may count
- verify: todo
- ticket: RAD-183

### AC-3 — purchase fires once per order

- **Given** an order confirmation page reloaded twice
- **When** events are counted
- **Then** exactly one purchase carries that order number as event_id
- verify: unit

### AC-4 — No event carries personal data

- **Given** a signed-in B2B contact
- **When** any event is emitted
- **Then** it holds no email, name, phone, customer number or company name
- verify: unit

### AC-5 — Items carry net and gross where the price is known

- **Given** a priced product
- **When** view_item is emitted
- **Then** its item holds price_net and price_gross
- verify: unit

## Gaps

**Known**

- **Nothing in the theme emits yet.** The emitter and the contract exist here. Calling them at
  each point in the theme is its own ticket, RAD-183, and AC-2 waits for it.
- **A free-text field can still be misused.** A search term that looks like an address or a
  phone number is replaced. A name typed into the search box is not recognisable as one.

## Tickets

- [RAD-178](https://linear.app/revenexx/issue/RAD-178) — the event layer contract and its
  emission in the theme.
