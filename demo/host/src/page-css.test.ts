import { describe, expect, it } from 'vitest'

import { PAGE_CSS } from './page-css.js'

describe('PAGE_CSS', () => {
  it('styles the watch card and suggestion chips', () => {
    expect(PAGE_CSS).toContain('.watch')
    expect(PAGE_CSS).toContain('.chips')
    expect(PAGE_CSS).toContain('.caps')
  })
})
