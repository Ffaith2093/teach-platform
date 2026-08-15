import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Users, GraduationCap, BookOpen, FileText, Mail, Hash, ChevronRight, TableProperties } from "lucide-react";
import { GradebookTab } from "./_components/gradebook-tab";
import { AnnounceForm } from "./_components/announce-form";

export const metadata = { title: "班级详情" };

type Tab = "roster" | "performance" | "gradebook" | "courses";

export default async function TeacherClassDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; courseId?: string; kind?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await auth();
  const userId = session!.user.id;

  // 权限：教师必须任教该班
  const isMyClass = await prisma.classTeacher.findFirst({
    where: { classId: id, teacherId: userId },
  });
  if (!isMyClass) redirect("/t/classes?error=forbidden");

  const cls = await prisma.class.findUnique({
    where: { id },
    include: {
      grade: true,
      students: {
        orderBy: [{ studentNo: "asc" }],
        select: {
          id: true,
          name: true,
          studentNo: true,
          email: true,
          status: true,
          mustChangePassword: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
      teachers: {
        include: { teacher: { select: { id: true, name: true, teacherNo: true } } },
      },
      courseClasses: {
        include: {
          course: {
            include: {
              _count: { select: { assignments: true, exams: true } },
              teachers: {
                where: { role: "OWNER" },
                include: { teacher: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });
  if (!cls) notFound();

  const activeTab: Tab =
    sp.tab === "performance"
      ? "performance"
      : sp.tab === "gradebook"
        ? "gradebook"
        : sp.tab === "courses"
          ? "courses"
          : "roster";

  // 性能数据：班级下每个学生的提交统计
  const studentIds = cls.students.filter((s) => s.status === "ACTIVE").map((s) => s.id);
  const allAssignments = await prisma.assignment.findMany({
    where: {
      courseId: { in: cls.courseClasses.map((cc) => cc.courseId) },
      publishedAt: { not: null },
    },
    select: { id: true, title: true, courseId: true, totalScore: true, dueAt: true },
    orderBy: { dueAt: "desc" },
    take: 20,
  });

  const submissions = await prisma.assignmentSubmission.findMany({
    where: {
      studentId: { in: studentIds },
      assignmentId: { in: allAssignments.map((a) => a.id) },
    },
    select: {
      assignmentId: true,
      studentId: true,
      finalScore: true,
      status: true,
      submittedAt: true,
    },
  });

  const submittedByAssignment = new Map<string, number>();
  const gradedScores: number[] = [];
  // 每个学生「已交」作业 id 集合（用于算欠交数）
  const submittedAssignmentByStudent = new Map<string, Set<string>>();
  for (const sub of submissions) {
    if (sub.status === "SUBMITTED" || sub.status === "GRADED") {
      submittedByAssignment.set(
        sub.assignmentId,
        (submittedByAssignment.get(sub.assignmentId) ?? 0) + 1,
      );
    }
    if (sub.finalScore != null) gradedScores.push(sub.finalScore);
    if (sub.status === "SUBMITTED" || sub.status === "GRADED" || sub.status === "RETURNED") {
      if (!submittedAssignmentByStudent.has(sub.studentId)) {
        submittedAssignmentByStudent.set(sub.studentId, new Set());
      }
      submittedAssignmentByStudent.get(sub.studentId)!.add(sub.assignmentId);
    }
  }

  // 欠交数 = 总作业 - 已交（含已批/已退）。DRAFT / 没记录都算欠交。
  const totalAssignments = allAssignments.length;
  const missingByStudent = new Map<string, number>();
  for (const stuId of studentIds) {
    const submitted = submittedAssignmentByStudent.get(stuId)?.size ?? 0;
    missingByStudent.set(stuId, Math.max(0, totalAssignments - submitted));
  }

  const avgScore =
    gradedScores.length > 0
      ? Math.round(gradedScores.reduce((s, n) => s + n, 0) / gradedScores.length)
      : null;

  const recentAssignments = allAssignments.slice(0, 8).map((a) => {
    const submitted = submittedByAssignment.get(a.id) ?? 0;
    const rate = studentIds.length > 0 ? Math.round((submitted / studentIds.length) * 100) : 0;
    return {
      id: a.id,
      title: a.title,
      totalScore: a.totalScore,
      submitted,
      total: studentIds.length,
      rate,
    };
  });

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "roster", label: "花名册", icon: Users },
    { key: "performance", label: "成绩概览", icon: FileText },
    { key: "gradebook", label: "成绩单", icon: TableProperties },
    { key: "courses", label: "所属课程", icon: BookOpen },
  ];

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的班级", href: "/t/classes" },
          { label: cls.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/classes"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的班级
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{cls.name}</h1>
                  <Badge variant="primary">{cls.grade.name}</Badge>
                  <span className="text-base font-normal text-muted-foreground num">
                    · {cls.grade.joinYear} 级
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    <span className="num">{cls.students.filter((s) => s.status === "ACTIVE").length}</span>{" "}
                    名在读学生（共 <span className="num">{cls.students.length}</span>）
                  </span>
                  {cls.teachers[0] && (
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      任课教师：{cls.teachers[0].teacher.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    <span className="num">{cls.courseClasses.length}</span> 门课程
                  </span>
                </div>
              </div>
              <AnnounceForm
                classId={cls.id}
                classLabel={`${cls.grade.name} · ${cls.name}`}
                studentCount={cls.students.filter((s) => s.status === "ACTIVE").length}
              />
            </div>
          </div>

          {/* Tab 导航 */}
          <div className="flex items-center gap-1 border-b border-border">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = t.key === activeTab;
              return (
                <Link
                  key={t.key}
                  href={`/t/classes/${cls.id}?tab=${t.key}`}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </Link>
              );
            })}
          </div>

          {activeTab === "roster" && (
            <RosterTab
              students={cls.students}
              missingByStudent={missingByStudent}
              totalAssignments={totalAssignments}
            />
          )}

          {activeTab === "performance" && (
            <PerformanceTab
              avgScore={avgScore}
              gradedCount={gradedScores.length}
              recentAssignments={recentAssignments}
              totalStudents={studentIds.length}
            />
          )}

          {activeTab === "gradebook" && (
            <GradebookTab
              classId={cls.id}
              searchParams={{ courseId: sp.courseId, kind: sp.kind }}
            />
          )}

          {activeTab === "courses" && <CoursesTab courses={cls.courseClasses.map((cc) => cc.course)} />}
        </div>
      </main>
    </>
  );
}

function RosterTab({
  students,
  missingByStudent,
  totalAssignments,
}: {
  students: Array<{
    id: string;
    name: string;
    studentNo: string | null;
    email: string;
    status: string;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
  }>;
  missingByStudent: Map<string, number>;
  totalAssignments: number;
}) {
  if (students.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">本班暂无学生</p>
        </CardContent>
      </Card>
    );
  }

  // 仅 ACTIVE 学生参与欠交统计（停用学生不再统计）
  const activeStudents = students.filter((s) => s.status === "ACTIVE");
  const missingStudentCount = activeStudents.filter(
    (s) => (missingByStudent.get(s.id) ?? 0) > 0,
  ).length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="text-sm text-muted-foreground">
            共 <span className="num font-medium text-foreground">{students.length}</span> 名学生 ·
            {" "}<span className="num">{totalAssignments}</span> 项作业
          </div>
          {missingStudentCount > 0 && (
            <Badge variant="danger">{missingStudentCount} 人有欠交作业</Badge>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-6 py-3">学号</th>
              <th className="px-6 py-3">姓名</th>
              <th className="px-6 py-3">邮箱</th>
              <th className="px-6 py-3">状态</th>
              <th className="px-6 py-3 text-right">欠交作业</th>
              <th className="px-6 py-3">最后登录</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => {
              const isActive = s.status === "ACTIVE";
              const missing = isActive ? missingByStudent.get(s.id) ?? 0 : null;
              const missingTone =
                missing == null
                  ? "muted"
                  : missing === 0
                    ? "success"
                    : missing <= 3
                      ? "warning"
                      : "danger";
              const missingLabel =
                missing == null ? "—" : missing === 0 ? "已交齐" : `${missing} 项`;
              return (
                <tr key={s.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-6 py-3.5 num font-mono text-xs text-muted-foreground">
                    {s.studentNo}
                  </td>
                  <td className="px-6 py-3.5 font-medium text-foreground">{s.name}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{s.email}</td>
                  <td className="px-6 py-3.5">
                    {s.status === "ACTIVE" ? (
                      <Badge variant="success">在读</Badge>
                    ) : (
                      <Badge variant="default">已停用</Badge>
                    )}
                    {s.mustChangePassword && s.status === "ACTIVE" && (
                      <span className="ml-2 text-[11px] text-warning">· 未改密</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {missingTone === "success" ? (
                      <span className="text-xs text-success">{missingLabel}</span>
                    ) : missingTone === "warning" || missingTone === "danger" ? (
                      <Badge variant={missingTone}>
                        <span className="num">{missingLabel}</span>
                      </Badge>
                    ) : (
                      <span className="text-xs text-subtle-foreground">{missingLabel}</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-muted-foreground num">
                    {s.lastLoginAt
                      ? new Date(s.lastLoginAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "从未登录"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function PerformanceTab({
  avgScore,
  gradedCount,
  recentAssignments,
  totalStudents,
}: {
  avgScore: number | null;
  gradedCount: number;
  recentAssignments: Array<{ id: string; title: string; totalScore: number; submitted: number; total: number; rate: number }>;
  totalStudents: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">已批改份数</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{gradedCount}</span>
              <span className="text-sm text-muted-foreground">份</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">平均分</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">
                {avgScore ?? "—"}
              </span>
              {avgScore != null && (
                <span className="text-sm text-muted-foreground">分</span>
              )}
            </div>
            {avgScore == null && (
              <p className="mt-1 text-[11px] text-subtle-foreground">尚无已批改数据</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">学生总数</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight num">{totalStudents}</span>
              <span className="text-sm text-muted-foreground">人</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold">近期作业提交率</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            仅展示所属课程已发布作业的前 8 项。
          </p>
          {recentAssignments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              暂无已发布的作业
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {recentAssignments.map((a) => (
                <li key={a.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{a.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground num">
                        {a.submitted}/{a.total} 人提交 · 总分 {a.totalScore}
                      </div>
                    </div>
                    <span
                      className={`num text-sm font-semibold ${
                        a.rate >= 80 ? "text-success" : a.rate >= 50 ? "text-warning" : "text-danger"
                      }`}
                    >
                      {a.rate}%
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full transition-all ${
                        a.rate >= 80 ? "bg-success" : a.rate >= 50 ? "bg-warning" : "bg-danger"
                      }`}
                      style={{ width: `${a.rate}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoursesTab({ courses }: { courses: Array<{ id: string; title: string; isArchived: boolean; _count: { assignments: number; exams: number }; teachers: Array<{ teacher: { name: string } }> }> }) {
  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">本班尚未加入任何课程</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {courses.map((c) => {
            const owner = c.teachers[0]?.teacher.name;
            return (
              <li key={c.id}>
                <Link
                  href={`/t/courses/${c.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      {c.title}
                      {c.isArchived && <Badge variant="default">已归档</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {owner && <span>主讲：{owner}</span>}
                      <span className="ml-3 num">{c._count.assignments} 作业</span>
                      <span className="ml-2 num">· {c._count.exams} 试卷</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}