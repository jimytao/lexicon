import type { ImageEditorHandle } from './ImageEditor'

interface Props {
  editorRef: React.RefObject<ImageEditorHandle | null>
}

export function ExportButton({ editorRef }: Props) {
  async function handleExport() {
    const blob = await editorRef.current?.exportBlob()
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `translated-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      onClick={handleExport}
      className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white bg-green-500 hover:bg-green-600 transition-colors"
    >
      导出图片
    </button>
  )
}
