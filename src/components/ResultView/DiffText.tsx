import { useMemo } from 'react'

type DiffType = 'equal' | 'delete' | 'insert'

interface DiffPart {
  type: DiffType
  value: string
}

function tokenize(text: string): string[] {
  if (/\s/.test(text)) {
    return text.match(/\S+|\s+/g) ?? [text]
  }
  return text.split('')
}

function computeDiff(original: string, corrected: string): DiffPart[] {
  const origTokens = tokenize(original)
  const corrTokens = tokenize(corrected)

  const m = origTokens.length
  const n = corrTokens.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origTokens[i - 1] === corrTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const parts: DiffPart[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origTokens[i - 1] === corrTokens[j - 1]) {
      parts.unshift({ type: 'equal', value: origTokens[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'insert', value: corrTokens[j - 1] })
      j--
    } else {
      parts.unshift({ type: 'delete', value: origTokens[i - 1] })
      i--
    }
  }

  return parts
}

interface DiffTextProps {
  original: string
  corrected: string
}

export function DiffText({ original, corrected }: DiffTextProps) {
  const parts = useMemo(() => computeDiff(original, corrected), [original, corrected])

  return (
    <span>
      {parts.map((part, idx) => {
        if (part.type === 'equal') {
          return <span key={idx}>{part.value}</span>
        }
        if (part.type === 'delete') {
          return (
            <span key={idx} className="line-through text-red-400 dark:text-red-500">
              {part.value}
            </span>
          )
        }
        return (
          <span key={idx} className="text-green-500 dark:text-green-400">
            {part.value}
          </span>
        )
      })}
    </span>
  )
}
