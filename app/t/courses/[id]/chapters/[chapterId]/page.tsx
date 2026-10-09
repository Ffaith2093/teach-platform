import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Topbar } from "@/components/shell/topbar";
import {
  ChevronLeft,
  BookOpen,
  FileText,
  ClipboardCheck,
  Plus,
  Archive,
  Calendar,
  ClipboardList,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { ChapterSettingsDialog } from "../../_components/chapter-settings-dialog";

export const metadata = { title: "章节详情" };

export default async function TeacherChapterDetailPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>;
}) {
  const { id: courseId, chapterId } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // 权限：必须是课程成员
  const myMembership = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId, teacherId: userId } },
  });
  if (!myMembership) redirect("/t/courses?error=forbidden");

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      course: { select: { id: true, title: true, isArchived: true } },
      _count: { select: { assignments: true, exams: true, surveys: true } },
    },
  });
  if (!chapter || chapter.courseId !== courseId) notFound();

  // 列出本章节的作业与考试
  const [assignments, exams, surveys] = await Promise.all([
    prisma.assignment.findMany({
      where: { chapterId },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        title: true,
        publishedAt: true,
        dueAt: true,
        totalScore: true,
        _count: { select: { submissions: true } },
      },
    }),
    prisma.exam.findMany({
      where: { chapterId },
      orderBy: { openAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        openAt: true,
        closeAt: true,
        totalScore: true,
        durationMin: true,
        _count: { select: { attempts: true } },
      },
    }),
    prisma.survey.findMany({
      where: { chapterId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        _count: { select: { questions: true, responses: true } },
      },
    }),
  ]);

  const isOwner = myMembership.role === "OWNER";
  const canEdit = isOwner || myMembership.role === "ASSISTANT";

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: chapter.course.title, href: `/t/courses/${courseId}` },
          { label: "章节", href: `/t/courses/${courseId}#chapters` },
          { label: chapter.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href={`/t/courses/${courseId}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回课程详情
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <Badge variant="primary" className="num font-mono">
                    第 {chapter.order} 章
                  </Badge>
                  <h1 className="text-2xl font-semibold tracking-tight">{chapter.title}</h1>
                  {chapter.course.isArchived && <Badge variant="default">已归档</Badge>}
                </div>
                {chapter.description && (
                  <p className="mt-2 max-w-3xl whitespace-pre-line text-sm text-muted-foreground">
                    {chapter.description}
                  </p>
                )}
              </div>
              {canEdit && (
                <ChapterSettingsDialog
                  chapterId={chapter.id}
                  courseId={courseId}
                  initialTitle={chapter.title}
                  initialDescription={chapter.description}
                />
              )}
            </div>
          </div>

          {/* 概览 + 入口 */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">章节作业</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="num text-3xl font-bold tracking-tight">
                  {chapter._count.assignments}
                </span>
                <span className="text-sm text-muted-foreground">项</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">章节考试</div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="num text-3xl font-bold tracking-tight">
                  {chapter._count.exams}
                </span>
                <span className="text-sm text-muted-foreground">场</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">章节问卷</div>
              <div className="mt-3 flex items-baseline gap-1"><span className="num text-3xl font-bold tracking-tight">{chapter._count.surveys}</span><span className="text-sm text-muted-foreground">份</span></div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 md:col-span-1">
              <div className="text-sm text-muted-foreground">快捷操作</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/t/assignments/new?courseId=${courseId}&chapterId=${chapter.id}`}
                >
                  <Button size="sm">
                    <Plus />
                    在此章节新建作业
                  </Button>
                </Link>
                <Link href={`/t/exams/new?courseId=${courseId}&chapterId=${chapter.id}`}>
                  <Button size="sm" variant="outline">
                    <Plus />
                    在此章节新建考试
                  </Button>
                </Link>
                <Link href={`/t/surveys/new?courseId=${courseId}&chapterId=${chapter.id}`}>
                  <Button size="sm" variant="outline"><Plus />在此章节新建问卷</Button>
                </Link>
              </div>
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
                <div className="px-6 py-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-subtle-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">本章节暂无作业</p>
                  {canEdit && (
                    <Link
                      href={`/t/assignments/new?courseId=${courseId}&chapterId=${chapter.id}`}
                      className="mt-3 inline-block text-xs text-primary hover:underline"
                    >
                      在此章节新建作业 →
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {assignments.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/t/assignments/${a.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            {a.title}
                            {a.publishedAt == null && <Badge variant="default">草稿</Badge>}
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              <span className="num">{formatDate(a.dueAt)}</span> 截止
                            </span>
                            <span className="num">总分 {a.totalScore}</span>
                            <span className="num">
                              {a._count.submissions} 人已交
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border px-6 py-3"><div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-primary" />章节问卷</div><span className="num text-xs text-muted-foreground">{surveys.length} 份</span></div>
              {surveys.length === 0 ? <div className="px-6 py-12 text-center"><ClipboardList className="mx-auto h-8 w-8 text-subtle-foreground" /><p className="mt-3 text-sm text-muted-foreground">本章节暂无问卷</p>{canEdit && <Link href={`/t/surveys/new?courseId=${courseId}&chapterId=${chapter.id}`} className="mt-3 inline-block text-xs text-primary hover:underline">在此章节新建问卷 →</Link>}</div> : <ul className="divide-y divide-border">{surveys.map((survey) => <li key={survey.id}><Link href={`/t/surveys/${survey.id}`} className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"><div><div className="flex items-center gap-2 text-sm font-medium">{survey.title}<Badge variant={survey.status === "PUBLISHED" ? "success" : survey.status === "CLOSED" ? "warning" : "default"}>{survey.status === "PUBLISHED" ? "回收中" : survey.status === "CLOSED" ? "已关闭" : "草稿"}</Badge></div><div className="mt-1 flex gap-3 text-xs text-muted-foreground"><span className="num">{survey._count.questions} 题</span><span className="num">{survey._count.responses} 份回收</span>{survey.dueAt && <span className="num">{formatDate(survey.dueAt)} 截止</span>}</div></div></Link></li>)}</ul>}
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
                <div className="px-6 py-12 text-center">
                  <ClipboardCheck className="mx-auto h-8 w-8 text-subtle-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">本章节暂无考试</p>
                  {canEdit && (
                    <Link
                      href={`/t/exams/new?courseId=${courseId}&chapterId=${chapter.id}`}
                      className="mt-3 inline-block text-xs text-primary hover:underline"
                    >
                      在此章节新建考试 →
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {exams.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/t/exams/${e.id}`}
                        className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            {e.title}
                            <Badge
                              variant={
                                e.status === "PUBLISHED"
                                  ? "success"
                                  : e.status === "CLOSED"
                                    ? "default"
                                    : "warning"
                              }
                            >
                              {e.status === "PUBLISHED"
                                ? "已发布"
                                : e.status === "CLOSED"
                                  ? "已结束"
                                  : "草稿"}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="num">
                              {formatDate(e.openAt)} ~ {formatDate(e.closeAt)}
                            </span>
                            <span className="num">{e.durationMin} 分钟</span>
                            <span className="num">总分 {e.totalScore}</span>
                            <span className="num">{e._count.attempts} 人已考</span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {chapter._count.assignments + chapter._count.exams + chapter._count.surveys === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              <BookOpen className="mx-auto h-6 w-6 text-subtle-foreground" />
              <p className="mt-2">本章节还没有内容</p>
              <p className="mt-1 text-xs">在上方「快捷操作」中创建本章节的作业、考试或问卷</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
