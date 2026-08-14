import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/shell/topbar";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata = { title: "通知中心" };

export default async function StudentNotificationsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      body: true,
      href: true,
      isRead: true,
      createdAt: true,
    },
  });

  // 序列化为 ISO 字符串，让 Client Component 序列化安全
  const items = notifications.map((n) => ({
    ...n,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <>
      <Topbar crumbs={[{ label: "通知中心" }]} />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">通知中心</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              班级公告、转班通知等会显示在这里。点击通知跳转对应页面。
            </p>
          </div>
          <NotificationList items={items} />
        </div>
      </main>
    </>
  );
}