# PyLearn · 高中 Python 编程教学平台

> 面向高中 Python 编程课，覆盖「教 — 练 — 考 — 评」完整闭环。
> 需求依据：[docs/SPEC.md](./docs/SPEC.md) · 设计依据：[docs/DESIGN.md](./docs/DESIGN.md)

## 快速开始

### 1. 启动基础设施

```bash
docker compose up -d
# postgres: localhost:5432  (pylearn / pylearn_dev)
# redis:    localhost:6379
# adminer:  http://localhost:8080
```

### 2. 安装依赖

```bash
npm install
```

### 3. 数据库迁移

```bash
npx prisma migrate dev --name init
npx prisma db seed   # P1 切片会写 seed.ts
```

### 4. 启动开发服务器

```bash
npm run dev          # Next.js (http://localhost:3000)
npm run worker       # BullMQ worker（评测模块 P2 阶段启动）
```

### 5. 验证 Prisma schema

```bash
npx prisma format    # 格式化
npx prisma validate  # 验证（无需 DB 连接）
```

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
| **P0 地基** | ✅ 脚手架 · schema · 布局 | `npm run build` 通过 · 首页可访问 |
| **P1 认证** | ⏳ 进行中 | 三种角色登录 + 越权拦截 |
| P2 评测内核 | 待启动 | TLE/MLE/AC 正确判分 |
| P3-P8 | 待排期 | |

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
