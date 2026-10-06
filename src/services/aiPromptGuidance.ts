import type { NativeLanguageSpec } from './nativeLanguage'

/** Shared gate: broaden interpretation only when the input itself supplies evidence. */
export function buildCultureAwareInputRule(): string {
  return '- INPUT INTERPRETATION GATE: Before analysis, determine whether the input is ordinary literal language or a culture-bound expression, such as slang, an internet meme, wordplay, a homophone or intentional misspelling, or regional usage; only when contextual or linguistic evidence supports the latter, recover its intended meaning in the source-language community and provide the closest natural target-language equivalent with a brief context note; otherwise follow the ordinary lexical or translation analysis unchanged. This gate changes interpretation only: preserve the existing JSON schema and every field-ownership rule.'
}

/** Shared contract for the native-speaker nuance carried by meaning scene cards. */
export function buildNativeSceneDescription(spec: NativeLanguageSpec): string {
  return `2-4 sentences in ${spec.name}, from a native English speaker's perspective. Open with one clause naming the usual evaluative coloring (positive, negative, neutral, or mixed) and the speaker's stance — then immediately flow into a concrete real-life scene: paint what the person is actually doing, where they are, and what's at stake (motive, constraint, trade-off). Close with one sentence on what a native listener typically feels or infers. If a genuinely confusable near-synonym exists, contrast the observable choice boundary. Distinguish lexical tendency from context-only reading; do not soften an unfavorable implication. The scene is the backbone — NOT a grammar note, NOT just 'used when X', NOT a paragraph about connotation with no picture.`
}

export function buildNativeSceneRules(spec: NativeLanguageSpec): string {
  return `- NATIVE SCENE CONTRACT for every scene.description (written in ${spec.name}):
  1. Open with one clause on usual valence (positive / negative / neutral / mixed) and speaker stance — keep it brief, then pivot immediately to a scene.
  2. The scene IS the main body: depict what the person is concretely doing, where, and what's at stake (motive, cost, trade-off, or social tension). Make the reader picture a real moment.
  3. Close with one sentence on the native listener's gut feeling or typical inference.
  4. If a genuinely confusable near-synonym exists, give one observable reason to choose this headword. Do not manufacture a contrast.
  5. Distinguish lexical tendency from context-only reading ("often/can"). Never turn restraint, deprivation, or self-denial into praise unless the word warrants it.
  6. SCENE FIRST — do not write a paragraph about connotation with the scene buried at the end.`
}
