import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatMarkdown } from './ChatMarkdown'

const render = (content: string) => renderToStaticMarkup(createElement(ChatMarkdown, { content }))

describe('ChatMarkdown', () => {
  // A regression here hangs the test run rather than failing it: the bug was a
  // synchronous infinite loop, which froze the whole app window mid-reply.
  it('renders every prefix of a streamed reply', () => {
    const reply = [
      '#### 区别',
      '',
      '| 词 | 意思 |',
      '| --- | :---: |',
      '| parry | **挡开** |',
      '',
      '##### 例句',
      '- 第一条',
      '1. 第二条',
      '> 引用',
      '---',
      '```',
      'code',
      '```',
      '结束',
    ].join('\n')

    for (let end = 0; end <= reply.length; end++) {
      expect(typeof render(reply.slice(0, end))).toBe('string')
    }
  })

  it.each([
    ['table header before its separator', '| 词 | 意思 |'],
    ['table header and newline', '| 词 | 意思 |\n'],
    ['table header and partial separator', '| 词 | 意思 |\n| --'],
    ['bare heading marks', '####'],
    ['heading marks with a trailing space', '#### '],
    ['hash-prefixed word', '#parry'],
    ['lone pipe row between text', '说明\n| only row |\n结束'],
  ])('keeps the text of %s', (_name, content) => {
    expect(render(content)).toContain(content.trim().split('\n')[0])
  })

  it('still upgrades to a table once the separator arrives', () => {
    const html = render('| 词 | 意思 |\n| --- | --- |\n| parry | 挡开 |')
    expect(html).toContain('<table')
    expect(html).toContain('<td')
    expect(html).not.toContain('---')
  })

  it('keeps a table that follows a paragraph', () => {
    const html = render('对比如下：\n| 词 | 意思 |\n| --- | --- |\n| parry | 挡开 |')
    expect(html).toContain('对比如下：')
    expect(html).toContain('<table')
  })
})
