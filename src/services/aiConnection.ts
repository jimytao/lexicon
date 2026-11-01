export interface AiEndpointConfig {
  providerId?: string
  endpoint: string
}

/** Accept either an API base URL or a pasted standard resource URL. */
export function normalizeAiEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '').replace(/\/(?:chat\/completions|models|responses)$/, '')
}

export function effectiveAiProvider(config: AiEndpointConfig): string {
  try {
    const hosts: Record<string, string> = {
      'api.openai.com': 'openai', 'api.anthropic.com': 'anthropic',
      'generativelanguage.googleapis.com': 'gemini', 'api.groq.com': 'groq',
      'api.moonshot.cn': 'moonshot', 'api.moonshot.ai': 'moonshot',
      'api.perplexity.ai': 'perplexity', 'api.x.ai': 'xai',
    }
    return hosts[new URL(config.endpoint).hostname] ?? config.providerId ?? 'custom'
  } catch { return config.providerId ?? 'custom' }
}

/** Custom compatible servers, including local Ollama/LM Studio, may need no key. */
export function requiresAiApiKey(providerId?: string): boolean {
  return providerId !== 'custom'
}

export function isRetiredAiEndpoint(config: AiEndpointConfig): boolean {
  try { return new URL(config.endpoint).hostname === 'api.lingyiwanwu.com' } catch { return false }
}
