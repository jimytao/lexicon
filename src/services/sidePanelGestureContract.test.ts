import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, '../extension/background.ts'), 'utf8')

describe('side panel user gesture contract', () => {
  it('starts sidePanel.open before awaiting pending-query storage', () => {
    const dispatch = source.slice(
      source.indexOf('async function dispatchSelection'),
      source.indexOf('chrome.contextMenus.onClicked'),
    )
    expect(dispatch.indexOf('chrome.sidePanel.open')).toBeGreaterThan(-1)
    expect(dispatch.indexOf('await writePendingQuery')).toBeGreaterThan(
      dispatch.indexOf('chrome.sidePanel.open'),
    )
  })
})