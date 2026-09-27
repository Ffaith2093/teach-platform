import { z } from "zod";
import type { Difficulty, QuestionType } from "@prisma/client";

const drawRuleSchema = z.object({
  type: z.enum(["SINGLE_CHOICE", "FILL_BLANK", "CODE_BLANK", "PROGRAMMING"]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tags: z.array(z.string().min(1)).max(5).optional(),
  count: z.number().int().min(1).max(50),
  scorePerQuestion: z.number().int().min(1).max(100),
  questionIds: z.array(z.string()).optional(),
});

export const drawRulesSchema = z.object({
  bankId: z.string().min(1),
  rules: z.array(drawRuleSchema).min(1).max(12),
});

export type DrawRules = z.infer<typeof drawRulesSchema>;
export type DrawPool = Omit<DrawRules, "rules"> & { rules: Array<DrawRules["rules"][number] & { questionIds: string[] }> };
type Candidate = { id: string; type: QuestionType; difficulty: Difficulty; tags: string[] };

export function buildDrawPool(candidates: Candidate[], config: DrawRules): DrawPool {
  const eligible = config.rules.map((rule) => candidates.filter((q) => q.type === rule.type &&
    (!rule.difficulty || q.difficulty === rule.difficulty) &&
    (!rule.tags?.length || rule.tags.every((tag) => q.tags.includes(tag)))).map((q) => q.id));
  const slots = config.rules.flatMap((rule, index) => Array.from({ length: rule.count }, () => index));
  const owner = new Map<string, number>();
  function assign(slot: number, seen: Set<string>): boolean {
    for (const id of eligible[slots[slot]]) {
      if (seen.has(id)) continue;
      seen.add(id);
      const previous = owner.get(id);
      if (previous === undefined || assign(previous, seen)) {
        owner.set(id, slot);
        return true;
      }
    }
    return false;
  }
  for (let slot = 0; slot < slots.length; slot++) {
    if (!assign(slot, new Set())) throw new Error("题库中符合条件的题目不足，或抽题规则之间存在冲突");
  }
  const rules = config.rules.map((rule) => ({ ...rule, questionIds: [] as string[] }));
  for (const [id, slot] of owner) rules[slots[slot]].questionIds.push(id);
  for (const q of candidates) {
    if (owner.has(q.id)) continue;
    const indices = eligible.flatMap((ids, index) => ids.includes(q.id) ? [index] : []);
    if (!indices.length) continue;
    indices.sort((a, b) => rules[a].questionIds.length / rules[a].count - rules[b].questionIds.length / rules[b].count);
    rules[indices[0]].questionIds.push(q.id);
  }
  return { bankId: config.bankId, rules };
}

export function drawQuestionIds(config: DrawRules, random = Math.random): string[] {
  return config.rules.flatMap((rule) => {
    if (!rule.questionIds || rule.questionIds.length < rule.count) {
      throw new Error("抽题池不完整，请联系教师");
    }
    const ids = [...rule.questionIds];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids.slice(0, rule.count);
  });
}

export function drawTotalScore(config: DrawRules): number {
  return config.rules.reduce((sum, rule) => sum + rule.count * rule.scorePerQuestion, 0);
}
