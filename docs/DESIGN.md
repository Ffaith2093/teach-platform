# 设计规范 · 清爽学院风

> 所有 UI 实现必须遵守本文档。写页面前先查这里的 token 和组件模式，不要即兴发挥配色和间距。

---

## 0. 风格定位

**清爽学院风**：天蓝主色、大量留白、细边框、克制的阴影。
气质是「明亮、专业、不压迫」，而不是「炫技、花哨」。

### 三条核心原则

**1. 层次靠留白和字重建立，不靠阴影堆叠**
学院风阴影很轻，所以必须用**间距节奏**和**字号字重对比**来分组信息。
错误做法是所有元素都 `p-4 gap-4 text-sm`——那就是「扁平无趣」的根源。

**2. 主色必须渗透到界面各处**
不是只有按钮是蓝色，其他全是灰。图标、激活态、链接、进度条、选中边框、统计数字、徽章都要带主色，界面才有生气。

**3. 静态克制，交互有反馈**
默认状态干净（细边框、无阴影），hover / focus / active 时才出现颜色变化、轻微阴影、位移。让界面「活」在交互里。

---

## 1. 色彩系统

### 1.1 CSS 变量（写入 `app/globals.css`）

```css
@layer base {
  :root {
    /* 主色 · sky */
    --primary:            199 89% 48%;   /* #0EA5E9 sky-500 */
    --primary-hover:      200 98% 39%;   /* #0284C7 sky-600 */
    --primary-fg:         0 0% 100%;
    --primary-subtle:     204 94% 94%;   /* #E0F2FE sky-100 浅色底 */
    --primary-muted:      201 94% 86%;   /* #BAE6FD sky-200 边框 */

    /* 点缀 · teal（用于「成长/进度」类信息） */
    --accent:             173 80% 40%;   /* #14B8A6 teal-500 */
    --accent-subtle:      166 76% 93%;   /* #CCFBF1 teal-100 */

    /* 语义色 */
    --success:            160 84% 39%;   /* #10B981 通过/已交 */
    --success-subtle:     152 81% 94%;
    --warning:            38 92% 50%;    /* #F59E0B 临近截止 */
    --warning-subtle:     48 96% 89%;
    --danger:             0 84% 60%;     /* #EF4444 错误/逾期 */
    --danger-subtle:      0 93% 94%;

    /* 中性 · slate（不要用纯 gray，slate 带冷调，配 sky 更协调） */
    --background:         0 0% 100%;     /* 页面底 纯白 */
    --surface:            210 40% 98%;   /* #F8FAFC 次级区块底 */
    --card:               0 0% 100%;
    --border:             214 32% 91%;   /* #E2E8F0 细边框 */
    --border-strong:      213 27% 84%;   /* #CBD5E1 强调分隔 */
    --foreground:         222 47% 11%;   /* #0F172A 主文字 */
    --muted-foreground:   215 16% 47%;   /* #64748B 次要文字 */
    --subtle-foreground:  215 20% 65%;   /* #94A3B8 占位/时间戳 */

    --radius: 0.625rem;                   /* 10px 基准圆角 */
  }

  .dark {
    --primary:            199 89% 55%;   /* 深色下提亮，保证对比度 */
    --primary-hover:      199 89% 64%;
    --primary-fg:         222 47% 11%;
    --primary-subtle:     200 60% 16%;
    --primary-muted:      200 50% 26%;

    --accent:             173 70% 50%;
    --accent-subtle:      173 60% 15%;

    --success:            160 70% 45%;
    --success-subtle:     160 60% 14%;
    --warning:            38 85% 58%;
    --warning-subtle:     38 60% 16%;
    --danger:             0 75% 65%;
    --danger-subtle:      0 50% 18%;

    --background:         222 47% 7%;    /* #0B1120 */
    --surface:            222 43% 11%;   /* #0F172A */
    --card:               217 33% 13%;   /* #16202F 卡片比底色稍亮 */
    --border:             217 25% 22%;
    --border-strong:      215 20% 32%;
    --foreground:         210 40% 96%;
    --muted-foreground:   215 18% 65%;
    --subtle-foreground:  215 16% 50%;
  }
}
```

### 1.2 用色规则

| 场景 | 用色 |
|---|---|
| 主按钮、激活导航、链接、选中边框 | `primary` |
| 进度条、完成度、成长类数据 | `accent` (teal) |
| 通过 / 已提交 / AC | `success` |
| 临近截止 / 待批改 / 待审批 | `warning` |
| 逾期 / 错误 / WA、TLE | `danger` |
| 卡片背景 | `card`（浅色下是白，深色下比页面底亮一档） |
| 页面大区块、表头、代码块背景 | `surface` |

**深色模式下语义色一律用 `-subtle` 做底 + 亮色文字**，不要直接把浅色模式的色块搬过去，会刺眼。

