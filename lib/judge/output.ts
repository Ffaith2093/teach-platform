export interface OutputComparisonOptions {
  ignoreWhitespace?: boolean;
  ignorePunctuation?: boolean;
}

const PUNCTUATION_EQUIVALENTS: Readonly<Record<string, string>> = {
  "，": ",",
  "。": ".",
  "！": "!",
  "？": "?",
  "；": ";",
  "：": ":",
  "（": "(",
  "）": ")",
  "【": "[",
  "】": "]",
  "［": "[",
  "］": "]",
  "｛": "{",
  "｝": "}",
  "“": '"',
  "”": '"',
  "‘": "'",
  "’": "'",
  "、": ",",
  "《": "<",
  "》": ">",
  "〈": "<",
  "〉": ">",
  "—": "-",
  "–": "-",
  "…": "...",
  "·": ".",
};

function normalizePunctuation(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint && codePoint >= 0xff01 && codePoint <= 0xff5e) {
      return String.fromCodePoint(codePoint - 0xfee0);
    }
    if (character === "\u3000") return " ";
    return PUNCTUATION_EQUIVALENTS[character] ?? character;
  }).join("");
}

/** Keep the historical loose comparison unless a teacher enables extra rules. */
export function normalizeJudgeOutput(value: string, options: OutputComparisonOptions = {}): string {
  let normalized = value.replace(/\r\n?/g, "\n");
  if (options.ignorePunctuation) normalized = normalizePunctuation(normalized);
  if (options.ignoreWhitespace) return normalized.replace(/\s/gu, "");

  return normalized
    .split("\n")
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n")
    .replace(/^\n+/u, "")
    .replace(/\n+$/u, "");
}

export function outputsEqual(
  actual: string,
  expected: string,
  options: OutputComparisonOptions = {},
): boolean {
  return normalizeJudgeOutput(actual, options) === normalizeJudgeOutput(expected, options);
}
