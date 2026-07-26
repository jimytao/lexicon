/** Correct-form (white title) fold threshold — independent of correction-note / why block. */
export const CORRECT_FORM_FOLD_CHARS = 140

/** Only the displayed correctForm drives header fold; never correctionNote length. */
export function isCorrectFormLong(correctForm: string, threshold = CORRECT_FORM_FOLD_CHARS): boolean {
  return correctForm.trim().length > threshold
}