---

## 2. 字体与文字层级

### 2.1 字体栈

```css
--font-sans: "Inter", -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", Consolas, monospace;
```

用 `next/font/local` 或 `next/font/google` 加载 Inter 与 JetBrains Mono，**不要用 CDN link**（会闪烁）。

### 2.2 文字阶梯（严格使用，不要自创字号）

| 用途 | 类名 |
|---|---|
| 页面主标题 | `text-2xl font-semibold tracking-tight` |
| 区块标题 | `text-lg font-semibold` |
| 卡片标题 | `text-base font-medium` |
| 正文 | `text-sm text-foreground` |
| 次要说明 | `text-sm text-muted-foreground` |
| 标签/时间戳 | `text-xs text-subtle-foreground` |
| 统计大数字 | `text-3xl font-bold tabular-nums text-primary` |
| 代码 | `font-mono text-[13px]` |

**关键**：一个页面里至少出现 3 个不同字号档位 + 2 个字重档位，否则视觉必然扁平。

数字一律加 `tabular-nums`（等宽数字），表格和倒计时不会跳动。

---

## 3. 间距 · 圆角 · 阴影

### 3.1 间距节奏（学院风的灵魂）

```
页面容器      max-w-7xl mx-auto px-6 lg:px-8 py-8
区块之间      space-y-8      ← 大间隔，形成呼吸感
区块内分组    space-y-4
卡片内边距    p-6            ← 不要 p-4，太局促
紧凑列表项    px-4 py-3
表单字段之间  space-y-5
按钮组        gap-3
```

**疏密对比原则**：相关元素靠紧（`gap-2`），不同分组拉开（`gap-8`）。
禁止整页统一 `gap-4`。

### 3.2 圆角

```
卡片、对话框、大容器   rounded-xl   (12px)
按钮、输入框、下拉     rounded-lg   (8px)
徽章、标签、头像       rounded-full
代码块、表格           rounded-lg
```

### 3.3 阴影（克制使用）

```
默认卡片    无阴影，用 border border-border
hover 卡片  hover:shadow-md hover:shadow-slate-200/60 hover:border-primary/30
浮层/弹窗   shadow-xl
下拉菜单    shadow-lg
```

深色模式下阴影几乎不可见，改用 `dark:hover:border-primary/40` + `dark:hover:bg-card/80` 表达 hover。

---

## 4. 组件模式（直接复用，不要每次重写）

### 4.1 卡片

```tsx
// 基础卡片
<div className="rounded-xl border border-border bg-card p-6">

// 可点击卡片（列表项）
<Link className="group rounded-xl border border-border bg-card p-6
                 transition-all duration-200
                 hover:border-primary/40 hover:shadow-md hover:shadow-slate-200/50
                 dark:hover:shadow-none dark:hover:bg-card/70">
```

关键是 `transition-all duration-200` 和 `group`——没有过渡的 hover 会显得很生硬。

### 4.2 统计卡（Dashboard 用）

```tsx
<div className="rounded-xl border border-border bg-card p-6">
  <div className="flex items-center justify-between">
    <span className="text-sm text-muted-foreground">待批改</span>
    <div className="rounded-lg bg-primary-subtle p-2">
      <FileCheck className="h-4 w-4 text-primary" />   {/* 彩色图标带浅底 */}
    </div>
  </div>
  <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">24</p>
  <p className="mt-1 text-xs text-subtle-foreground">较上周 +6</p>
</div>
```

**图标必须带浅色圆角底**（`bg-primary-subtle p-2 rounded-lg`），这是提升质感最廉价有效的手法。

### 4.3 状态徽章

```tsx
const badge = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"

已通过  `${badge} bg-success-subtle text-success`
待批改  `${badge} bg-warning-subtle text-warning`
已逾期  `${badge} bg-danger-subtle text-danger`
草稿    `${badge} bg-surface text-muted-foreground border border-border`
```

徽章内可加一个 `h-1.5 w-1.5 rounded-full bg-current` 的小圆点，识别度更高。

### 4.4 空状态（每个列表页必须有）

```tsx
<div className="flex flex-col items-center justify-center rounded-xl
                border border-dashed border-border bg-surface/50 px-6 py-16">
  <div className="rounded-full bg-primary-subtle p-4">
    <BookOpen className="h-7 w-7 text-primary" />
  </div>
  <h3 className="mt-4 text-base font-medium">还没有加入任何课程</h3>
  <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
    向老师索取 6 位课程邀请码，即可加入课程开始学习
  </p>
  <Button className="mt-5">输入邀请码</Button>
</div>
```

要素固定为四件：**虚线边框容器 + 带底色的图标 + 标题 + 一句引导文案 + 主行动按钮**。
禁止写成一行「暂无数据」。

### 4.5 骨架屏

