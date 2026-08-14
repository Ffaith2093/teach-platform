import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/shell/topbar";
import { Library, Plus, BookMarked, FileText, ChevronRight } from "lucide-react";
import { CreateBankButton } from "./_components/create-bank-button";

export const metadata = { title: "我的题库" };

export default async function TeacherBanksPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [banks, myCourses] = await Promise.all([
    prisma.questionBank.findMany({
      where: { ownerId: userId },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { questions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.courseTeacher.findMany({
      where: {
        teacherId: userId,
        role: { in: ["OWNER", "ASSISTANT"] },
        course: { isArchived: false },
      },
      include: { course: { select: { id: true, title: true } } },
      orderBy: { course: { title: "asc" } },
    }),
  ]);

  const totalQuestions = banks.reduce((s, b) => s + b._count.questions, 0);
  const withCourse = banks.filter((b) => b.courseId).length;

  const stats = [
    { icon: Library, label: "我的题库", num: banks.length },
    { icon: FileText, label: "题目总数", num: totalQuestions },
    { icon: BookMarked, label: "关联课程", num: withCourse },
  ];

  return (
    <>
      <Topbar crumbs={[{ label: "我的题库" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">我的题库</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                把编程题按主题/章节归类到题库。可关联到一门课程，便于作业引用。
              </p>
            </div>
            <CreateBankButton
              courses={myCourses.map((m) => ({
                id: m.course.id,
                title: m.course.title,
              }))}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{s.label}</span>
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 text-3xl font-bold tracking-tight num">{s.num}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {banks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Library className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">还没有创建任何题库</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    点击右上角「新建题库」开始创建
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {banks.map((b) => (
                <Link
                  key={b.id}
                  href={`/t/banks/${b.id}`}
                  className="group block"
                >
                  <Card className="h-full transition-all hover:border-primary hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-foreground">
                            {b.name}
                          </div>
                          {b.course ? (
                            <Badge variant="primary" className="mt-1.5 font-normal">
                              {b.course.title}
                            </Badge>
                          ) : (
                            <Badge variant="default" className="mt-1.5 font-normal">
                              未关联课程
                            </Badge>
                          )}
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground transition-colors group-hover:text-primary" />
                      </div>

                      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span className="num text-foreground">{b._count.questions}</span>{" "}
                          <span>题</span>
                        </div>
                        {!b.courseId && (
                          <span className="ml-auto text-[11px] text-subtle-foreground">
                            题库级，未绑课程
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}