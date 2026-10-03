import { describe, expect, it } from 'vitest'
import { EMPTY_CONTAINER, isDeliveredContainer } from '../src/runtime/core/types'

describe('container shape guard', () => {
  it('accepts the empty container', () => {
    expect(isDeliveredContainer(EMPTY_CONTAINER)).toBe(true)
  })

  it('refuses anything that is not a delivered container', () => {
    for (const answer of [null, undefined, '', '<html></html>', 42, [], {}, { container: {} }, { error: 'x' },
      { container: {}, settings: {}, tags: {}, variables: [], hosts: [] }]) {
      expect(isDeliveredContainer(answer)).toBe(false)
    }
  })
})
