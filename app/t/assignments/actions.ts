"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth/guard";
import { notify } from "@/lib/notifications";

// ========== 教师课程权限工具 ==========

async function requireCourseTeacher(courseId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    throw new Error("仅教师可执行此操作");
  }
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: session.user.id } },
  });
  if (!ct) throw new Error("您不在该课程的教师团队中");
  if (minRole === "OWNER" && ct.role !== "OWNER") {
    throw new Error("仅主讲教师可执行此操作");
  }
  if (minRole === "ASSISTANT" && ct.role !== "OWNER" && ct.role !== "ASSISTANT") {
    throw new Error("权限不足");
  }
  return { session, role: ct.role };
}

// 工具：根据 assignmentId 反查 courseId + 校验权限
async function requireAssignmentAccess(assignmentId: string, minRole: "OWNER" | "ASSISTANT" = "ASSISTANT") {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, courseId: true, publishedAt: true },
  });
  if (!assignment) throw new Error("作业不存在");
  const ctx = await requireCourseTeacher(assignment.courseId, minRole);
  return { assignment, ...ctx };
}

// ========== 创建作业 ==========

const createAssignmentSchema = z.object({
  courseId: z.string().min(1, "请选择课程"),
  chapterId: z.string().optional().or(z.literal("")),
  title: z.string().min(1, "作业标题不能为空").max(100),
  description: z.string().max(2000).optional().or(z.literal("")),
  dueAt: z.string().min(1, "请选择截止时间"),
  allowLate: z.boolean().default(true),
  latePenalty: z.coerce.number().int().min(0).max(100).default(20),
  // 编程题挂载：[{ problemId, score }]
  problems: z
    .array(
      z.object({
        problemId: z.string(),
        score: z.coerce.number().int().min(0).max(1000),
      }),
    )
    .default([]),
  questions: z.array(z.object({
    questionId: z.string().min(1),
    score: z.coerce.number().int().min(1).max(1000),
  })).default([]),
  allowSurvey: z.boolean().default(false),
  surveyPrompt: z.string().max(2000).optional().or(z.literal("")),
  surveyScore: z.coerce.number().int().min(0).max(1000).default(0),
  allowAttachment: z.boolean().default(false),
  allowedFileExtensions: z.array(z.string().regex(/^[a-z0-9]+$/)).max(20).default([]),
  maxFileSizeMb: z.coerce.number().int().min(1).max(100).default(10),
  attachmentScore: z.coerce.number().int().min(0).max(1000).default(0),
  publish: z.boolean().default(false),
});

export type CreateAssignmentState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof createAssignmentSchema>, string>>;
  ok?: true;
  assignmentId?: string;
};

/**
 * 教师创建作业（一次完成基本信息 + 挂载编程题）
 * - publish=false: 创建为草稿（publishedAt=null），可后续编辑
 * - publish=true: 立即发布（publishedAt=now()），不再允许编辑基本信息
 * - problems 可为空，totalScore 从 problems 累加；空时为 0
 */
