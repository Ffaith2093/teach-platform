import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FlaskConical,
  GraduationCap,
  ShieldCheck,
  Users,
  Library,
  BarChart3,
} from "lucide-react";

const stats = [
  { num: "1000+", label: "学生容量" },
  { num: "50+", label: "教师协作" },
  { num: "8", label: "核心模块" },
  { num: "6", label: "并发评测" },
];

const features = [
  {
    icon: Code2,
    title: "在线编程评测",
    body: "Monaco 编辑器 + Docker 沙箱，毫秒级 AC/TLE/MLE 反馈，学生提交即时反馈。",
  },
  {
    icon: FlaskConical,
    title: "题目灵活管理",
    body: "支持编程题、选择题、填空题、代码填空四种题型，按难度和标签检索。",
  },
  {
    icon: Users,
    title: "班级自动归属",
    body: "管理员分配教师授课班级，教师开课勾选班级 → 该班学生自动进入。",
  },
  {
    icon: Library,
    title: "课程资源共享",
    body: "课件、资料统一上传下载，目录结构清晰，未选课学生无法访问。",
  },
  {
    icon: ShieldCheck,
    title: "沙箱安全隔离",
    body: "断网 + 只读根文件系统 + 资源限制，恶意代码无法影响宿主机。",
  },
  {
    icon: BarChart3,
    title: "成绩自动汇总",
    body: "作业 + 考试按课程和班级自动聚合，区分度、高频错误一目了然。",
  },
];

const workflow = [
  { step: "01", title: "管理员初始化", body: "创建年级、班级、教师账号，分配教师授课班级。" },
  {
    step: "02",
    title: "教师建设课程",
    body: "选择所教班级 → 上传资源 → 出题（编程题可挂自动评测）。",
  },
  {
    step: "03",
    title: "学生学习与提交",
    body: "进入课程 → 完成作业 → 编程题提交即时得到 AC/WA/TLE 反馈。",
  },
  { step: "04", title: "教师批改与反馈", body: "客观题自动判分，主观题人工批改，评语逐题反馈。" },
];

const roles = [
  {
    title: "学生",
    color: "primary",
    points: ["自动归属所在班级课程", "在线答题、提交代码", "实时查看成绩与评语"],
  },
  {
    title: "教师",
    color: "accent",
    points: ["管理所教班级学生", "建设课程、上传资源", "出题、组卷、自动 + 人工批改"],
  },
  {
    title: "管理员",
    color: "warning",
    points: ["维护年级、班级、教师", "批量导入学生、分配班级", "管理公共题库与系统设置"],
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-subtle/40 via-background to-background">
        <div className="container py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              面向高中 Python 编程课
            </div>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              教 · 练 · 考 · 评
              <br />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                一站闭环的教学平台
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground">
              覆盖作业、题库、考试、成绩分析完整链路；学生在线提交代码即时评测，教师专注教学与反馈。
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary-hover"
              >
                立即登录 <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="#features"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-6 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                了解更多
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border bg-background py-12">
        <div className="container">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-card p-6 text-center">
                <div className="num text-3xl font-bold tracking-tight text-primary">{s.num}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-background py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">核心功能</h2>
            <p className="mt-3 text-muted-foreground">
              教学场景中真正会用到的功能，每个模块都做到可上线。
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="bg-card p-7">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y border-border bg-muted/30 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">使用流程</h2>
            <p className="mt-3 text-muted-foreground">从初始化到成绩反馈，四步走通完整教学闭环。</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((w) => (
              <div key={w.step} className="relative rounded-2xl border border-border bg-card p-6">
                <div className="num text-3xl font-bold text-primary/30">{w.step}</div>
                <h3 className="mt-3 text-base font-semibold">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="bg-background py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">三种角色 · 分工明确</h2>
            <p className="mt-3 text-muted-foreground">每个角色只看与自己相关的内容与操作。</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {roles.map((r) => (
              <div key={r.title} className="rounded-2xl border border-border bg-card p-7">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full bg-${r.color}-subtle px-2.5 py-0.5 text-xs font-medium text-${r.color}`}
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  {r.title}
                </div>
                <ul className="mt-5 space-y-2.5">
                  {r.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-gradient-to-b from-background to-primary-subtle/40 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">开始使用 PyLearn</h2>
            <p className="mt-3 text-muted-foreground">
              教师与学生账号由管理员统一创建，请联系学校信息中心获取。
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-md transition-all hover:bg-primary-hover"
            >
              前往登录 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-background py-10">
        <div className="container flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground md:flex-row">
          <div>© 2026 PyLearn · 高中 Python 编程教学平台</div>
          <div className="flex items-center gap-5">
            <span>福建省厦门双十中学</span>
            <span>·</span>
            <span>技术栈：Next.js + Prisma + PostgreSQL + Docker</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
