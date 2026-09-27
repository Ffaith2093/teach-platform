/**
 * Converts whitespace-delimited test data into one token per input() call.
 * Disabled mode preserves the teacher's stdin data byte-for-byte.
 */
export function prepareJudgeInput(input: string, splitByWhitespace: boolean): string {
  if (!splitByWhitespace) return input;

  const tokens = input.match(/\S+/g);
  return tokens?.length ? `${tokens.join("\n")}\n` : "";
}