export async function createAssignmentAction(
  _prev: CreateAssignmentState,
  formData: FormData,
): Promise<CreateAssignmentState> {
  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    return { error: "仅教师可创建作业" };
  }
  const teacherId = session.user.id;

  // 解析 problems（JSON in hidden field）& publish checkbox
  const problemsRaw = formData.get("problems")?.toString() ?? "[]";
  const questionsRaw = formData.get("questions")?.toString() ?? "[]";
  let problems: { problemId: string; score: number }[] = [];
  let questions: { questionId: string; score: number }[] = [];
  try {
    problems = JSON.parse(problemsRaw);
    questions = JSON.parse(questionsRaw);
  } catch {
    return { error: "题目数据格式错误" };
  }

  const parsed = createAssignmentSchema.safeParse({
    courseId: formData.get("courseId"),
    chapterId: formData.get("chapterId") || undefined,
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt"),
    allowLate: formData.get("allowLate") === "on",
    latePenalty: formData.get("latePenalty") || 20,
    problems,
    questions,
    allowSurvey: formData.get("allowSurvey") === "on",
    surveyPrompt: formData.get("surveyPrompt") || undefined,
    surveyScore: formData.get("surveyScore") || 0,
    allowAttachment: formData.get("allowAttachment") === "on",
    allowedFileExtensions: String(formData.get("allowedFileExtensions") ?? "")
      .split(/[,，\s]+/)
      .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean),
    maxFileSizeMb: formData.get("maxFileSizeMb") || 10,
    attachmentScore: formData.get("attachmentScore") || 0,
    publish: formData.get("publish") === "1",
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<CreateAssignmentState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof createAssignmentSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  // 校验：教师必须在该课程团队
  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: parsed.data.courseId, teacherId } },
  });
  if (!ct || (ct.role !== "OWNER" && ct.role !== "ASSISTANT")) {
    return { error: "您无权限在该课程创建作业" };
  }

  // 校验：dueAt 必须晚于 now
  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return { error: "截止时间格式无效" };
  }
  if (dueAt.getTime() < Date.now()) {
    return { fieldErrors: { dueAt: "截止时间须晚于当前时间" } };
  }

  // 校验：所有编程题必须存在（authorId=me 或 isPublic）
  if (problems.length > 0) {
    const valid = await prisma.problem.findMany({
      where: {
        id: { in: problems.map((p) => p.problemId) },
        OR: [{ authorId: teacherId }, { isPublic: true }],
      },
      select: { id: true },
    });
    if (valid.length !== new Set(problems.map((p) => p.problemId)).size) {
      return { error: "部分编程题不可用（需本人创建或公开）" };
    }
  }

  if (questions.length > 0) {
    const valid = await prisma.question.findMany({
      where: {
        id: { in: questions.map((question) => question.questionId) },
        type: { in: ["SINGLE_CHOICE", "FILL_BLANK", "CODE_BLANK"] },
        OR: [
          { courseId: parsed.data.courseId },
          { bank: { ownerId: teacherId } },
        ],
      },
      select: { id: true },
    });
    if (valid.length !== new Set(questions.map((question) => question.questionId)).size) {
      return { error: "部分选择题或填空题不可用" };
    }
  }

  if (parsed.data.allowSurvey && !parsed.data.surveyPrompt?.trim()) {
    return { fieldErrors: { surveyPrompt: "请填写评价问卷内容" } };
  }
  if (parsed.data.allowAttachment && parsed.data.allowedFileExtensions.length === 0) {
    return { fieldErrors: { allowedFileExtensions: "请填写至少一种允许的附件格式" } };
  }
  const hasContent = problems.length > 0 || questions.length > 0 || parsed.data.allowSurvey || parsed.data.allowAttachment;
  if (parsed.data.publish && !hasContent) {
    return { error: "请至少添加一种作业内容后再发布" };
  }

  const totalScore = problems.reduce((s, p) => s + p.score, 0)
    + questions.reduce((s, question) => s + question.score, 0)
    + (parsed.data.allowSurvey ? parsed.data.surveyScore : 0)
    + (parsed.data.allowAttachment ? parsed.data.attachmentScore : 0);

  try {
    const assignmentId = await prisma.$transaction(async (tx) => {
      const a = await tx.assignment.create({
        data: {
          courseId: parsed.data.courseId,
          chapterId: parsed.data.chapterId || null,
          creatorId: teacherId,
          title: parsed.data.title,
          description: parsed.data.description || "",
          dueAt,
          allowLate: parsed.data.allowLate,
          latePenalty: parsed.data.latePenalty,
          totalScore,
          allowSurvey: parsed.data.allowSurvey,
          surveyPrompt: parsed.data.allowSurvey ? parsed.data.surveyPrompt?.trim() || null : null,
          surveyScore: parsed.data.allowSurvey ? parsed.data.surveyScore : 0,
          allowAttachment: parsed.data.allowAttachment,
          allowedFileExtensions: parsed.data.allowAttachment ? parsed.data.allowedFileExtensions : [],
          maxFileSizeMb: parsed.data.maxFileSizeMb,
          attachmentScore: parsed.data.allowAttachment ? parsed.data.attachmentScore : 0,
          publishedAt: parsed.data.publish ? new Date() : null,
        },
      });
      if (problems.length > 0) {
        await tx.assignmentProblem.createMany({
          data: problems.map((p, i) => ({
            assignmentId: a.id,
            problemId: p.problemId,
            score: p.score,
            order: i,
          })),
        });
      }
      if (questions.length > 0) {
        await tx.assignmentQuestion.createMany({
          data: questions.map((question, index) => ({
            assignmentId: a.id,
            questionId: question.questionId,
            score: question.score,
            order: index,
          })),
        });
      }
      return a.id;
    });
    revalidatePath("/t/assignments");
    revalidatePath(`/t/courses/${parsed.data.courseId}`);
    redirect(`/t/assignments/${assignmentId}`);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    throw e;
  }
}

