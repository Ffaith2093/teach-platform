export type ExamQuestionSelection = {
  kind: "LIBRARY" | "PROGRAMMING";
  id: string;
  score: number;
};

export function normalizeExamQuestionSelections(input: unknown): ExamQuestionSelection[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("请至少选择一道题目");
  }

  const seen = new Set<string>();
  const result: ExamQuestionSelection[] = [];
  for (const value of input) {
    if (!value || typeof value !== "object") throw new Error("题目选择格式错误");
    const row = value as Record<string, unknown>;
    const kind = row.kind;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const score = Number(row.score);
    if (kind !== "LIBRARY" && kind !== "PROGRAMMING") throw new Error("题目类型无效");
    if (!id) throw new Error("题目编号不能为空");
    if (!Number.isInteger(score) || score < 1 || score > 100) {
      throw new Error("每道题分值必须是 1 到 100 的整数");
    }
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ kind, id, score });
  }
  return result;
}
