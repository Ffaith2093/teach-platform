# Python 教学平台

实现前必读：
- `docs/SPEC.md` — 功能需求的唯一依据，有歧义先改 SPEC 再写代码
- `docs/DESIGN.md` — UI 规范的唯一依据，**写任何页面前必须先查这里的色彩变量、间距、组件模式**

## 技术栈（锁定，禁止擅自更换或升级）

Next.js 15 App Router · TypeScript strict · Tailwind · shadcn/ui · Prisma · PostgreSQL 16 · Auth.js v5 · BullMQ + Redis · dockerode · Monaco Editor · react-hook-form + zod · next-themes · lucide-react · framer-motion · recharts

不确定某个库的 API 时，先查 `package.json` 里的实际版本再写，不要凭记忆写可能已废弃的写法。

## 工作方式

- **一次只做一个垂直切片**：schema → API → 页面，做完能在浏览器里看到效果为止。不要一口气铺开多个模块。
- 每完成一个切片，运行 `npm run build`，报错自己修到通过，再告诉我验证。
- 不要为「以后可能需要」写抽象层。三处重复再抽。
- 不要写 mock 数据兜底掩盖接口没通的问题，接口没通就报错。
- **每写一个页面，交付前自查这 5 条**：① 颜色全部走语义变量 ② 有疏密间距对比 ③ 空状态是完整引导页不是一行字 ④ 加载态是骨架屏 ⑤ 深色模式下检查过一遍

## 代码约定

- Server Component 优先，需要交互才加 `"use client"`
- 数据变更走 Server Action，读取走 RSC 直接查 Prisma；只有客户端轮询（如评测结果）才用 Route Handler
- 所有 API/Server Action 入口第一件事是 `requireRole()` 鉴权，封装在 `lib/auth/guard.ts`
- 所有外部输入用 zod schema 校验，schema 放在 `lib/validations/`
- 目录结构：
  ```
  app/(public)/     登录注册等公开页
  app/(student)/    学生端
  app/t/            教师端
  app/admin/        管理端
  app/api/          仅用于轮询/上传/下载
  lib/auth/         鉴权守卫
  lib/judge/        沙箱与评测逻辑
  lib/validations/  zod schemas
  components/ui/    shadcn 生成物，不手改
  worker/           BullMQ 消费进程，独立入口
  ```

## 评测模块红线

- 容器参数必须包含 `--network=none --read-only --cap-drop=ALL --pids-limit=64 --security-opt=no-new-privileges`，任何时候不得为了「方便调试」去掉
- 绝不使用 `--privileged`，绝不挂载临时目录以外的宿主机路径
- 隐藏测试用例的实际输出绝不返回给学生端

## 常用命令

```bash
npm run dev            # 开发
npm run build          # 构建校验，提交前必跑
npx prisma migrate dev # 改完 schema 后执行
npx prisma studio      # 看数据
npm run worker         # 启动评测 worker
docker compose up -d   # 起 postgres + redis
```
