import { detectLanguage } from '../stores/searchStore'

export type AccentType = 'uk' | 'us'

// Cache audio objects to avoid repeatedly creating them for the same query
const audioCache: Record<string, HTMLAudioElement> = {}
let currentPlayingAudio: HTMLAudioElement | null = null

/**
 * Generate online Youdao pronunciation URL based on language and optional accent (for English)
 */
export function getAudioUrl(word: string, lang: string, accent?: AccentType): string {
  const encoded = encodeURIComponent(word.trim())
  if (lang === 'en') {
    // Youdao: type=1 is UK, type=2 is US
    const type = accent === 'uk' ? '1' : '2'
    return `https://dict.youdao.com/dictvoice?audio=${encoded}&type=${type}`
  } else if (lang === 'ja') {
    return `https://dict.youdao.com/dictvoice?audio=${encoded}&le=ja`
  } else if (lang === 'ko') {
    return `https://dict.youdao.com/dictvoice?audio=${encoded}&le=ko`
  } else if (lang === 'zh') {
    return `https://dict.youdao.com/dictvoice?audio=${encoded}&le=zh`
  }
  return `https://dict.youdao.com/dictvoice?audio=${encoded}`
}

/**
 * Fallback to Web Speech API (TTS) when offline or online audio fails
 */
export function playSpeechTTS(word: string, lang: string, accent?: AccentType): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      return reject(new Error('Web Speech Synthesis (TTS) is not supported in this environment.'))
    }

    // Cancel any ongoing speech synthesis
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(word)
    
    // Map language code to standard BCP 47 tags
    let langTag = 'en-US'
    if (lang === 'en') {
      langTag = accent === 'uk' ? 'en-GB' : 'en-US'
    } else if (lang === 'ja') {
      langTag = 'ja-JP'
    } else if (lang === 'ko') {
      langTag = 'ko-KR'
    } else if (lang === 'zh') {
      langTag = 'zh-CN'
    }
    utterance.lang = langTag

    // Attempt to locate a matching native voice on the device
    const voices = window.speechSynthesis.getVoices()
    const matchingVoice = voices.find(
      (v) =>
        v.lang.toLowerCase() === langTag.toLowerCase() ||
        v.lang.toLowerCase().startsWith(langTag.split('-')[0])
    )
    if (matchingVoice) {
      utterance.voice = matchingVoice
    }

    utterance.onend = () => resolve()
    utterance.onerror = (e) => reject(e)
    
    window.speechSynthesis.speak(utterance)
  })
}

/**
 * Play word pronunciation.
 * Attempts online high-quality Youdao dictvoice audio, falling back to Web Speech TTS on failure or when offline.
 * Resolves the returned Promise when playback completes or fails.
 */
export async function playPronunciation(word: string, accent?: AccentType): Promise<void> {
  if (!word || !word.trim()) return
  
  // Stop currently playing HTML5 audio element
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause()
      currentPlayingAudio.currentTime = 0
    } catch (e) {}
    currentPlayingAudio = null
  }

  // Cancel any ongoing Web Speech Synthesis
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel()
    } catch (e) {}
  }

  const lang = detectLanguage(word)
  
  // If we are offline, fallback directly to device TTS
  if (!navigator.onLine) {
    try {
      await playSpeechTTS(word, lang, accent)
      return
    } catch (e) {
      console.warn('Offline TTS playback failed:', e)
      return
    }
  }

  const url = getAudioUrl(word, lang, accent)
  
  return new Promise((resolve) => {
    try {
      let audio = audioCache[url]
      if (!audio) {
        audio = new Audio(url)
        audioCache[url] = audio
      }
      
      currentPlayingAudio = audio
      audio.currentTime = 0

      const cleanUp = () => {
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
        if (currentPlayingAudio === audio) {
          currentPlayingAudio = null
        }
      }

      const onEnded = () => {
        cleanUp()
        resolve()
      }

      const onError = (e: any) => {
        cleanUp()
        console.warn(`Online audio play failed for URL ${url}, falling back to Web Speech API:`, e)
        playSpeechTTS(word, lang, accent)
          .then(resolve)
          .catch(() => resolve())
      }

      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)

      audio.play().catch(onError)
    } catch (err) {
      console.warn(`Failed setup for online audio play, falling back to Web Speech:`, err)
      playSpeechTTS(word, lang, accent)
        .then(resolve)
        .catch(() => resolve())
    }
  })
}
