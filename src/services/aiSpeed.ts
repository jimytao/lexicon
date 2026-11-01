import { effectiveAiProvider } from './aiConnection'

/**
 * Foreground "speed first" policy: every provider gets an ordered ladder of
 * request patches, lowest reasoning first. A patch the server explicitly rejects
 * (HTTP 400/422 naming one of its fields) is skipped and the next step tried; the
 * step that worked is remembered per endpoint + model so later requests go
 * straight to it. An exhausted ladder means "send no override".
 */
export type SpeedPatch = Record<string, unknown>

interface SpeedConfig {
  endpoint: string
  model: string
  providerId?: string
}

export interface SpeedOptions {
  purpose?: 'interactive' | 'diagnostic'
  /** Settings toggle; undefined counts as on. */
  speedFirst?: boolean
}

const effort = (value: string): SpeedPatch => ({ reasoning_effort: value })
const OPENAI_STYLE = [effort('none'), effort('minimal'), effort('low')]
const THINKING_OFF: SpeedPatch = { thinking: { type: 'disabled' } }

// OpenAI model pages (2026-11): Luna and gpt-5.1+ accept none; gpt-6-astra and
// gpt-6.1-sol reject none / minimal, so low is their floor. Others fall through
// the ladder on the documented 400.
function openAiLadder(id: string): SpeedPatch[] {
  if (/^(?:gpt-[34]|chatgpt-)/.test(id)) return []
  if (/^gpt-6(?:\.\d+)?-(?:astra|sol)(?:-|$)/.test(id)) return [effort('low')]
  return OPENAI_STYLE
}

// Gemini's compatibility layer silently ignores unsupported values instead of
// returning 400, so each family gets its documented floor directly: only 2.5
// Flash can turn thinking off; minimal exists on 3 / 3.6 Flash and Flash-Lite;
// Pro, 3.8 Flash and Gemini 4 bottom out at low.
function geminiLadder(id: string): SpeedPatch[] {
  if (/^gemini-2\.5-flash/.test(id)) return [effort('none')]
  if (/pro|^gemini-3\.8-|^gemini-[4-9]|argon/.test(id)) return [effort('low')]
  return [effort('minimal')]
}

/** Claude models whose default is already no extended thinking. */
const CLAUDE_NO_THINKING_DEFAULT = /^claude-(?:3|(?:haiku|sonnet|opus)-4(?:[.-]|$))/i

function anthropicLadder(model: string): SpeedPatch[] {
  const id = model.trim().toLowerCase()
  if (CLAUDE_NO_THINKING_DEFAULT.test(id)) return []
  const low = { output_config: { effort: 'low' } }
  // Thinking cannot be disabled on these; effort is the only control.
  if (/^claude-(?:opus-5-5|fable|mythos)/.test(id)) return [low]
  // Sonnet 5.5 rejects `disabled`; `between_tools` turns thinking off for a tool-free request.
  if (/^claude-sonnet-5-5/.test(id)) return [{ thinking: { type: 'between_tools' }, ...low }, low]
  // Haiku 5.5, Opus 5, Sonnet 5 and unknown future families.
  return [{ ...THINKING_OFF, ...low }, low]
}

// Moonshot docs (2026-11): K3 / K3.1 cannot disable thinking (default max effort);
// k2.7-code rejects any thinking field; K2.5 / K2.6 accept `disabled`.
function kimiLadder(id: string): SpeedPatch[] {
  if (/^kimi-k3/.test(id)) return [effort('low')]
  if (/^kimi-k2\.7-code/.test(id)) return []
  return [THINKING_OFF]
}

// Zhipu docs (2026-11): GLM-5.3 cannot disable thinking (low is the floor);
// GLM-4.5 .. 5.2 accept `disabled`; glm-4-flash* has no thinking.
function glmLadder(id: string): SpeedPatch[] {
  if (/^glm-5\.3/.test(id)) return [effort('low')]
  if (/^glm-4-/.test(id)) return []
  return [THINKING_OFF, effort('low')]
}

function familyLadder(model: string): SpeedPatch[] {
  const id = model.trim().toLowerCase().replace(/^[^/]+\//, '')
  if (/^(?:gpt-[5-9]|o[134])(?:[.-]|$)/.test(id)) return openAiLadder(id)
  if (/^gemini-/.test(id)) return geminiLadder(id)
  if (/^(?:qwen3|qwq)/.test(id)) return [{ enable_thinking: false }]
  if (/^kimi-/.test(id)) return kimiLadder(id)
  if (/^glm-/.test(id)) return glmLadder(id)
  if (/^deepseek-/.test(id)) return [THINKING_OFF, effort('low')]
  if (/^gpt-oss/.test(id)) return [effort('low')]
  return []
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(endpoint).hostname)
  } catch { return false }
}

