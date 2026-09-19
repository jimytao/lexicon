/** Shared contract for the native-speaker nuance carried by meaning scene cards. */
export function buildNativeSceneDescription(isMono: boolean): string {
  return isMono
    ? "2-4 sentences from a native speaker's perspective. State the sense's usual evaluative coloring (positive, negative, neutral, mixed, or context-dependent) and the speaker's stance; then show a concrete real-life scene plus the typical motive, constraint, trade-off, or social inference behind it. If a genuinely confusable near-synonym exists, give one observable choice boundary. Distinguish a lexical tendency from a context-only reading; do not force praise or soften an unfavorable implication. NOT a grammar note or merely 'used when X'."
    : '2-4句中文，以母语者视角先说清这个义项通常是褒义、贬义、中性、褒贬混合还是取决于语境，以及说话者带什么态度；再用具体生活场景说明其典型动机、限制、代价或社会暗示。若确有容易混淆的近义词，用一句给出可观察的选词边界。必须区分词本身的通常倾向与特定语境带来的解读，不得为了显得积极而强行美化负面或克制意味；禁止只写“用于……时”的功能说明。'
}

export function buildNativeSceneRules(isMono: boolean): string {
  return isMono
    ? `- NATIVE NUANCE CONTRACT for every scene.description:
  1. Name the usual valence and speaker stance explicitly: positive, negative, neutral, mixed, or context-dependent.
  2. Explain what a native listener would typically infer about the person's motive/state, including any constraint, trade-off, or social implication.
  3. When a genuinely confusable near-synonym exists, contrast the observable reason a native would choose this headword instead. Do not manufacture a contrast.
  4. Separate lexical tendency from contextual possibility (use "often/can" where appropriate). Never turn restraint, deprivation, calculation, or self-denial into generic praise unless the word itself warrants it.`
    : `- 每个 scene.description 必须满足“母语语感契约”：
  1. 明说通常褒贬与说话者态度：褒义、贬义、中性、褒贬混合或取决于语境，不准只写“正面氛围”等空话。
  2. 说明母语者通常会从这个词推断出当事人的动机/状态，以及可能的限制、代价或社会暗示。
  3. 若确有容易混淆的近义词，指出母语者为何在这个可观察情境下选主词；没有可靠边界就不要硬造对比。
  4. 区分“词本身通常暗示”与“特定语境可能解读”，必要时使用“通常/有时/可能”；除非词义确实如此，不得把克制、匮乏、算计或自我牺牲统一包装成积极品质。`
}
