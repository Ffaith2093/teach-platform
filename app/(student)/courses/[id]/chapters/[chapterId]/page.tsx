import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  FileText,
  ClipboardCheck,
  ChevronRight,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { SubmissionStatus, ExamStatus, AttemptStatus } from "@prisma/client";

export const metadata = { title: "章节详情" };

const SUB_STATUS: Record<SubmissionStatus, { label: string; tone: "default" | "warning" | "success" | "accent" }> = {
  DRAFT: { label: "草稿", tone: "default" },
  SUBMITTED: { label: "已提交", tone: "warning" },
  GRADED: { label: "已批改", tone: "success" },
  RETURNED: { label: "已退回", tone: "accent" },
};

const EXAM_STATUS: Record<ExamStatus, { label: string; tone: "default" | "warning" | "success" | "danger" }> = {
  DRAFT: { label: "未发布", tone: "default" },
  PUBLISHED: { label: "已发布", tone: "success" },
  CLOSED: { label: "已结束", tone: "warning" },
};

const ATTEMPT_STATUS: Record<AttemptStatus, { label: string; tone: "default" | "warning" | "success" }> = {
  IN_PROGRESS: { label: "进行中", tone: "warning" },
  SUBMITTED: { label: "已交卷", tone: "success" },
  GRADING: { label: "批改中", tone: "warning" },
  GRADED: { label: "已出分", tone: "success" },
};

export default async function StudentChapterDetailPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id: courseId, chapterId } = await params;
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  // 鉴权：必须是当前学生班级所属课程
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { classId: true },
  });
  if (!me?.classId) notFound();

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      courseId: true,
      title: true,
      description: true,
      order: true,
    },
  });
  if (!chapter || chapter.courseId !== courseId) notFound();

  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      isArchived: false,
      classes: { some: { classId: me.classId } },
    },
    select: { id: true, title: true },
  });
  if (!course) notFound();

  // 本章节作业（含我的提交状态）
  const assignments = await prisma.assignment.findMany({
    where: { chapterId, publishedAt: { not: null } },
    orderBy: { dueAt: "asc" },
    select: {
      id: true,
      title: true,
      dueAt: true,
      totalScore: true,
      submissions: {
        where: { studentId: userId },
        select: { status: true, finalScore: true, submittedAt: true },
        take: 1,
      },
    },
  });

  // 本章节考试（含我的尝试状态）
  const exams = await prisma.exam.findMany({
    where: { chapterId, status: { in: ["PUBLISHED", "CLOSED"] } },
    orderBy: { openAt: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      openAt: true,
      closeAt: true,
      durationMin: true,
      totalScore: true,
      attempts: {
        where: { studentId: userId },
        select: { status: true, finalScore: true, submittedAt: true },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-3">
          <Badge variant="primary" className="num font-mono">
            第 {chapter.order} 章
          </Badge>
          <h1 className="text-xl font-semibold tracking-tight">{chapter.title}</h1>
        </div>
        {chapter.description && (
          <p className="mt-3 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">
            {chapter.description}
          </p>
        )}
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 num">
            <FileText className="h-3 w-3" />
            {assignments.length} 作业
          </span>
          <span className="inline-flex items-center gap-1 num">
            <ClipboardCheck className="h-3 w-3" />
            {exams.length} 考试
          </span>
        </div>
      </div>

      {/* 作业列表 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-primary" />
              章节作业
            </div>
            <span className="text-xs text-muted-foreground num">
              {assignments.length} 项
            </span>
          </div>
          {assignments.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              本章节暂无作业
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.map((a) => {
                const sub = a.submissions[0];
                const overdue = !sub && a.dueAt < now;
                return (
                  <li key={a.id}>
                    <Link
                      href={`/assignments/${a.id}`}
                      className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {a.title}
                          {sub && (
                            <Badge variant={SUB_STATUS[sub.status].tone}>
                              {SUB_STATUS[sub.status].label}
                            </Badge>
                          )}
                          {!sub && overdue && <Badge variant="danger">已逾期</Badge>}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className="num">{formatDate(a.dueAt)}</span> 截止
                          </span>
                          <span className="num">总分 {a.totalScore}</span>
                          {sub?.finalScore != null && (
                            <span className="num text-success">
                              得分 {sub.finalScore}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 考试列表 */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              章节考试
            </div>
            <span className="text-xs text-muted-foreground num">{exams.length} 场</span>
          </div>
          {exams.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              本章节暂无考试
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {exams.map((e) => {
                const attempt = e.attempts[0];
                const isAvailable =
                  e.status === "PUBLISHED" && e.openAt <= now && e.closeAt >= now && !attempt;
                const isMissed =
                  !attempt &&
                  (e.status === "CLOSED" || (e.status === "PUBLISHED" && e.closeAt < now));
                return (
                  <li key={e.id}>
                    <Link
                      href={`/exams/${e.id}`}
                      className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {e.title}
                          <Badge variant={EXAM_STATUS[e.status].tone}>
                            {EXAM_STATUS[e.status].label}
                          </Badge>
                          {attempt && (
                            <Badge variant={ATTEMPT_STATUS[attempt.status].tone}>
                              {ATTEMPT_STATUS[attempt.status].label}
                            </Badge>
                          )}
                          {isAvailable && (
                            <Badge variant="primary">可参加</Badge>
                          )}
                          {isMissed && (
                            <Badge variant="danger">已错过</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="num">
                            {formatDate(e.openAt)} ~ {formatDate(e.closeAt)}
                          </span>
                          <span className="inline-flex items-center gap-1 num">
                            <Clock className="h-3 w-3" />
                            {e.durationMin} 分钟
                          </span>
                          <span className="num">总分 {e.totalScore}</span>
                          {attempt?.finalScore != null && (
                            <span className="num text-success">
                              得分 {attempt.finalScore}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}