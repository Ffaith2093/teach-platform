import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  Mail,
  Phone,
  UserCog,
  GraduationCap,
  BookOpen,
  Hash,
} from "lucide-react";
import { AssignClassesPanel } from "../_components/assign-classes-panel";
import { DeleteTeacherButton } from "../_components/delete-teacher-button";
import { ResetTeacherPasswordButton } from "../_components/reset-teacher-password-button";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "教师详情" };

export default async function TeacherDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const teacher = await prisma.user.findUnique({
    where: { id },
    include: {
      classTeachers: {
        include: {
          class: {
            include: {
              grade: { select: { name: true, joinYear: true } },
              _count: { select: { students: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
      courseTeachers: {
        include: { course: { select: { id: true, title: true, isArchived: true } } },
      },
      _count: {
        select: {
          authoredProblems: true,
          createdAssignments: true,
        },
      },
    },
  });

  if (!teacher || teacher.role !== "TEACHER") notFound();

  // 列出「未分配」或「当前由该教师任教」的所有 ACTIVE 班级，供分配 Tab 用
  const assignedClassIds = new Set(teacher.classTeachers.map((ct) => ct.classId));
  const allClasses = await prisma.class.findMany({
    where: {
      isActive: true,
      OR: [{ teachers: { none: {} } }, { id: { in: [...assignedClassIds] } }],
    },
    orderBy: [{ grade: { joinYear: "desc" } }, { name: "asc" }],
    include: {
      grade: { select: { name: true } },
      teachers: {
        include: { teacher: { select: { id: true, name: true } } },
      },
    },
  });

  const assignedClasses = teacher.classTeachers.map((ct) => ({
    id: ct.classId,
    name: ct.class.name,
    gradeName: ct.class.grade.name,
    studentCount: ct.class._count.students,
  }));

  const availableClasses = allClasses
    .filter((c) => !assignedClassIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      gradeName: c.grade.name,
      currentTeacherName: c.teachers[0]?.teacher.name ?? null,
      currentTeacherId: c.teachers[0]?.teacher.id ?? null,
    }));

  return (
    <>
      <Topbar
        crumbs={[
          { label: "教师管理", href: "/admin/teachers" },
          { label: teacher.name },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/admin/teachers"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回教师列表
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{teacher.name}</h1>
                  {teacher.status === "ACTIVE" ? (
                    <Badge variant="success">在职</Badge>
                  ) : (
                    <Badge variant="default">已停用</Badge>
                  )}
                  {teacher.mustChangePassword && teacher.status === "ACTIVE" && (
                    <Badge variant="warning">未改密</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3 w-3" />
                    <span className="num font-mono">{teacher.teacherNo}</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {teacher.email}
                  </span>
                  {teacher.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {teacher.phone}
                    </span>
                  )}
                  {teacher.lastLoginAt && (
                    <span>最后登录 {relativeTime(teacher.lastLoginAt)}</span>
                  )}
                </div>
                {teacher.subjects.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacher.subjects.map((s) => (
                      <Badge key={s} variant="primary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <ResetTeacherPasswordButton
                  teacherId={teacher.id}
                  teacherName={teacher.name}
                  teacherNo={teacher.teacherNo ?? ""}
                />
                <DeleteTeacherButton
                  teacherId={teacher.id}
                  teacherName={teacher.name}
                  hasAssignments={teacher._count.createdAssignments > 0}
                  hasCourses={teacher.courseTeachers.some((ct) => ct.course)}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <AssignClassesPanel
                teacherId={teacher.id}
                assigned={assignedClasses}
                available={availableClasses}
              />
            </div>

            <div className="space-y-6">
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    数据概览
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    <Row icon={GraduationCap} label="任课班级" value={assignedClasses.length} />
                    <Row icon={BookOpen} label="参与课程" value={teacher.courseTeachers.length} />
                    <Row icon={UserCog} label="出题数" value={teacher._count.authoredProblems} />
                    <Row icon={BookOpen} label="创建作业" value={teacher._count.createdAssignments} />
                  </div>
                </CardContent>
              </Card>

              {teacher.courseTeachers.length > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      参与课程
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {teacher.courseTeachers.map((ct) => (
                        <li
                          key={ct.id}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="truncate">{ct.course.title}</span>
                          <Badge
                            variant={
                              ct.role === "OWNER"
                                ? "primary"
                                : ct.role === "ASSISTANT"
                                  ? "accent"
                                  : "default"
                            }
                          >
                            {ct.role === "OWNER"
                              ? "主讲"
                              : ct.role === "ASSISTANT"
                                ? "助教"
                                : "外聘"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
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

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      <span className="text-base font-semibold num">{value}</span>
    </div>
  );
}
