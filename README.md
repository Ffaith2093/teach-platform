# PyLearn · 高中 Python 编程教学平台

> 面向高中 Python 编程课，覆盖「教 — 练 — 考 — 评」完整闭环。
> 需求依据：[docs/SPEC.md](./docs/SPEC.md) · 设计依据：[docs/DESIGN.md](./docs/DESIGN.md)

## 快速开始

需要 Node.js 22、Docker（含 Compose）和可用的 Docker daemon。复制 `.env.example` 为 `.env`，将 `AUTH_SECRET`、`CRON_SECRET` 换成随机值。Docker 沙箱必须预先有 `python:3.11-slim` 镜像；学生样例和教师题目自测在 Docker 不可用时会报错，不会退回宿主机执行代码。

### 全新数据库，本地开发

```bash
npm ci
docker compose up -d postgres redis
npx prisma migrate deploy
npm run db:seed                    # 仅用于开发演示，不能在 production 运行
docker pull python:3.11-slim
npm run dev                        # http://localhost:3000
npm run worker                     # 另开终端；评测队列
npm run cron                       # 另开终端；每分钟兜底自动交卷
npm run judge:smoke                # AC / WA / TLE / MLE 沙箱烟测
```

教师题目自测、学生运行样例都需要 Web 进程能访问 Docker daemon。单次评测最多 30 秒，并受独立容器的内存、网络、只读文件系统等限制。首次登录账号见 [prisma/seed.ts](./prisma/seed.ts)。

### 已有数据库：先核对再 baseline

现有数据库没有迁移记录，可能是通过 `db push` 建立。**不要**直接对已有库执行 `migrate deploy`、`migrate dev` 或重建数据卷。先备份数据库，再运行以下只读比对：

```bash
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma
```

仅当输出明确为 `No difference detected.`，且已确认当前库包含此初始迁移里的所有表、索引和约束时，才执行一次 `npx prisma migrate resolve --applied 20260922000000_initial`，随后运行 `npx prisma migrate status`。若有差异，先审查差异、另建增量迁移；不能把初始迁移标成已应用。此仓库自带数据库未做上述确认或 baseline。

### Compose 部署

`docker-compose.yml` 包含 web、worker、自动交卷进程，以及 PostgreSQL、Redis、Adminer。先按上述步骤完成数据库迁移，再执行：

```bash
docker compose build
docker compose up -d
```

生产环境的空库还需一次性创建管理员（不要运行演示 seed）：先在 shell 中提供 `BOOTSTRAP_ADMIN_EMAIL` 和至少 12 位的 `BOOTSTRAP_ADMIN_PASSWORD`，再执行 `docker compose run --rm -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD web npm run db:bootstrap-admin`；若已有管理员，此命令会拒绝覆盖。

web 和 worker 需要 Docker socket，并共享 `JUDGE_TMP_DIR` 的**同路径宿主机临时目录**，否则评测容器看不到代码文件。Mac 可在 `.env` 设置 `JUDGE_TMP_DIR=/private/tmp/pylearn-judge`；Linux 默认 `/tmp/pylearn-judge`。资源上传存于 `uploads-data` 卷。挂载 Docker socket 等同于授予该服务很高的宿主机权限，只能在可信单机环境使用；生产环境还需安排备份策略。

### ECS 生产部署

不要把上述本地 Compose 直接暴露到公网。ECS 使用独立的 `docker-compose.prod.yml`：数据库和 Redis 不发布宿主机端口，Web 仅绑定 `127.0.0.1`，由 Nginx 对外提供服务；Adminer 不包含在生产编排中，自动交卷 cron 需验收后显式启用。完整步骤见 [ECS 部署说明](./docs/DEPLOY_ECS.md)。

## 技术栈（锁定，详见 SPEC §0）

| 层 | 选型 |
|---|---|
| 框架 | Next.js 15 (App Router) · TypeScript strict |
| UI | Tailwind CSS + shadcn/ui |
| 表单 | react-hook-form + zod |
| 数据库 | PostgreSQL 16 + Prisma 6 |
| 认证 | Auth.js v5 (Credentials Provider · JWT) |
| 队列 | BullMQ + Redis |
| 沙箱 | dockerode |
| 编辑器 | Monaco |
| 图表 | recharts |
| 主题 | next-themes |
| 图标 | lucide-react |

## 目录结构

```
app/
  (public)/      # 公开页（落地页、登录、改密）
  (student)/     # 学生端
  t/             # 教师端
  admin/         # 管理员端
  api/           # 仅用于轮询/上传/下载
components/
  ui/            # shadcn 生成物
  shell/         # 三角色 Sidebar/Topbar
lib/
  auth/          # 鉴权守卫
  validations/   # zod schemas (P1 起)
  prisma.ts      # PrismaClient 单例
prisma/
  schema.prisma  # 全量数据模型（SPEC §2）
worker/          # BullMQ 消费进程（P2 起）
docs/            # SPEC.md / DESIGN.md
mockups/         # 静态 HTML mockup（设计依据）
```

## 实施进度

| 阶段 | 状态 | 验收 |
|---|---|---|
| **P0 启动与评测** | 代码与启动脚本已补齐；真实容器和现有库尚待验收 | 迁移 + 三角色登录 + AC/WA/TLE/MLE 烟测 |
| P1-P8 业务闭环 | 已有页面和逻辑，尚需逐项验收和补齐 | 见 `docs/SPEC.md` |

## 评测模块红线（CLAUDE.md / SPEC §3.1）

任何情况下都不得修改：

```bash
docker run --rm \
  --network=none \
  --read-only \
  --memory=128m --memory-swap=128m \
  --cpus=0.5 \
  --pids-limit=64 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --tmpfs /tmp:size=16m \
  -u 65534:65534 \
  python:3.11-slim
```
