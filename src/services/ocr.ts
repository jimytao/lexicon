import Tesseract from 'tesseract.js'
import type { TextBlock, TextBlockType, TextDirection } from '../types'

export interface OcrDetection {
  text: string
  bbox: { x: number; y: number; w: number; h: number }
  confidence: number
}

const LANG_MAP: Record<string, string> = {
  'auto': 'jpn+eng',
  '日语': 'jpn',
  '英语': 'eng',
  '韩语': 'kor',
  '法语': 'fra',
}

function toLangCode(uiLang: string): string {
  return LANG_MAP[uiLang] || 'jpn+eng'
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function detectTextRegions(
  imageDataUrl: string,
  sourceLang: string,
  onProgress?: (progress: number) => void,
): Promise<OcrDetection[]> {
  const lang = toLangCode(sourceLang)

  const result = await Tesseract.recognize(imageDataUrl, lang, {
    logger: (info) => {
      if (info.status === 'recognizing text') {
        onProgress?.(info.progress)
      }
    },
  })

  // Use dimensions from Tesseract result to ensure consistency
  const { width, height } = result.data

  const detections: OcrDetection[] = []
  const lines = result.data.lines
  if (!lines) return detections

  for (const line of lines) {
    const text = line.text.trim()
    // Lowered confidence threshold slightly to catch more text in complex backgrounds
    if (!text || line.confidence < 20) continue

    detections.push({
      text,
      confidence: line.confidence,
      bbox: {
        x: line.bbox.x0 / width,
        y: line.bbox.y0 / height,
        w: (line.bbox.x1 - line.bbox.x0) / width,
        h: (line.bbox.y1 - line.bbox.y0) / height,
      },
    })
  }

  return detections
}

function calculateInclusionScore(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0
  const n = needle.toLowerCase().replace(/\s/g, '')
  const h = haystack.toLowerCase().replace(/\s/g, '')
  if (h.includes(n)) return 1.0
  
  // Fuzzy inclusion using character frequency
  const nFreq = new Map<string, number>()
  for (const c of n) nFreq.set(c, (nFreq.get(c) ?? 0) + 1)
  const hFreq = new Map<string, number>()
  for (const c of h) hFreq.set(c, (hFreq.get(c) ?? 0) + 1)
  
  let match = 0
  for (const [c, cnt] of nFreq) {
    match += Math.min(cnt, hFreq.get(c) ?? 0)
  }
  return match / n.length
}

function mergeBboxes(bboxes: Array<{ x: number; y: number; w: number; h: number }>) {
  if (bboxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const b of bboxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function matchBlocksToOcr(
  phase1Blocks: TextBlock[],
  ocrDetections: OcrDetection[],
  sourceLang: string,
): TextBlock[] {
  const usedOcr = new Set<number>()
  const result: TextBlock[] = []
  let fallbackIdx = 0
  
  const isCJK = sourceLang === '日语' || sourceLang === '韩语' || sourceLang === '中文' || sourceLang === 'auto'
  const joiner = isCJK ? '' : ' '

  for (const block of phase1Blocks) {
    const blockText = (block.original || block.translation || '')
    const matchedDetections: OcrDetection[] = []

    // Pass 1: Try to find all OCR lines that are part of this block
    for (let i = 0; i < ocrDetections.length; i++) {
      if (usedOcr.has(i)) continue
      
      const score = calculateInclusionScore(ocrDetections[i].text, blockText)
      // If 75% of characters in this OCR line exist in the AI block text, it's likely a match
      if (score > 0.75) {
        const detection = ocrDetections[i]
        
        // Spatial sanity check: if we already matched some lines, 
        // the new line must be relatively close (within 30% of image size)
        if (matchedDetections.length > 0) {
          const currentBbox = mergeBboxes(matchedDetections.map(d => d.bbox))
          const dist = Math.hypot(
            (detection.bbox.x + detection.bbox.w / 2) - (currentBbox.x + currentBbox.w / 2),
            (detection.bbox.y + detection.bbox.h / 2) - (currentBbox.y + currentBbox.h / 2)
          )
          if (dist > 0.3) continue // Too far away, likely a duplicate text elsewhere
        }
        
        matchedDetections.push(detection)
        usedOcr.add(i)
      }
    }

    if (matchedDetections.length > 0) {
      result.push({
        ...block,
        original: matchedDetections.map(d => d.text.trim()).join(joiner),
        bbox: mergeBboxes(matchedDetections.map(d => d.bbox)),
      })
    } else {
      // Fallback: staggered position
      result.push({
        ...block,
        bbox: { x: 0.05, y: 0.05 + fallbackIdx * 0.08, w: 0.25, h: 0.08 },
      })
      fallbackIdx++
    }
  }

  // Add any OCR detections that weren't matched as new blocks
  for (let i = 0; i < ocrDetections.length; i++) {
    if (!usedOcr.has(i)) {
      const ocr = ocrDetections[i]
      result.push({
        original: ocr.text,
        translation: '',
        type: 'bubble' as TextBlockType,
        direction: 'horizontal' as TextDirection,
        bbox: ocr.bbox,
      })
    }
  }

  return result
}
