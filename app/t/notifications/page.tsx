import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { NotificationList, type NotificationGroup } from "@/components/notifications/notification-list";

export const metadata = { title: "通知中心" };

export default async function TeacherNotificationsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      body: true,
      href: true,
      isRead: true,
      courseId: true,
      classId: true,
      createdAt: true,
    },
  });

  const courseIds = Array.from(
    new Set(notifications.filter((n) => n.courseId).map((n) => n.courseId as string)),
  );
  const courses = courseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      })
    : [];
  const courseTitleMap = new Map(courses.map((c) => [c.id, c.title]));

  const classIds = Array.from(
    new Set(notifications.filter((n) => n.classId).map((n) => n.classId as string)),
  );
  const classes = classIds.length
    ? await prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, name: true, grade: { select: { name: true } } },
      })
    : [];
  const classLabelMap = new Map(classes.map((c) => [c.id, `${c.grade.name} · ${c.name}`]));

  const groupMap = new Map<string, NotificationGroup>();
  for (const n of notifications) {
    let key: string;
    let label: string;
    if (n.courseId) {
      key = `course:${n.courseId}`;
      label = courseTitleMap.get(n.courseId) ?? "已删除课程";
    } else if (n.classId) {
      key = `class:${n.classId}`;
      label = classLabelMap.get(n.classId) ?? "已删除班级";
    } else {
      key = "system";
      label = "系统通知";
    }
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, label, items: [] });
    }
    groupMap.get(key)!.items.push({
      id: n.id,
      title: n.title,
      body: n.body,
      href: n.href,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      courseId: n.courseId,
      courseTitle: n.courseId ? courseTitleMap.get(n.courseId) ?? null : null,
    });
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const rank = (k: string) => (k === "system" ? 0 : k.startsWith("class:") ? 1 : 2);
    const ra = rank(a.key);
    const rb = rank(b.key);
    if (ra !== rb) return ra - rb;
    const at = new Date(a.items[0].createdAt).getTime();
    const bt = new Date(b.items[0].createdAt).getTime();
    return bt - at;
  });

  return (
    <>
      <Topbar crumbs={[{ label: "通知中心" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">通知中心</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              班级公告、课程公告、系统通知会显示在这里。点击通知跳转对应页面。
            </p>
          </div>
          <NotificationList groups={groups} />
        </div>
      </main>
    </>
  );
}