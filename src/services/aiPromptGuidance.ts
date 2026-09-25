/** Shared gate: broaden interpretation only when the input itself supplies evidence. */
export function buildCultureAwareInputRule(): string {
  return '- INPUT INTERPRETATION GATE: Before analysis, determine whether the input is ordinary literal language or a culture-bound expression, such as slang, an internet meme, wordplay, a homophone or intentional misspelling, or regional usage; only when contextual or linguistic evidence supports the latter, recover its intended meaning in the source-language community and provide the closest natural target-language equivalent with a brief context note; otherwise follow the ordinary lexical or translation analysis unchanged. This gate changes interpretation only: preserve the existing JSON schema and every field-ownership rule.'
}

/** Shared contract for the native-speaker nuance carried by meaning scene cards. */
export function buildNativeSceneDescription(isMono: boolean): string {
  return isMono
    ? "2-4 sentences from a native speaker's perspective. Open with one clause naming the usual evaluative coloring (positive, negative, neutral, or mixed) and the speaker's stance — then immediately flow into a concrete real-life scene: paint what the person is actually doing, where they are, and what's at stake (motive, constraint, trade-off). Close with one sentence on what a native listener typically feels or infers. If a genuinely confusable near-synonym exists, contrast the observable choice boundary. Distinguish lexical tendency from context-only reading; do not soften an unfavorable implication. The scene is the backbone — NOT a grammar note, NOT just 'used when X', NOT a paragraph about connotation with no picture."
    : '2-4句中文，以母语者视角写。先用半句点明这个义项通常是褒义、贬义、中性还是褒贬混合，然后立刻转入具体生活场景：这个人在做什么、在哪里、为什么——画面感是主体，让读者"看到"这个词的典型时刻。最后一句说母语者听到这个词时通常会推断出什么感受或暗示。若有容易混淆的近义词，用一句给出可观察的选词边界。场景是核心骨架，不得写成以褒贬分析为主、场景只是点缀；禁止只写"用于……时"的功能说明。'
}

export function buildNativeSceneRules(isMono: boolean): string {
  return isMono
    ? `- NATIVE SCENE CONTRACT for every scene.description:
  1. Open with one clause on usual valence (positive / negative / neutral / mixed) and speaker stance — keep it brief, then pivot immediately to a scene.
  2. The scene IS the main body: depict what the person is concretely doing, where, and what's at stake (motive, cost, trade-off, or social tension). Make the reader picture a real moment.
  3. Close with one sentence on the native listener's gut feeling or typical inference.
  4. If a genuinely confusable near-synonym exists, give one observable reason to choose this headword. Do not manufacture a contrast.
  5. Distinguish lexical tendency from context-only reading ("often/can"). Never turn restraint, deprivation, or self-denial into praise unless the word warrants it.
  6. SCENE FIRST — do not write a paragraph about connotation with the scene buried at the end.`
    : `- 每个 scene.description 必须满足"场景为主·语感收尾"契约：
  1. 半句点明褒贬（褒义/贬义/中性/褒贬混合），随即转入场景，不得把褒贬分析写成主体。
  2. 场景是骨架：写出当事人在做什么、在哪里、动机或代价是什么——让读者"看到"这个词的典型时刻。
  3. 最后一句写母语者听到这个词时通常会产生什么感受或推断。
  4. 若有容易混淆的近义词，一句给出可观察的选词边界；没有则不要硬造。
  5. 区分"词本身通常暗示"与"特定语境可能解读"；不得把克制、匮乏或算计包装成积极品质。
  6. 禁止写成先大篇讲褒贬、场景只有一句话点缀的结构。`
}