// ========== 修改作业基本信息（仅 DRAFT） ==========

const updateAssignmentSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional().or(z.literal("")),
  dueAt: z.string().min(1),
  allowLate: z.boolean().default(true),
  latePenalty: z.coerce.number().int().min(0).max(100).default(20),
});

export type UpdateAssignmentState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof updateAssignmentSchema>, string>>;
  ok?: boolean;
};

export async function updateAssignmentAction(
  assignmentId: string,
  _prev: UpdateAssignmentState,
  formData: FormData,
): Promise<UpdateAssignmentState> {
  const { assignment } = await requireAssignmentAccess(assignmentId);
  if (assignment.publishedAt) {
    return { error: "已发布的作业不可修改基本信息" };
  }
  const parsed = updateAssignmentSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    dueAt: formData.get("dueAt"),
    allowLate: formData.get("allowLate") === "on",
    latePenalty: formData.get("latePenalty") || 20,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<UpdateAssignmentState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof updateAssignmentSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }
  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return { error: "截止时间格式无效" };
  }
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || "",
      dueAt,
      allowLate: parsed.data.allowLate,
      latePenalty: parsed.data.latePenalty,
    },
  });
  revalidatePath(`/t/assignments/${assignmentId}`);
  return { ok: true };
}

// ========== 添加编程题 ==========

const addProblemSchema = z.object({
  problemId: z.string(),
  score: z.coerce.number().int().min(1).max(1000),
});

export async function addProblemToAssignmentAction(
  assignmentId: string,
  _prev: { error?: string; ok?: boolean } | undefined,
  formData: FormData,
) {
  const { assignment, session } = await requireAssignmentAccess(assignmentId);
  if (assignment.publishedAt) {
    return { error: "已发布的作业不可再修改题目" };
  }

  const parsed = addProblemSchema.safeParse({
    problemId: formData.get("problemId"),
    score: formData.get("score"),
  });
  if (!parsed.success) return { error: "请选择题目并填写分值" };

  // 编程题必须可用（作者本人 or 公开）
  const problem = await prisma.problem.findUnique({
    where: { id: parsed.data.problemId },
    select: { authorId: true, isPublic: true },
  });
  if (!problem || (problem.authorId !== session.user.id && !problem.isPublic)) {
    return { error: "编程题不可用" };
  }

  // 重复检测
  const existing = await prisma.assignmentProblem.findUnique({
    where: { assignmentId_problemId: { assignmentId, problemId: parsed.data.problemId } },
  });
  if (existing) return { error: "该题已在作业中" };

  // 添加并更新 totalScore
  const lastOrder = await prisma.assignmentProblem.findFirst({
    where: { assignmentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastOrder?.order ?? -1) + 1;

  await prisma.$transaction([
    prisma.assignmentProblem.create({
      data: {
        assignmentId,
        problemId: parsed.data.problemId,
        score: parsed.data.score,
        order: nextOrder,
      },
    }),
    prisma.assignment.update({
      where: { id: assignmentId },
      data: { totalScore: { increment: parsed.data.score } },
    }),
  ]);
  revalidatePath(`/t/assignments/${assignmentId}`);
  return { ok: true };
}

export async function removeProblemFromAssignmentAction(
  assignmentId: string,
  problemId: string,
) {
  const { assignment } = await requireAssignmentAccess(assignmentId);
  if (assignment.publishedAt) {
    throw new Error("已发布的作业不可修改题目");
  }
  const ap = await prisma.assignmentProblem.findUnique({
    where: { assignmentId_problemId: { assignmentId, problemId } },
  });
  if (!ap) return;

  await prisma.$transaction([
    prisma.assignmentProblem.delete({
      where: { assignmentId_problemId: { assignmentId, problemId } },
    }),
    prisma.assignment.update({
      where: { id: assignmentId },
      data: { totalScore: { decrement: ap.score } },
    }),
  ]);
  revalidatePath(`/t/assignments/${assignmentId}`);
}

// ========== 发布 / 撤回 ==========

export async function publishAssignmentAction(assignmentId: string) {
  const { assignment } = await requireAssignmentAccess(assignmentId);
  if (assignment.publishedAt) return; // 已是发布态

  const content = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { allowSurvey: true, allowAttachment: true, _count: { select: { problems: true, questions: true } } },
  });
  if (!content || (content._count.problems === 0 && content._count.questions === 0 && !content.allowSurvey && !content.allowAttachment)) {
    throw new Error("请至少添加一种作业内容后再发布");
  }

  // dueAt 必须晚于 now
  const full = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { dueAt: true },
  });
  if (!full || full.dueAt.getTime() < Date.now()) {
    throw new Error("截止时间须晚于当前时间");
  }

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { publishedAt: new Date() },
  });
  revalidatePath(`/t/assignments/${assignmentId}`);
  revalidatePath("/t/assignments");
}

