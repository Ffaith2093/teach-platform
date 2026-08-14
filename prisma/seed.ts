// SPEC §1 初始化数据 + SPEC §3.3 学生批量导入示例
// 运行：npm run db:seed
//
// 默认账号：
//   管理员  admin@school.edu     / admin123
//   教师    王建国 wang.jianguo@school.edu / T0001 / 123456  （任课 高一(1)(3)(5) 班）
//   教师    李雪华 li.xuehua@school.edu   / T0002 / 123456  （任课 高一(2)(4) 班）
//   学生    20240101~20240106                  / 各班 / 初始密码 = 学号后 6 位

import { PrismaClient, Role, UserStatus, ClassTeacherRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function hash(plain: string) {
  return bcrypt.hash(plain, 12);
}

async function main() {
  console.log("[seed] 开始写入基础数据…");

  // 1. 清空（仅 dev 环境）
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed 不能在 production 跑！");
  }
  // 不真删，使用 upsert 保证幂等

  // 2. 年级
  const grades = await Promise.all(
    [
      { name: "高一年级", joinYear: 2024 },
      { name: "高二年级", joinYear: 2023 },
      { name: "高三年级", joinYear: 2022 },
    ].map((g) =>
      prisma.grade.upsert({
        where: { name: g.name },
        update: {},
        create: g,
      }),
    ),
  );
  const [g1, g2, g3] = grades;
  console.log(`[seed] 年级 ×${grades.length}`);

  // 3. 班级（每个年级 2 个示例班）
  const classSeeds = [
    { gradeId: g1.id, name: "高一(1)班", joinYear: 2024 },
    { gradeId: g1.id, name: "高一(2)班", joinYear: 2024 },
    { gradeId: g1.id, name: "高一(3)班", joinYear: 2024 },
    { gradeId: g2.id, name: "高二(1)班", joinYear: 2023 },
    { gradeId: g2.id, name: "高二(2)班", joinYear: 2023 },
    { gradeId: g3.id, name: "高三(1)班", joinYear: 2022 },
  ];
  const classes = [];
  for (const c of classSeeds) {
    const existing = await prisma.class.findFirst({
      where: { gradeId: c.gradeId, name: c.name },
    });
    classes.push(
      existing ?? (await prisma.class.create({ data: c })),
    );
  }
  console.log(`[seed] 班级 ×${classes.length}`);

  // 4. 管理员
  await prisma.user.upsert({
    where: { email: "admin@school.edu" },
    update: {},
    create: {
      email: "admin@school.edu",
      passwordHash: await hash("admin123"),
      name: "李管理",
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    },
  });

  // 5. 教师
  const teacherWang = await prisma.user.upsert({
    where: { email: "wang.jianguo@school.edu" },
    update: {},
    create: {
      email: "wang.jianguo@school.edu",
      passwordHash: await hash("123456"),
      name: "王建国",
      teacherNo: "T0001",
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      subjects: ["信息技术"],
      mustChangePassword: true, // SPEC §1.1 首次登录强制改密
    },
  });

  const teacherLi = await prisma.user.upsert({
    where: { email: "li.xuehua@school.edu" },
    update: {},
    create: {
      email: "li.xuehua@school.edu",
      passwordHash: await hash("123456"),
      name: "李雪华",
      teacherNo: "T0002",
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
      subjects: ["信息技术", "通用技术"],
      mustChangePassword: true,
    },
  });
  console.log(`[seed] 教师 ×2`);

  // 6. 任课绑定（高一(1)(3)(5) → 王建国；高一(2)(4) → 李雪华）
  const assignments: { classId: string; teacherId: string }[] = [
    { classId: classes[0].id, teacherId: teacherWang.id }, // 高一(1)
    { classId: classes[1].id, teacherId: teacherLi.id }, // 高一(2)
    { classId: classes[2].id, teacherId: teacherWang.id }, // 高一(3)
  ];
  for (const a of assignments) {
    await prisma.classTeacher.upsert({
      where: { classId: a.classId },
      update: { teacherId: a.teacherId, role: ClassTeacherRole.SUBJECT_TEACHER },
      create: { classId: a.classId, teacherId: a.teacherId, role: ClassTeacherRole.SUBJECT_TEACHER },
    });
  }
  console.log(`[seed] 班级-教师绑定 ×${assignments.length}`);

  // 7. 学生（SPEC §3.3：初始密码 = 学号后 6 位）
  const studentSeeds = [
    { name: "张三", studentNo: "20240101", classId: classes[0].id }, // 高一(1)
    { name: "李四", studentNo: "20240102", classId: classes[0].id },
    { name: "王五", studentNo: "20240103", classId: classes[0].id },
    { name: "赵六", studentNo: "20240201", classId: classes[1].id }, // 高一(2)
    { name: "钱七", studentNo: "20240202", classId: classes[1].id },
    { name: "孙八", studentNo: "20240301", classId: classes[2].id }, // 高一(3)
  ];
  for (const s of studentSeeds) {
    const initialPwd = s.studentNo.slice(-6); // 学号后 6 位
    await prisma.user.upsert({
      where: { studentNo: s.studentNo },
      update: {},
      create: {
        email: `${s.studentNo}@school.edu`,
        passwordHash: await hash(initialPwd),
        name: s.name,
        studentNo: s.studentNo,
        classId: s.classId,
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
      },
    });
  }
  console.log(`[seed] 学生 ×${studentSeeds.length}`);

  console.log("\n[seed] 完成。登录账号：");
  console.log("  admin@school.edu / admin123");
  console.log("  wang.jianguo@school.edu / 123456  (工号 T0001)");
  console.log("  li.xuehua@school.edu / 123456    (工号 T0002)");
  console.log("  20240101 / 240101   (学生，初始密码=学号后6位)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
