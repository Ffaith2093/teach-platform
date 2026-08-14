// P1 阶段会写完整 seed：1 个 admin + 几个年级/班级 + 几个示例教师 + 几个示例学生
// P0 阶段仅占位，避免 npm run db:seed 报错
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] P0 阶段不写入数据；P1 认证切片会补充。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