列表/卡片加载时用骨架屏，**不要用居中转圈**（会让页面跳动）。

```tsx
<div className="space-y-3">
  {[...Array(4)].map((_, i) => (
    <div key={i} className="rounded-xl border border-border p-6">
      <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
      <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-surface" />
    </div>
  ))}
</div>
```

骨架的形状要贴近真实内容的布局。

### 4.6 页面头部（统一模板）

```tsx
<div className="flex items-end justify-between border-b border-border pb-5">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">编程题库</h1>
    <p className="mt-1 text-sm text-muted-foreground">共 128 道题 · 已通过 43 道</p>
  </div>
  <Button>新建题目</Button>
</div>
```

每个页面都用这个结构，标题下必带一句上下文信息（数量/状态），信息密度立刻上来。

### 4.7 侧边导航

```tsx
// 激活态
"flex items-center gap-3 rounded-lg bg-primary-subtle px-3 py-2
 text-sm font-medium text-primary"

// 默认态
"flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground
 transition-colors hover:bg-surface hover:text-foreground"
```

每项左侧必须带 lucide 图标 `h-4 w-4`。

---

## 5. 微动效（Framer Motion，克制使用）

只在这四个地方用：

| 场景 | 效果 |
|---|---|
| 页面/列表首次出现 | `initial={{opacity:0, y:8}} animate={{opacity:1, y:0}}` duration 0.25，列表项 stagger 0.04 |
| 弹窗/抽屉 | 缩放淡入 `scale: 0.96 → 1` |
| 判题结果逐条出现 | 每条用例结果依次淡入，制造「正在评测」的实时感 |
| 数字变化（分数、通过数） | 数字滚动到目标值 |

**禁止**：整页转场动画、视差滚动、无限循环的装饰动画、超过 300ms 的过渡。
所有动效必须尊重 `prefers-reduced-motion`。

---

## 6. 重点页面专项要求

### 6.1 代码练习页 `/problems/[id]`

- 三栏用 `react-resizable-panels`，可拖拽调整宽度，宽度存 localStorage
- Monaco 主题跟随全局明暗：浅色 `vs`，深色 `vs-dark`；字号 14，`fontFamily: JetBrains Mono`，开启 `bracketPairColorization`
- **判题结果区是本页视觉重点**：
  - 顶部一条总览横幅，AC 用 `success-subtle` 底 + 对勾图标 + 「通过 5/5 · 耗时 12ms」
  - 下方每条用例一行，可展开看输入/期望/实际
  - 失败用例的差异用 `bg-danger-subtle` 高亮，期望与实际左右并排
  - 评测中：按钮内嵌 spinner + 用例逐条从灰变绿的进度感
- 题目描述区 Markdown 用 `prose prose-slate dark:prose-invert prose-sm max-w-none`，代码块背景 `surface`

### 6.2 考试答题页 `/exams/[id]/take`

- 倒计时固定顶栏，剩余 >10 分钟 `text-foreground`，5~10 分钟 `text-warning`，<5 分钟 `text-danger` + 每秒轻微脉冲
- 左侧题号宫格：未答 `border-border bg-card`、已答 `bg-primary text-white`、标记 `bg-warning-subtle border-warning`
- 自动保存指示器：右下角小字「已保存 · 14:32」，保存中显示转圈，失败变红
- 整页去掉侧边栏和多余导航，专注答题

### 6.3 成绩与分析页

- 图表用 `recharts`，颜色直接引用 CSS 变量，不要硬编码色值
- 分数分布用柱状图，及格线画一条 `strokeDasharray` 虚线
- 表格：表头 `bg-surface text-xs font-medium text-muted-foreground uppercase tracking-wide`，行 hover `hover:bg-surface/60`，数字列右对齐 + `tabular-nums`

---

## 7. 深色模式实现

- 用 `next-themes`，`attribute="class"`，默认 `system`
- 切换开关放在顶栏右侧，图标 Sun/Moon
- `<html>` 加 `suppressHydrationWarning` 防止水合警告
- **每写一个组件都要顺手检查深色下的表现**，不要最后统一改——那时会漏掉几十处
- 深色下：不要用纯黑 `#000`，用 `--background: 222 47% 7%`；卡片必须比页面底色亮一档，否则边界消失

---

## 8. 禁止清单

- 禁止硬编码颜色（`text-blue-500`、`#0EA5E9`），一律用语义变量（`text-primary`）
- 禁止整页统一 `p-4 gap-4`，必须有疏密对比
- 禁止「暂无数据」式空状态
- 禁止居中大转圈加载，用骨架屏
- 禁止无 `transition` 的 hover
- 禁止纯灰界面——每屏至少要有主色出现在图标、徽章或数据上
- 禁止用 emoji 当界面图标，统一用 `lucide-react`
- 禁止超过 300ms 的动画
