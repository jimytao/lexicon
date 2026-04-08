import type { TextBlock } from '../../types'

interface Props {
  blocks: TextBlock[]
  onUpdateTranslation: (index: number, translation: string) => void
}

export function TranslationList({ blocks, onUpdateTranslation }: Props) {
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">未检测到文字</p>
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => (
        <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">原文</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              block.type === 'sfx' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
              block.type === 'caption' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
              'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
              {block.type === 'sfx' ? '音效' : block.type === 'caption' ? '标注' : '对话'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {block.direction === 'vertical' ? '竖排' : '横排'}
            </span>
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 mb-2">{block.original}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">译文</p>
          <input
            type="text"
            value={block.translation}
            onChange={(e) => onUpdateTranslation(i, e.target.value)}
            placeholder="输入译文"
            className="w-full text-sm px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      ))}
    </div>
  )
}
