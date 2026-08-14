import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Difficulty, QuestionType } from "@prisma/client";

// 共用 schemas（供题库 + 试卷两端复用）
export const singleChoiceSchema = z.object({
  type: z.literal("SINGLE_CHOICE"),
  content: z.string().min(1, "题干不能为空").max(5000),
  options: z
    .array(z.object({ key: z.string().min(1).max(4), text: z.string().min(1, "选项不能为空").max(200) }))
    .min(2, "至少 2 个选项")
    .max(8, "最多 8 个选项"),
  answer: z.string().min(1, "请选择正确答案"),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  tags: z.array(z.string()).default([]),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

export const fillBlankSchema = z.object({
  type: z.literal("FILL_BLANK"),
  content: z.string().min(1, "题干不能为空").max(5000),
  answer: z.array(z.string().min(1, "答案不能为空").max(200)).min(1).max(10),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  tags: z.array(z.string()).default([]),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

export const codeBlankSchema = z.object({
  type: z.literal("CODE_BLANK"),
  content: z.string().min(1, "题干不能为空（含 {{1}} 占位）").max(5000),
  answer: z.array(z.string().min(1).max(500)).min(1).max(10),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  tags: z.array(z.string()).default([]),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

export const programmingSchema = z.object({
  type: z.literal("PROGRAMMING"),
  problemId: z.string().min(1, "请选择编程题"),
  score: z.coerce.number().int().min(1).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("EASY"),
  tags: z.array(z.string()).default([]),
  explanation: z.string().max(2000).optional().or(z.literal("")),
});

export type SingleChoiceInput = z.infer<typeof singleChoiceSchema>;
export type FillBlankInput = z.infer<typeof fillBlankSchema>;
export type CodeBlankInput = z.infer<typeof codeBlankSchema>;
export type ProgrammingInput = z.infer<typeof programmingSchema>;

export type QuestionInput =
  | SingleChoiceInput
  | FillBlankInput
  | CodeBlankInput
  | ProgrammingInput;

// 给定校验过的 input，构造 Question.create 的 data payload（含 type）
export async function buildQuestionData(
  input: QuestionInput,
  scope: { bankId?: string; courseId?: string | null },
) {
  const base = {
    bankId: scope.bankId ?? null,
    courseId: scope.courseId ?? null,
    score: input.score,
    difficulty: input.difficulty,
    tags: input.tags,
    explanation: input.explanation || null,
  };

  if (input.type === "SINGLE_CHOICE") {
    return {
      type: "SINGLE_CHOICE" as QuestionType,
      data: {
        type: "SINGLE_CHOICE" as QuestionType,
        ...base,
        content: input.content,
        options: input.options,
        answer: input.answer,
      },
    };
  }
  if (input.type === "FILL_BLANK") {
    return {
      type: "FILL_BLANK" as QuestionType,
      data: {
        type: "FILL_BLANK" as QuestionType,
        ...base,
        content: input.content,
        answer: input.answer,
      },
    };
  }
  if (input.type === "CODE_BLANK") {
    return {
      type: "CODE_BLANK" as QuestionType,
      data: {
        type: "CODE_BLANK" as QuestionType,
        ...base,
        content: input.content,
        answer: input.answer,
      },
    };
  }
  // PROGRAMMING: wrapper Question 引用 Problem
  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    select: { id: true, title: true, difficulty: true },
  });
  if (!problem) throw new Error("编程题不存在");
  return {
    type: "PROGRAMMING" as QuestionType,
    data: {
      type: "PROGRAMMING" as QuestionType,
      ...base,
      content: problem.title, // 占位
      problemId: problem.id,
      difficulty: input.difficulty ?? (problem.difficulty as Difficulty),
    },
  };
}

export function blankCountFromContent(content: string): number {
  const matches = content.match(/\{\{\s*\d+\s*\}\}/g);
  return matches ? matches.length : 0;
}