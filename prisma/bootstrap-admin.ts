import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

async function main() {
  const credentials = z
    .object({
      email: z.string().email(),
      password: z.string().min(12),
    })
    .parse({
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    });

  const admins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (admins !== 0) throw new Error("管理员已存在，不会覆盖已有账号");

  await prisma.user.create({
    data: {
      email: credentials.email,
      passwordHash: await bcrypt.hash(credentials.password, 12),
      name: "管理员",
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: true,
    },
  });
  console.log("管理员已创建，首次登录须修改密码");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