/** The ordered patches to try for a foreground request. Empty = no known control. */
export function speedLadder(config: SpeedConfig): SpeedPatch[] {
  const provider = effectiveAiProvider(config)
  const model = config.model.trim()
  const id = model.toLowerCase()
  switch (provider) {
    case 'anthropic': return anthropicLadder(model)
    case 'openai': return openAiLadder(id)
    case 'gemini': return geminiLadder(id.replace(/^models\//, ''))
    // `none` disables reasoning; mandatory reasoners reject it and fall to minimal.
    case 'openrouter':
      return [{ reasoning: { effort: 'none' } }, { reasoning: { effort: 'minimal' } }, { reasoning: { effort: 'low' } }]
    // Groq rejects values outside a model's set with 400: qwen3 takes none, gpt-oss low.
    case 'groq': return [effort('none'), effort('low')]
    // grok-4.3 accepts none; grok-4.5+ cannot disable reasoning (default high).
    case 'xai': return [effort('none'), effort('low')]
    case 'deepseek': return [THINKING_OFF, effort('low')]
    case 'moonshot': return kimiLadder(id)
    case 'zhipu': return glmLadder(id)
    case 'siliconflow': return [{ enable_thinking: false }]
    case 'together': return [{ reasoning: { enabled: false } }, effort('low')]
    case 'mistral': return OPENAI_STYLE
    case 'perplexity': return [{ reasoning: { effort: 'minimal' } }, { reasoning: { effort: 'low' } }]
    // Ollama documents reasoning_effort "none"; unsupported names fall back silently.
    case 'custom': return isLocalEndpoint(config.endpoint) ? [effort('none')] : familyLadder(model)
    default: return []
  }
}

const STORAGE_KEY = 'lexicon.aiSpeedStep.v1'
let memory: Record<string, number> | null = null

function stepKey(config: SpeedConfig): string {
  let host = config.endpoint.trim()
  try { host = new URL(host).host } catch { /* keep raw endpoint */ }
  return `${host}|${config.model.trim().toLowerCase()}`
}

function loadSteps(): Record<string, number> {
  if (memory) return memory
  memory = {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof parsed === 'object' && parsed !== null) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) memory[key] = value
      }
    }
  } catch { /* storage unavailable: keep in-memory only */ }
  return memory
}

function saveStep(config: SpeedConfig, step: number): void {
  const steps = loadSteps()
  const key = stepKey(config)
  if (steps[key] === step) return
  steps[key] = step
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(steps)) } catch { /* in-memory only */ }
}

export function __resetSpeedStepsForTests(): void {
  memory = null
}

export function speedFirstActive(options: SpeedOptions): boolean {
  return options.purpose !== 'diagnostic' && options.speedFirst !== false
}

/** The patch the next foreground request starts with (after remembered fallbacks). */
export function currentSpeedPatch(config: SpeedConfig, options: SpeedOptions): SpeedPatch {
  if (!speedFirstActive(options)) return {}
  const ladder = speedLadder(config)
  return ladder[Math.min(loadSteps()[stepKey(config)] ?? 0, ladder.length)] ?? {}
}

function fieldNames(value: unknown, out: string[] = []): string[] {
  if (typeof value !== 'object' || value === null) return out
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'type') out.push(key)
    fieldNames(nested, out)
  }
  return out
}

/** Only an explicit validation error naming a field of this patch counts as a rejection. */
async function rejectsPatch(response: Response, patch: SpeedPatch): Promise<boolean> {
  if (response.status !== 400 && response.status !== 422) return false
  let detail = ''
  try { detail = await response.clone().text() } catch { return false }
  const names = fieldNames(patch).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return names.length > 0 && new RegExp(`\\b(?:${names.join('|')})\\b`, 'i').test(detail)
}

/** Requests without a ladder go straight through, adding no extra async hops. */
export function withSpeedLadder(
  config: SpeedConfig,
  options: SpeedOptions & { signal?: AbortSignal },
  send: (patch: SpeedPatch) => Promise<Response>,
): Promise<Response> {
  if (!speedFirstActive(options)) return send({})
  const ladder = speedLadder(config)
  if (ladder.length === 0) return send({})
  return climbLadder(config, ladder, options.signal, send)
}

async function climbLadder(
  config: SpeedConfig,
  ladder: SpeedPatch[],
  signal: AbortSignal | undefined,
  send: (patch: SpeedPatch) => Promise<Response>,
): Promise<Response> {
  for (let step = Math.min(loadSteps()[stepKey(config)] ?? 0, ladder.length); ; step++) {
    const patch = ladder[step] ?? {}
    const response = await send(patch)
    if (step < ladder.length && await rejectsPatch(response, patch)) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      saveStep(config, step + 1)
      continue
    }
    if (response.ok) saveStep(config, step)
    return response
  }
}

export type SpeedPolicyKind = 'off' | 'reduced' | 'default-fast' | 'unknown'

/** What Settings tells the user about the current model. */
export function describeSpeedPolicy(config: SpeedConfig, speedFirst: boolean): SpeedPolicyKind {
  if (!speedFirst) return 'off'
  if (speedLadder(config).length > 0) return 'reduced'
  const provider = effectiveAiProvider(config)
  if (provider === 'anthropic' || (provider === 'openai' && config.model.trim())) return 'default-fast'
  return 'unknown'
}
