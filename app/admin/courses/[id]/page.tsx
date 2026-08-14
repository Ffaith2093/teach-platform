import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { ChevronLeft, BookOpen, Archive, Users, FileText, GraduationCap } from "lucide-react";
import type { CourseCategory, CourseTeacherRole } from "@prisma/client";
import { EditCourseButton } from "../_components/edit-course-button";
import { ArchiveCourseButton } from "../_components/archive-course-button";
import { TransferOwnershipButton } from "../_components/transfer-ownership-button";
import { RemoveCollaboratorButton } from "../_components/remove-collaborator-button";

export const metadata = { title: "课程详情" };

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  DATA: "数据",
  ALGORITHM: "算法",
  AI: "人工智能",
  NETWORK: "计算机网络",
  INTERDISCIPLINARY: "多学科交叉",
};

const ROLE_LABELS: Record<CourseTeacherRole, { label: string; tone: "primary" | "accent" | "default" }> = {
  OWNER: { label: "主讲", tone: "primary" },
  ASSISTANT: { label: "助教", tone: "accent" },
  CONTRIBUTOR: { label: "外聘", tone: "default" },
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      classes: {
        include: {
          class: {
            include: {
              grade: { select: { name: true, joinYear: true } },
              _count: { select: { students: { where: { status: "ACTIVE" } } } },
              teachers: {
                include: { teacher: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
      teachers: {
        include: {
          teacher: { select: { id: true, name: true, teacherNo: true, email: true, status: true } },
        },
        orderBy: [{ role: "asc" }, { addedAt: "asc" }],
      },
      _count: { select: { assignments: true, exams: true, resources: true, questions: true } },
    },
  });

  if (!course) notFound();

  const owner = course.teachers.find((t) => t.role === "OWNER");
  const collaborators = course.teachers.filter((t) => t.role !== "OWNER");

  return (
    <>
      <Topbar
        crumbs={[
          { label: "课程管理", href: "/admin/courses" },
          { label: course.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/admin/courses"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回课程列表
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
                  <Badge variant="primary">{CATEGORY_LABELS[course.category]}</Badge>
                  {course.isArchived ? (
                    <Badge variant="default">已归档</Badge>
                  ) : (
                    <Badge variant="success">活跃</Badge>
                  )}
                </div>
                {course.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                )}
                <p className="mt-2 text-xs text-subtle-foreground">
                  {course.semester} · 更新于 {relativeTime(course.updatedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <EditCourseButton
                  courseId={course.id}
                  initial={{
                    title: course.title,
                    description: course.description ?? "",
                    category: course.category,
                    semester: course.semester,
                  }}
                />
                <ArchiveCourseButton
                  courseId={course.id}
                  courseTitle={course.title}
                  isArchived={course.isArchived}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={Users} label="绑定班级" value={course.classes.length} />
            <StatCard icon={BookOpen} label="作业" value={course._count.assignments} />
            <StatCard icon={FileText} label="试卷" value={course._count.exams} />
            <StatCard
              icon={GraduationCap}
              label="学生总数"
              value={course.classes.reduce((s, c) => s + c.class._count.students, 0)}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">授课班级</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    班级一旦加入课程，该班所有学生自动成为课程成员。
                  </p>
                  <div className="mt-4">
                    {course.classes.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
                        本课程尚未绑定任何班级（由教师在课程工作台绑定）
                      </p>
                    ) : (
                      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {course.classes.map((cc) => (
                          <li
                            key={cc.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {cc.class.name}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Badge variant="primary">{cc.class.grade.name}</Badge>
                                <span className="num">{cc.class.grade.joinYear} 级</span>
                                <span>·</span>
                                <span className="num">{cc.class._count.students} 学生</span>
                                <span>·</span>
                                <span>{relativeTime(cc.addedAt)}</span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">教师团队</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    OWNER 可执行删除/转让/移除协作者；管理员可强制接管所有权。
                  </p>
                  <ul className="mt-4 space-y-3">
                    {course.teachers.map((ct) => {
                      const role = ROLE_LABELS[ct.role];
                      const isOwner = ct.role === "OWNER";
                      return (
                        <li
                          key={ct.id}
                          className="rounded-lg border border-border bg-card p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">
                                {ct.teacher.name}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                {ct.teacher.teacherNo} · {ct.teacher.email}
                              </div>
                              <div className="mt-1.5">
                                <Badge variant={role.tone}>{role.label}</Badge>
                                {ct.teacher.status !== "ACTIVE" && (
                                  <Badge variant="default" className="ml-1">
                                    {ct.teacher.status === "DISABLED" ? "已停用" : ct.teacher.status}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {!isOwner && (
                              <RemoveCollaboratorButton
                                courseId={course.id}
                                teacherId={ct.teacher.id}
                                teacherName={ct.teacher.name}
                              />
                            )}
                          </div>
                          {isOwner && course.teachers.length > 1 && (
                            <div className="mt-3 border-t border-border pt-2">
                              <TransferOwnershipButton
                                courseId={course.id}
                                currentOwnerName={ct.teacher.name}
                                collaborators={collaborators.map((c) => ({
                                  id: c.teacher.id,
                                  name: c.teacher.name,
                                }))}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              {course.isArchived && (
                <Card>
                  <CardContent className="p-5 text-sm">
                    <div className="flex items-start gap-2 text-warning">
                      <Archive className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">本课程已归档</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          归档后对教师与学生隐藏，历史作业与成绩保留。点击「恢复」可重新激活。
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3 text-3xl font-bold tracking-tight num">{value}</div>
      </CardContent>
    </Card>
  );
}