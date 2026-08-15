import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/shell/topbar";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { ChevronLeft, BookOpen, Users, FileText, GraduationCap, Archive, Folder } from "lucide-react";
import type { CourseCategory, CourseTeacherRole } from "@prisma/client";
import { EditCourseButton } from "./_components/edit-course-button";
import { ArchiveCourseButton } from "./_components/archive-course-button";
import { AnnounceCourseButton } from "./_components/announce-course-button";
import { ClassesPanel } from "./_components/classes-panel";
import { CollaboratorsPanel } from "./_components/collaborators-panel";

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

export default async function TeacherCourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user.id;

  // 教师权限：必须在 CourseTeacher 列表里
  const myMembership = await prisma.courseTeacher.findUnique({
    where: { courseId_teacherId: { courseId: id, teacherId: userId } },
  });
  if (!myMembership) {
    redirect("/t/courses?error=forbidden");
  }

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      classes: {
        include: {
          class: {
            include: {
              grade: { select: { name: true, joinYear: true } },
              _count: { select: { students: { where: { status: "ACTIVE" } } } },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
      teachers: {
        include: {
          teacher: { select: { id: true, name: true, teacherNo: true, subjects: true, status: true } },
        },
        orderBy: [{ role: "asc" }, { addedAt: "asc" }],
      },
      _count: { select: { assignments: true, exams: true, resources: true } },
    },
  });

  if (!course) notFound();

  // 教师可添加的班级（自己任教且未加入此课程）
  const enrolledClassIds = new Set(course.classes.map((cc) => cc.classId));
  const taughtClasses = await prisma.classTeacher.findMany({
    where: { teacherId: userId },
    include: {
      class: {
        include: {
          grade: { select: { name: true } },
          _count: { select: { students: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { class: { name: "asc" } },
  });
  const availableClasses = taughtClasses
    .filter((ct) => !enrolledClassIds.has(ct.classId))
    .map((ct) => ({
      id: ct.classId,
      name: ct.class.name,
      gradeName: ct.class.grade.name,
      studentCount: ct.class._count.students,
    }));

  // 可邀请的协作者（在职教师，且不在本课程团队中，且不是自己）
  const memberIds = new Set(course.teachers.map((ct) => ct.teacherId));
  const availableCollaborators = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      status: "ACTIVE",
      NOT: { id: { in: [...memberIds] } },
    },
    select: { id: true, name: true, teacherNo: true, subjects: true },
    orderBy: { name: "asc" },
  });

  const isOwner = myMembership.role === "OWNER";
  // 课程公告收件人数：所有班级 ACTIVE 学生 + 同课程其他 CourseTeacher
  const recipientCount =
    course.classes.reduce((s, cc) => s + cc.class._count.students, 0) +
    Math.max(0, course.teachers.length - 1);

  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的课程", href: "/t/courses" },
          { label: course.title },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
          <div>
            <Link
              href="/t/courses"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的课程
            </Link>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
                  <Badge variant="primary">{CATEGORY_LABELS[course.category]}</Badge>
                  <Badge variant={ROLE_LABELS[myMembership.role].tone}>
                    {ROLE_LABELS[myMembership.role].label}
                  </Badge>
                  {course.isArchived && <Badge variant="default">已归档</Badge>}
                </div>
                {course.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{course.description}</p>
                )}
                <p className="mt-2 text-xs text-subtle-foreground">
                  {course.semester} · 更新于 {relativeTime(course.updatedAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <AnnounceCourseButton
                  courseId={course.id}
                  courseTitle={course.title}
                  recipientCount={recipientCount}
                />
                <EditCourseButton
                  courseId={course.id}
                  initial={{
                    title: course.title,
                    description: course.description ?? "",
                    category: course.category,
                    semester: course.semester,
                  }}
                />
                {isOwner && (
                  <ArchiveCourseButton
                    courseId={course.id}
                    courseTitle={course.title}
                    isArchived={course.isArchived}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard icon={Users} label="绑定班级" value={course.classes.length} />
            <StatCard
              icon={GraduationCap}
              label="学生总数"
              value={course.classes.reduce((s, cc) => s + cc.class._count.students, 0)}
            />
            <StatCard icon={FileText} label="作业" value={course._count.assignments} />
            <StatCard icon={BookOpen} label="试卷" value={course._count.exams} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <ClassesPanel
                courseId={course.id}
                isOwner={isOwner}
                assigned={course.classes.map((cc) => ({
                  id: cc.classId,
                  name: cc.class.name,
                  gradeName: cc.class.grade.name,
                  gradeJoinYear: cc.class.grade.joinYear,
                  studentCount: cc.class._count.students,
                  addedAt: cc.addedAt,
                }))}
                available={availableClasses}
              />

              <Card>
                <CardContent className="p-6">
                  <h2 className="text-base font-semibold">课程成员（按班级分组）</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    学生通过班级归属自动加入本课程。共{" "}
                    <b className="text-foreground num">
                      {course.classes.reduce((s, cc) => s + cc.class._count.students, 0)}
                    </b>{" "}
                    名学生。
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={`/t/courses/${course.id}/students`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                    >
                      查看完整学生名单 →
                    </Link>
                    <Link
                      href={`/t/courses/${course.id}/resources`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"
                    >
                      <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                      资源管理（{course._count.resources}）
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <CollaboratorsPanel
                courseId={course.id}
                isOwner={isOwner}
                currentUserId={userId}
                members={course.teachers.map((ct) => ({
                  id: ct.teacher.id,
                  name: ct.teacher.name,
                  teacherNo: ct.teacher.teacherNo,
                  subjects: ct.teacher.subjects,
                  role: ct.role,
                  status: ct.teacher.status,
                }))}
                available={availableCollaborators}
              />

              {course.isArchived && (
                <Card>
                  <CardContent className="p-5 text-sm">
                    <div className="flex items-start gap-2 text-warning">
                      <Archive className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">本课程已归档</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          归档后对学生不可见，历史作业与成绩保留。
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