export async function unpublishAssignmentAction(assignmentId: string) {
  const { assignment } = await requireAssignmentAccess(assignmentId);
  if (!assignment.publishedAt) return;

  // 仅当无任何提交时可撤回
  const subCount = await prisma.assignmentSubmission.count({ where: { assignmentId } });
  if (subCount > 0) throw new Error("已有学生提交，无法撤回发布");

  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { publishedAt: null },
  });
  revalidatePath(`/t/assignments/${assignmentId}`);
  revalidatePath("/t/assignments");
}

// ========== 删除（OWNER 专属） ==========

export async function deleteAssignmentAction(assignmentId: string) {
  const { assignment } = await requireAssignmentAccess(assignmentId, "OWNER");

  // 有提交则禁止删除（保护学生成绩）
  if (assignment.publishedAt) {
    const subCount = await prisma.assignmentSubmission.count({ where: { assignmentId } });
    if (subCount > 0) {
      throw new Error("已有学生提交，无法删除。请改用「撤回发布」");
    }
  }

  await prisma.assignment.delete({ where: { id: assignmentId } });
  revalidatePath("/t/assignments");
  redirect("/t/assignments");
}

// ========== 批改学生作业 ==========

const gradeSchema = z.object({
  submissionId: z.string().min(1),
  manualScore: z.coerce
    .number()
    .int()
    .min(0, "分数不能小于 0")
    .max(10000, "分数过大"),
  feedback: z.string().max(2000).optional().or(z.literal("")),
});

export type GradeAssignmentState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof gradeSchema>, string>>;
  ok?: true;
};

export async function gradeAssignmentAction(
  _prev: GradeAssignmentState | undefined,
  formData: FormData,
): Promise<GradeAssignmentState> {
  const parsed = gradeSchema.safeParse({
    submissionId: formData.get("submissionId"),
    manualScore: formData.get("manualScore"),
    feedback: formData.get("feedback") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<GradeAssignmentState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof gradeSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    return { error: "仅教师可批改" };
  }
  const teacherId = session.user.id;

  // 校验：该 submission 属于当前教师有权批改的课程
  const sub = await prisma.assignmentSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          totalScore: true,
          dueAt: true,
          allowLate: true,
          latePenalty: true,
          courseId: true,
          publishedAt: true,
        },
      },
      student: { select: { id: true, name: true } },
    },
  });
  if (!sub) return { error: "提交记录不存在" };
  if (!sub.assignment.publishedAt) {
    return { error: "未发布的作业没有可批改的提交" };
  }

  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: sub.assignment.courseId, teacherId } },
  });
  if (!ct || (ct.role !== "OWNER" && ct.role !== "ASSISTANT")) {
    return { error: "您无权限批改此作业的学生" };
  }

  const rawScore = Math.min(parsed.data.manualScore, sub.assignment.totalScore);
  const late = !!sub.submittedAt && sub.submittedAt > sub.assignment.dueAt;
  const finalScore = late && sub.assignment.allowLate
    ? Math.round(rawScore * (100 - sub.assignment.latePenalty) / 100)
    : rawScore;

  await prisma.assignmentSubmission.update({
    where: { id: parsed.data.submissionId },
    data: {
      manualScore: parsed.data.manualScore,
      finalScore,
      feedback: parsed.data.feedback || null,
      gradedById: teacherId,
      gradedAt: new Date(),
      status: "GRADED",
    },
  });

  // 给学生发批阅通知：标题带作业名，正文带分数 + 评语摘要，跳转作业详情
  const feedback = parsed.data.feedback?.trim() || "";
  const body = feedback
    ? `得分 ${finalScore} / ${sub.assignment.totalScore} · 评语：${feedback.length > 60 ? feedback.slice(0, 60) + "…" : feedback}`
    : `得分 ${finalScore} / ${sub.assignment.totalScore}`;
  await notify({
    userId: sub.studentId,
    title: `作业已批阅：《${sub.assignment.title}》`,
    body,
    href: `/assignments/${sub.assignment.id}`,
    courseId: sub.assignment.courseId,
  });

  revalidatePath(`/t/assignments/${sub.assignment.id}`);
  revalidatePath(`/t/assignments/${sub.assignment.id}/grade`);
  revalidatePath(`/t/grading`);
  revalidatePath(`/assignments/${sub.assignment.id}`);
  revalidatePath(`/notifications`);
  revalidatePath(`/dashboard`);

  return { ok: true };
}

const returnSchema = z.object({
  submissionId: z.string().min(1),
  feedback: z.string().min(1, "退回时必须填写反馈，告诉学生哪里需要修改").max(2000),
});

export type ReturnAssignmentState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof returnSchema>, string>>;
  ok?: true;
};

/**
 * 教师退回学生作业（status → RETURNED）：
 * - 必填反馈（学生收到通知能直接看到需要修改什么）
 * - manualScore / finalScore 置 null（不计入成绩）
 * - 触发学生通知：标题「作业需重做：《{title}》」+ 反馈摘要 + 跳转作业页
 *
 * 退回后学生可在作业详情页继续修改编程题代码并重新提交；
 * ASSIGNMENT 级 status 保留 RETURNED 作为「当前批改周期」标记。
 */
export async function returnAssignmentAction(
  _prev: ReturnAssignmentState | undefined,
  formData: FormData,
): Promise<ReturnAssignmentState> {
  const parsed = returnSchema.safeParse({
    submissionId: formData.get("submissionId"),
    feedback: formData.get("feedback"),
  });
  if (!parsed.success) {
    const fieldErrors: NonNullable<ReturnAssignmentState["fieldErrors"]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof returnSchema>;
      if (key) fieldErrors[key] = issue.message;
    }
    return { error: "请检查输入", fieldErrors };
  }

  const session = await requireSession();
  if (session.user.role !== "TEACHER") {
    return { error: "仅教师可退回作业" };
  }
  const teacherId = session.user.id;

  const sub = await prisma.assignmentSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: {
      assignment: {
        select: {
          id: true,
          title: true,
          courseId: true,
          publishedAt: true,
        },
      },
    },
  });
  if (!sub) return { error: "提交记录不存在" };
  if (!sub.assignment.publishedAt) {
    return { error: "未发布的作业没有可退回的提交" };
  }

  const ct = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: sub.assignment.courseId, teacherId } },
  });
  if (!ct || (ct.role !== "OWNER" && ct.role !== "ASSISTANT")) {
    return { error: "您无权限退回此作业的学生" };
  }

  await prisma.assignmentSubmission.update({
    where: { id: parsed.data.submissionId },
    data: {
      manualScore: null,
      finalScore: null,
      feedback: parsed.data.feedback,
      gradedById: teacherId,
      gradedAt: new Date(),
      status: "RETURNED",
    },
  });

  // 给学生发退回通知
  const feedback = parsed.data.feedback.trim();
  const body = feedback.length > 80
    ? `教师反馈：${feedback.slice(0, 80)}…`
    : `教师反馈：${feedback}`;
  await notify({
    userId: sub.studentId,
    title: `作业需重做：《${sub.assignment.title}》`,
    body,
    href: `/assignments/${sub.assignment.id}`,
    courseId: sub.assignment.courseId,
  });

  revalidatePath(`/t/assignments/${sub.assignment.id}`);
  revalidatePath(`/t/assignments/${sub.assignment.id}/grade`);
  revalidatePath(`/t/grading`);
  revalidatePath(`/assignments/${sub.assignment.id}`);
  revalidatePath(`/notifications`);
  revalidatePath(`/dashboard`);

  return { ok: true };
}
