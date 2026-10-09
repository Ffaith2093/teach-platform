# Python 教学平台 · 需求规格说明书

> 本文档是实现的唯一依据。任何代码实现前先对照本文档，有歧义先改文档再写代码。

---

## 0. 项目定位

面向**高中** Python 编程课的教学平台，覆盖「教 — 练 — 考 — 评」完整闭环。
单校部署，规模 100~~1000 名学生，20~~50 名教师。

**面向高中的核心特征**：组织结构 = **年级 → 班级 → 学生**，教师归属某几个班级授课。课程不再用邀请码加入，而是教师在课程里选定班级后，**该班学生自动进入课程**。

### 技术栈（锁定，不得擅自更换）

| 层         | 选型                                                       |
| ---------- | ---------------------------------------------------------- |
| 框架       | Next.js 15 (App Router) + TypeScript strict                |
| UI         | Tailwind CSS + shadcn/ui                                   |
| 表单       | react-hook-form + zod                                      |
| 数据库     | PostgreSQL 16                                              |
| ORM        | Prisma                                                     |
| 认证       | Auth.js (NextAuth v5) · Credentials Provider · JWT session |
| 队列       | BullMQ + Redis                                             |
| 代码沙箱   | Docker (dockerode 调用本机 daemon)                         |
| 代码编辑器 | Monaco Editor (@monaco-editor/react)                       |
| 文件存储   | 本地磁盘 `./uploads`（预留 S3 适配层接口）                 |
| 部署       | docker-compose：web + postgres + redis + worker            |

### 服务器规格

单台 4C8G。并发评测容器数上限 6，超出排队。

---

## 1. 角色与权限

### 1.1 三种角色

| 角色         | 获得方式                                                                                             | 核心权限                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ADMIN 管理员 | 系统初始化时通过 seed 脚本创建，不可注册                                                             | 维护年级/班级、**直接创建教师账号**、批量导入学生、为新教师分配授课班级、查看全站数据、系统设置 |
| TEACHER 教师 | **由管理员直接创建账号**（无需注册、无需审批），可一并勾选授课班级（**每个班级只能有一位任课教师**） | 在自己任课的班级里开设课程、出题、批改；可邀请其他教师作为协作者参与单门课程                    |
| STUDENT 学生 | 管理员按班级批量导入                                                                                 | 登录即看到自己班级所属的课程，无需任何操作                                                      |

### 1.2 账号状态机

```
教师/学生：创建即 ACTIVE
任意账号：ACTIVE ──管理员禁用──→ DISABLED ──启用──→ ACTIVE
```

- 创建时直接 ACTIVE，初始密码由系统生成或管理员指定，可选强制首次登录修改
- 管理员向教师分配班级 = 直接占用该班，自动顶替原教师；原教师收到「已移交 X 个班级」系统消息
- DISABLED 状态直接拒绝登录，提示「账号已停用，请联系管理员」
- 教师账号不再有注册入口；管理员也无须再处理「审批队列」

### 1.3 权限校验规则

- 所有 `/api/**` 路由在处理前必须校验 session 与角色
- 资源级权限：
  - 教师对课程的操作通过 `CourseTeacher` 表判定（详见 2.1），支持主教师/助教/外聘三种角色
  - 学生只能访问自己班级所属课程下的资源
- 权限校验封装为 `lib/auth/guard.ts` 中的 `requireRole()` / `requireCourseMember()` / `requireClassStudent()`，禁止在业务代码里散写 if 判断

---

## 2. 数据模型

### 2.1 年级、班级、用户与课程

**高中组织结构**：

```
Grade (年级) ─┬─ Class (班级) ── Student (学生)
              └─ Class (班级) ── Student
GradeTeacher ── Teacher (年级组长，可有可无)
ClassTeacher ── Teacher (该班任课教师，多对多)
```

**关键概念**：

- **班级归管理员创建和归属**，教师和学生都不能自建班级
- **教师授课关系由管理员分配**（在「教师管理」页勾选班级），分配后教师才能在课程里选这些班
- **课程与班级是多对多**：教师在课程里勾选班级 → **该班所有学生自动成为课程成员**，无需学生操作

```prisma
model Grade {
  id        String   @id @default(cuid())
  name      String   @unique           // "高一年级"
  order     Int      @default(0)        // 排序用
  isActive  Boolean  @default(true)     // 毕业/合并后可停用
  createdAt DateTime @default(now())
  classes   Class[]
}

model Class {
  id        String   @id @default(cuid())
  gradeId   String
  name      String                       // "高一(1)班"
  joinYear  Int                          // 入学年份，如 2024
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  grade     Grade    @relation(fields: [gradeId], references: [id])
  students  Student[]
  teachers  ClassTeacher[]
  @@unique([gradeId, name])
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role          // ADMIN | TEACHER | STUDENT
  status       UserStatus @default(PENDING)
  // STUDENT 字段
  studentNo    String? @unique        // 学号，学校内唯一
  classId      String?                // 归属于哪个班级
  class        Class? @relation(fields: [classId], references: [id])
  // TEACHER 字段
  teacherNo    String? @unique        // 工号
  subjects     String[]               // 教学科目，如 ["信息技术","通用技术"]
  // 通用
  phone        String?
  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())
}

model ClassTeacher {
  id        String   @id @default(cuid())
  classId   String   @unique         // ← 每个班级只能有一位任课教师
  teacherId String
  role      ClassTeacherRole @default(SUBJECT_TEACHER)
  createdAt DateTime @default(now())
  class     Class @relation(fields: [classId], references: [id])
  teacher   User  @relation(fields: [teacherId], references: [id])
  // 无中间表：想要换老师就更新 teacherId；想取消分配就删除记录
  // 一位教师可担任多个班级，关系是 N : 1（教师 → 班级）
}

model Course {
  id          String   @id @default(cuid())
  title       String
  description String?  @db.Text
  coverUrl    String?
  semester    String                   // "2025-2026 学年 上学期"
  category    CourseCategory            // 课程分类（管理员用于分组）
  isArchived  Boolean  @default(false)
  createdAt   DateTime @default(now())
  classes     CourseClass[]
  teachers    CourseTeacher[]
}

enum CourseCategory {
  DATA               // 数据
  ALGORITHM          // 算法
  AI                 // 人工智能
  NETWORK            // 计算机网络
  INTERDISCIPLINARY  // 多学科交叉
}

model CourseClass {
  id        String   @id @default(cuid())
  courseId  String
  classId   String
  addedAt   DateTime @default(now())
  addedById String                     // 操作者（必须是该课程的教师）
  course    Course @relation(fields: [courseId], references: [id])
  class     Class  @relation(fields: [classId], references: [id])
  @@unique([courseId, classId])
}

model CourseTeacher {
  id        String   @id @default(cuid())
  courseId  String
  teacherId String
  role      CourseTeacherRole    // OWNER(主教师) | ASSISTANT(助教) | CONTRIBUTOR(外聘)
  addedAt   DateTime @default(now())
  course    Course @relation(fields: [courseId], references: [id])
  teacher   User   @relation(fields: [teacherId], references: [id])
  @@unique([courseId, teacherId])
}

enum CourseTeacherRole {
  OWNER        // 主教师：所有权限 + 转让课程
  ASSISTANT    // 助教：批改、出题、发布作业（不能删除/转让）
  CONTRIBUTOR  // 外聘：只可出题、改题
}

enum ClassTeacherRole {
  SUBJECT_TEACHER  // 任课教师
}
```

**学生查看课程的逻辑**：

```sql
-- 学生在哪些课程里？
SELECT DISTINCT c.*
FROM Course c
JOIN CourseClass cc ON c.id = cc.courseId
WHERE cc.classId = (SELECT classId FROM User WHERE id = :userId)
```

**教师权限判定**：

```sql
-- 教师对课程是否具某操作权限
SELECT role FROM CourseTeacher
WHERE courseId = :cid AND teacherId = :uid
```

- 操作「删除课程 / 转让课程 / 移除协作者」→ 必须 OWNER
- 操作「批改 / 发布作业 / 创建考试」→ OWNER 或 ASSISTANT
- 操作「出题 / 改题」→ 任意角色
- 教师只能在 CourseClass 里选「由管理员分配给自己的班级」（见 3.4）

### 2.2 课程资源

```prisma
model Resource {
  id         String   @id @default(cuid())
  courseId   String
  name       String              // 显示名
  storedName String              // 磁盘上的实际文件名（UUID，防路径穿越）
  mimeType   String
  sizeBytes  Int
  folder     String   @default("/")  // 简单的虚拟目录，如 "/第一章"
  uploaderId String
  downloads  Int      @default(0)
  createdAt  DateTime @default(now())
}
```

**约束**：单文件 ≤ 100MB。白名单扩展名 `pdf docx pptx xlsx zip py ipynb md txt png jpg mp4`。
文件通过 `/api/resources/[id]/download` 鉴权后以流式返回，**绝不暴露静态目录**。

### 2.3 题库与编程题

```prisma
model Problem {              // 编程题（可独立练习，也可挂到作业/试卷）
  id           String   @id @default(cuid())
  title        String
  description  String   @db.Text      // Markdown
  difficulty   Difficulty  // EASY | MEDIUM | HARD
  timeLimitMs  Int      @default(3000)
  memoryLimitMb Int     @default(128)
  starterCode  String?  @db.Text      // 初始代码模板
  referenceSolution String? @db.Text  // 参考答案，仅教师可见
  tags         String[]               // 引用自管理员维护的标签集
  authorId     String
  isPublic     Boolean  @default(false) // 是否共享到公共题库
  createdAt    DateTime @default(now())
}

model TestCase {
  id        String  @id @default(cuid())
  problemId String
  input     String  @db.Text
  expected  String  @db.Text
  isSample  Boolean @default(false)  // 样例对学生可见，其余隐藏
  score     Int     @default(10)     // 该用例分值
  order     Int
}

model Question {             // 试卷/作业中的题目
  id          String @id @default(cuid())
  bankId      String?         // 属于哪个题库，null 表示试卷内临时题
  type        QuestionType    // SINGLE_CHOICE | FILL_BLANK | CODE_BLANK | PROGRAMMING
  content     String @db.Text // Markdown 题干
  options     Json?           // 单选：[{key:"A", text:"..."}]
  answer      Json?           // 单选："A" / 填空：["答案1","答案2"] / 代码填空：["x+1"]
  problemId   String?         // type=PROGRAMMING 时关联 Problem
  score       Int
  difficulty  Difficulty
  tags        String[]
  explanation String? @db.Text  // 解析，交卷后可选展示
}

model QuestionBank {
  id       String @id @default(cuid())
  name     String
  courseId String?
  ownerId  String
}
```

**代码填空题（CODE_BLANK）说明**：题干中用 `{{1}}` `{{2}}` 标记空位，前端渲染为代码块中的内联输入框。判分时逐空严格比对（可配置去除首尾空白）。

### 2.4 作业

```prisma
model Assignment {
  id          String   @id @default(cuid())
  courseId    String
  title       String
  description String   @db.Text
  dueAt       DateTime
  allowLate   Boolean  @default(true)
  latePenalty Int      @default(20)   // 迟交扣百分比
  totalScore  Int
  publishedAt DateTime?               // null = 草稿
  createdAt   DateTime @default(now())
}

model AssignmentProblem {   // 作业挂载的编程题
  assignmentId String
  problemId    String
  score        Int
  order        Int
  @@id([assignmentId, problemId])
}

model AssignmentSubmission {
  id           String   @id @default(cuid())
  assignmentId String
  studentId    String
  textContent  String?  @db.Text   // 文字作答
  fileUrl      String?             // 附件
  autoScore    Int?                // 编程题自动得分
  manualScore  Int?                // 教师手改分
  finalScore   Int?                // 最终分（含迟交扣分）
  feedback     String?  @db.Text
  status       SubmissionStatus    // DRAFT|SUBMITTED|GRADED|RETURNED
  submittedAt  DateTime?
  gradedById   String?
  gradedAt     DateTime?
  @@unique([assignmentId, studentId])
}
```

### 2.5 试卷与考试

```prisma
model Exam {
  id              String   @id @default(cuid())
  courseId        String
  title           String
  instructions    String?  @db.Text
  durationMin     Int                    // 答题时长
  openAt          DateTime               // 开放进入时间
  closeAt         DateTime               // 强制关闭时间
  shuffleQuestion Boolean  @default(true)
  shuffleOption   Boolean  @default(true)
  showResultMode  ResultMode // IMMEDIATELY | AFTER_CLOSE | AFTER_GRADED | NEVER
  totalScore      Int
  status          ExamStatus // DRAFT | PUBLISHED | CLOSED
  drawRules       Json?      // 抽题规则，见下
}

model ExamQuestion {         // 固定组卷时使用
  examId     String
  questionId String
  score      Int
  order      Int
  @@id([examId, questionId])
}

model ExamAttempt {
  id           String   @id @default(cuid())
  examId       String
  studentId    String
  questionIds  String[]              // 该学生的实际题目序列（抽题+乱序后固化）
  startedAt    DateTime @default(now())
  deadlineAt   DateTime              // = startedAt + durationMin，服务端计算
  submittedAt  DateTime?
  isAutoSubmit Boolean  @default(false)
  autoScore    Int?
  manualScore  Int?
  finalScore   Int?
  status       AttemptStatus // IN_PROGRESS | SUBMITTED | GRADING | GRADED
  @@unique([examId, studentId])
}

model Answer {
  id          String @id @default(cuid())
  attemptId   String
  questionId  String
  content     Json                 // 学生作答内容，结构随题型
  autoScore   Int?
  manualScore Int?
  comment     String? @db.Text
  gradedById  String?
  @@unique([attemptId, questionId])
}
```

### 2.6 课程章节

```prisma
model Chapter {
  id          String   @id @default(cuid())
  courseId    String
  title       String
  description String?  @db.Text
  order       Int                          // 章节序号（courseId 内单调）
  createdAt   DateTime @default(now())

  course      Course      @relation(fields: [courseId], references: [id], onDelete: Cascade)
  assignments Assignment[]
  exams       Exam[]

  @@unique([courseId, order])
  @@index([courseId])
}
```

**章节归属**：`Assignment.chapterId String?` 与 `Exam.chapterId String?` 为可空外键，删除章节时 `SetNull`（作业/考试保留但 chapterId 清空）；新建时若不选章节则置空，列表中归入「未分组」。

**章节管理**：

- 教师（OWNER / ASSISTANT）可在 `/t/courses/[id]` 创建 / 编辑 / 删除章节
- 章节顺序通过 `order` 字段递增；可在章节详情页用 ↑/↓ 调整（V1 实现）
- 章节可挂载任意数量的作业与考试；学生可按章节查看课程内容

**抽题规则 `drawRules` 结构**：

```json
{
  "bankId": "bank_xxx",
  "rules": [
    { "type": "SINGLE_CHOICE", "difficulty": "EASY", "count": 10, "scorePerQuestion": 2 },
    { "type": "FILL_BLANK", "difficulty": "MEDIUM", "count": 5, "scorePerQuestion": 4 },
    { "type": "PROGRAMMING", "tags": ["循环"], "count": 2, "scorePerQuestion": 20 }
  ]
}
```

学生首次进入考试时执行抽题，结果写入 `ExamAttempt.questionIds` 并固化，刷新页面不重新抽题。

### 2.7 出勤日志

学生访问课程/作业/考试页时由服务端调用 `recordAccess()` 落点一条 `AccessLog`。**页面内按日去重计「出勤」**：同一学生同一课程同一天多次落点只算一次到课。

```prisma
model AccessLog {
  id        String   @id @default(cuid())
  userId    String
  courseId  String?               // 可空：未来扩展支持登录等无课程访问记录
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course? @relation(fields: [courseId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])
  @@index([courseId, createdAt])
  @@index([userId, courseId, createdAt])
}
```

**打点触发位点**（详见 §4.2 学生路由）：

- 学生提交作业 → `submitProblemAction` 内 `recordAccess({ userId, courseId })`
- 学生交卷考试 → `submitExamAction` 内 `recordAccess({ userId, courseId })`
- 学生进入课程页 → `recordAccess`（每次 RSC 渲染打点；浏览器侧 dedupe 同 `(userId, courseId, 天)` 一日一条）

**去重规则**：`/dashboard` 出勤 widget 按 `(userId, courseId, createdAt::date)` 去重生成 7 天网格；教师班级出勤页同样按日去重，与访问条数无关。

### 2.8 提交与评测

```prisma
model Submission {
  id          String   @id @default(cuid())
  problemId   String
  userId      String
  code        String   @db.Text
  language    String   @default("python3.11")
  status      JudgeStatus  // PENDING|JUDGING|ACCEPTED|WRONG_ANSWER|TLE|MLE|RUNTIME_ERROR|COMPILE_ERROR|SYSTEM_ERROR
  score       Int      @default(0)
  passedCount Int      @default(0)
  totalCount  Int      @default(0)
  maxTimeMs   Int?
  maxMemoryKb Int?
  errorMsg    String?  @db.Text
  contextType ContextType  // PRACTICE | ASSIGNMENT | EXAM
  contextId   String?
  createdAt   DateTime @default(now())
}

model JudgeCase {
  id         String @id @default(cuid())
  submissionId String
  testCaseId String
  status     JudgeStatus
  timeMs     Int?
  memoryKb   Int?
  actualOutput String? @db.Text  // 隐藏用例不返回给学生
}
```

---

## 3. 核心流程

### 3.1 代码评测流程（最关键）

```
学生点「提交」
  │
  ├─1. API 校验：登录态 / 是否有权做此题 / 代码长度 ≤ 64KB / 提交频率限制（10秒1次）
  │
  ├─2. 创建 Submission (status=PENDING)，立即返回 submissionId 给前端
  │
  ├─3. 推入 BullMQ 队列 judge-queue
  │
  ├─4. Worker 消费（并发上限 6）：
  │     a. mkdtemp 创建临时目录 /tmp/judge-{uuid}
  │     b. 写入 main.py
  │     c. 逐个测试用例执行容器：
  │        docker run --rm
  │          --network=none              # 断网
  │          --memory=128m --memory-swap=128m
  │          --cpus=0.5
  │          --pids-limit=64             # 防 fork 炸弹
  │          --read-only                 # 根文件系统只读
  │          --tmpfs /tmp:size=16m
  │          --cap-drop=ALL
  │          --security-opt=no-new-privileges
  │          -v /tmp/judge-{uuid}:/code:ro
  │          -u 65534:65534              # nobody
  │          python:3.11-slim
  │          timeout -s KILL 3 python /code/main.py
  │        stdin 喂入 testCase.input，捕获 stdout/stderr/exitCode/耗时
  │     d. 比对输出：默认「忽略行尾空白 + 忽略末尾空行」的宽松比对
  │     e. 任一用例非 ACCEPTED 则整体状态取第一个失败状态
  │     f. 写入 Submission + JudgeCase，清理临时目录
  │
  └─5. 前端轮询 GET /api/submissions/[id]（1秒间隔，最多60次）拿结果
```

**必须遵守的安全红线**：

- 容器绝不挂载宿主机任何非临时目录
- 绝不使用 `--privileged`
- 单次评测总时长硬上限 30 秒，超时强制 kill 容器
- Worker 进程崩溃时，队列任务自动重试 1 次，二次失败标记 SYSTEM_ERROR
- 学生只能看到样例用例的实际输出；隐藏用例只返回「通过/不通过」

**判题状态判定优先级**：

```
容器 exitCode=137 或超 timeout      → TLE
stderr 含 MemoryError / OOM killed   → MLE
exitCode ≠ 0                        → RUNTIME_ERROR（返回 stderr 前 2000 字符）
语法错误（SyntaxError）              → COMPILE_ERROR
输出不匹配                           → WRONG_ANSWER
全部匹配                             → ACCEPTED
```

### 3.2 考试流程

```
教师：创建试卷（固定组卷 or 配置抽题规则）→ 设置时间与时长 → 发布
  │
学生：openAt 后可见「进入考试」
  │
  ├─ 点击进入 → 服务端创建 ExamAttempt，计算 deadlineAt = now + durationMin，抽题固化
  ├─ 答题页每 15 秒自动保存草稿到 Answer（防断网丢失）
  ├─ 倒计时以服务端 deadlineAt 为准，前端每 30 秒与服务端校时
  ├─ 提交 / 到点自动交卷 / 关闭页面后到点由定时任务兜底自动交卷
  │
  └─ 交卷后：
       客观题（单选/填空/代码填空）立即自动判分
       编程题推入评测队列，判完写回 autoScore
       全部自动判分完成 → status=GRADING（若含需人工复核题）或 GRADED
  │
教师：进入批改页 → 按题批改（可覆盖自动分）→ 提交成绩 → status=GRADED
  │
学生：按 showResultMode 规则查看成绩与解析
```

**自动交卷兜底**：Worker 每分钟扫描 `status=IN_PROGRESS AND deadlineAt < now()` 的 attempt，强制提交并标记 `isAutoSubmit=true`。

### 3.3 学生批量导入

管理员上传 Excel/CSV，列：`姓名, 学号, 邮箱, 班级`。

**班级强校验**：这里的「班级」必须是系统中已存在的班级（在校验时强校验），不能由导入创建班级。导入流程分三步：

**第一步：选班级**——管理员先在下拉框中选择班级，**只导入指定班级的学生**。文件格式：

```
姓名, 学号, 邮箱
张三, 20240101, zhangsan@school.edu
李四, 20240102, lisi@school.edu
```

**第二步：上传文件**——拖拽或选择 CSV/XLSX 文件，系统解析行数、编码、列结构。

**第三步：严格校验（all-or-nothing）**：

- 校验规则：姓名 / 学号不可为空；学号须为 8 位数字；**邮箱可为空**，若填写则须为合法格式（含 @ 与 .）且全校唯一；学号全校唯一
- **任一行不合规即整体拒绝**（return false），不提供行内编辑、不提供「跳过 / 覆盖」策略
- 校验通过：展示只读预览表（前 5 行 + 总数）→「确认导入」按钮激活
- 校验未通过：展示失败行清单（行号 / 原始内容 / 失败原因），按钮变为「重新上传」；**已选班级与文件状态保留**，修正文件后重新上传即可再次校验
- 校验规则提示常驻底部提醒

**确认导入** → 批量创建，初始密码 = 学号后6位，status=ACTIVE，标记 mustChangePassword → 自动下载 CSV（含初始密码）供管理员分发。

学生首次登录强制跳转修改密码页。

### 3.4 班级管理与教师分配

**班级管理**（管理员专属）：

- 年级管理：创建/编辑/停用年级（停用年级会级联停用其下所有班级）
- 班级管理：创建班级时选择所属年级、填写班级名（如「高一(1)班」）和入学年份
- 班级导入（可选）：上传 CSV 一键创建年级和班级

**教师分配**（管理员专属）：

- 一个班级必须有且仅有一位任课教师，由一名教师独占
- 入口 1（教师视角）：进入教师详情页 → 「分配班级」Tab，列出所有**未被分配**或**当前由该教师任教**的班级。勾选 → 直接占用该班（自动替换原教师）
- 入口 2（班级视角）：进入班级详情页 → 「任课教师」Tab，显示当前任课教师 + 「更换教师」按钮
- 教师在自己课程里「选班级」时，只能看到自己任课的班级
- 班级转移：中途调班，管理员将学生从 A 班批量转出到 B 班，**自动同步该班所有课程的成员关系，不删除历史作业**

---

## 4. 页面清单

### 4.1 公开页

| 路由                    | 说明                                         |
| ----------------------- | -------------------------------------------- |
| `/`                     | 落地页：平台介绍 + 登录入口                  |
| `/login`                | 登录（邮箱或学号/工号 + 密码）               |
| `/change-password`      | 首次登录强制改密                             |
| ~~`/register/teacher`~~ | **教师不开放自助注册**，统一由管理员创建账号 |
| ~~`/pending`~~          | **已废弃**（无审批流程）                     |
| ~~`/register`~~         | **学生不开放注册**，统一由管理员按班级导入   |

### 4.2 学生端

| 路由                                 | 关键内容                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `/dashboard`                         | 待办卡片（未交作业、进行中考试）、近期成绩、我的课程、班级公告                                               |
| `/my-class`                          | **我的班级**：班级名、年级、任课教师、花名册（仅显示头像）、班级整体成绩动态                                 |
| `/courses`                           | 我的课程列表（自动按班级归属），不再有「输入邀请码加入」按钮                                                 |
| `/courses/[id]`                      | 课程首页：公告、**章节**、作业、考试、资源 5 个 Tab                                                          |
| `/courses/[id]/chapters/[chapterId]` | **章节详情**：章节基本信息 + 本章节作业（带状态/得分）+ 本章节考试（带状态/得分）                            |
| `/courses/[id]/resources`            | 资源树形浏览 + 下载                                                                                          |
| `/assignments`                       | 作业列表（按截止时间排序，含状态徽章）                                                                       |
| `/assignments/[id]`                  | 作业详情 + 作答区（文字/附件/内嵌编程题）                                                                    |
| `/problems`                          | 题库练习：筛选（难度/标签/通过状态）+ 列表                                                                   |
| `/problems/[id]`                     | **三栏布局**：左题目描述 / 中 Monaco 编辑器 / 右测试结果                                                     |
| `/submissions`                       | 我的提交记录 + 状态 + 可回看代码                                                                             |
| `/exams`                             | 考试列表（未开始/进行中/已结束）                                                                             |
| `/exams/[id]`                        | 考试须知页（时长、题量、注意事项）+ 「开始答题」                                                             |
| `/exams/[id]/take`                   | 答题页：顶部固定倒计时、左侧题号导航面板、右侧当前题、自动保存指示                                           |
| `/exams/[id]/result`                 | 成绩详情、逐题得分、教师评语、解析                                                                           |
| `/grades`                            | 我的成绩单：作业 + 考试汇总，含**班级平均分对比 + 班级排名**（按课程分组的「vs 班均」「第 N / 总人数」对比） |

### 4.3 教师端（`/t/*`）

| 路由                                   | 关键内容                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/t/dashboard`                         | **我教的班级**（卡片网格） + 待批改数量 + 今日课程                                                                                                                                                    |
| `/t/classes`                           | **我负责的班级**列表：每班学生人数、各班成绩概览                                                                                                                                                      |
| `/t/classes/[id]`                      | 单班管理：花名册、班级学生成绩单、班级公告、班级整体趋势                                                                                                                                              |
| `/t/courses`                           | 我的课程列表（每个课程的协作教师缩略头像） + 新建                                                                                                                                                     |
| `/t/courses/new`                       | **创建课程**：填写基本信息 → **勾选授课班级**（多选，仅显示已分配的班级）→ 选择协作者                                                                                                                 |
| `/t/courses/[id]`                      | 课程详情：基本信息 + 班级列表 + 协作者列表 + **章节列表（章节 CRUD 入口）** + **成绩分析**（整体作业/考试均分与提交率，按评估列单列班级均分 + 提交数 + 跳详情）+ 按班级进入出勤明细             |
| `/t/courses/[id]/attendance`           | 先选择课程班级，再单独查看该班过去 30 天的出勤率、每日到课和访问明细；禁止混合多个班级统计                                                                                                     |
| `/t/courses/[id]/chapters/[chapterId]` | **章节详情**：章节基本信息 + 本章节作业列表 + 本章节考试列表 + 「在此章节新建作业/考试」按钮                                                                                                          |
| `/t/courses/[id]/students`             | 选班学生名单（自动汇总），可按班级分组查看                                                                                                                                                            |
| `/t/courses/[id]/resources`            | 资源上传（拖拽多文件）、目录管理（新建 / 删除空目录或含子文件目录）、单文件删除                                                                                                                       |
| `/t/assignments`                       | 作业列表 + 发布状态                                                                                                                                                                                   |
| `/t/assignments/new`                   | 创建作业：基本信息 → 挂载编程题 → 设置分值与截止                                                                                                                                                      |
| `/t/assignments/[id]/submissions`      | 提交总览表（按班级分组的「谁交了/没交」）+ 批量导出 CSV（支持按班级筛选）                                                                                                                             |
| `/t/assignments/[id]/grade`            | **批改页**：左学生列表 / 右作答内容 + 打分框 + 评语，键盘上下切换                                                                                                                                     |
| `/t/problems/new`                      | 编辑器：题目 Markdown、限制、初始代码、参考答案、**测试用例增删（支持批量粘贴）**                                                                                                                     |
| `/t/problems/[id]/test`                | 用参考答案跑一遍全部用例，验证题目正确性（**发布前必须通过**）                                                                                                                                        |
| `/t/problems`                          | （重定向到 `/t/banks/programming`）                                                                                                                                                                   |
| `/t/banks`                             | （重定向到 `/t/banks/programming`）                                                                                                                                                                   |
| `/t/banks/[id]`                        | 单个题库详情（教师私有视角，owner 校验；管理员放行可编辑所有题库）                                                                                                                                    |
| `/t/banks/preview/[id]`                | **学生视角预览页**：根据 id 自动识别 Question 或 Problem，渲染学生作答界面；头部展示标题/类型/难度/分数/引用次数/所属题库（题）/作者（编程题）/tags/isPublic/时间戳，作者或管理员可见「编辑题目」入口 |
| `/t/banks/choice`                      | **选择题公共库**：所有 `Question(type=SINGLE_CHOICE)` 共享 · 可直接新建并选择所属题库 · 编号 + 题干预览 · 来源筛选（全部/我创建/他人）+ 难度筛选 · 操作列：预览图标 + 编辑图标（仅自己的）              |
| `/t/banks/fill`                        | **填空题公共库**：所有 `Question(type=FILL_BLANK)` 共享 · 可直接新建并选择所属题库 · 编号 + 题干预览 + 答案 + 所属题库 + 引用数 · 来源/难度筛选 · 操作列：预览图标 + 编辑图标（仅自己的）               |
| `/t/banks/programming`                 | **编程题公共库**：所有 `Problem` 共享 · 编号 + 标题 + 难度 + 标签 + 作者 + 用例数 + 引用数 + 最后编辑 · 来源/难度筛选 · 操作列：预览图标 + 编辑图标（仅自己的）                                       |
| `/t/exams`                             | 试卷列表                                                                                                                                                                                              |
| `/t/exams/new`                         | 创建试卷：基本信息 → 选择「固定组卷 / 抽题规则」→ 预览 → 发布                                                                                                                                         |
| `/t/exams/[id]/monitor`                | 考试进行中：谁已进入、已提交、剩余时间（按班级分屏）                                                                                                                                                  |
| `/t/exams/[id]/grade`                  | 主观题/编程题人工复核，可覆盖自动分                                                                                                                                                                   |
| `/t/exams/[id]/analytics`              | 分数分布直方图、题目通过率、区分度、高频错误                                                                                                                                                          |

### 4.4 管理员端（`/admin/*`）

| 路由                                       | 关键内容                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `/admin/dashboard`                         | 全站统计：年级数、班级数、教师数、学生数、今日提交量、评测队列长度                                    |
| `/admin/students`                          | **学生管理 · 全部年级**：以入学年份命名的年级列表 · 创建新年级 · 设置毕业                             |
| `/admin/students/[gradeId]`                | **学生管理 · 班级列表**：所选年级下的全部班级 · 创建班级 · 删除班级                                   |
| `/admin/students/[gradeId]/[classId]`      | **学生管理 · 学生名单**：所选班级的全部学生 · 新增学生 · 删除学生 · 查看学生信息 · 修改学生密码       |
| `/updates`、`/t/updates`、`/admin/updates` | 学生、教师、管理员各自可访问的版本更新记录                                                            |
| `/admin/students/import`                   | 批量导入子页：选班级 → 上传 → 预览校验 → 确认 → 导出初始密码（仅在班级详情页有入口）                  |
| `/admin/students/transfer`                 | **学生转班**：按班级筛选学生 → 批量转出到另一班级（从学生名单页的工具栏进入）                         |
| `/admin/teachers`                          | **教师管理**：列表 + 新建（创建账号 + 同时分配授课班级）                                              |
| `/admin/teachers/new`                      | **新建教师**：基本信息 + 教学信息 + 分配班级 + 初始密码策略                                           |
| `/admin/teachers/[id]`                     | 教师详情：基本信息 + **分配班级** Tab（列出未分配/本教师任课的班级，勾选即占用，自动替换原教师）      |
| `/admin/courses`                           | **课程管理**：按分类（数据/算法/人工智能/计算机网络/多学科交叉）筛选 + 查看所有者与共享者 + 归档/恢复 |
| `/admin/banks`                             | **题库管理**：Tab 切换「公共题目 / 标签管理」— 题目增删与标签增删改                                   |
| `/admin/judge`                             | 评测队列监控：等待数、运行中、失败任务、可重试                                                        |
| `/admin/settings`                          | 全局配置：注册开关、上传大小上限、评测并发数                                                          |

**学生管理 3 级层级**：

- 年级以**入学年份**命名（如「高一年级(2024 入学)」），创建时只需指定名称与入学年份；
- 班级归属于年级，1:1 独占任课教师（见 §2.1 ClassTeacher），删除班级前必须先转移或清空学生；
- 学生归属于班级，可由管理员在班级详情页单条新增/删除/重置密码，也可批量导入；
- 「设置毕业」=将年级 `isActive=false`；毕业年级仍保留历史数据，仅不再出现在「在用年级」筛选内；
- 班级「删除」=级联前必须确认：班级内若有学生，必须先批量转出或删除。

**课程分类**（5 类，管理员用于分组筛选）：

- DATA · 数据（数据结构、文件、数据库）
- ALGORITHM · 算法（排序、搜索、递归）
- AI · 人工智能（机器学习、AI 概念）
- NETWORK · 计算机网络（协议、网络编程）
- INTERDISCIPLINARY · 多学科交叉

**标签管理**：管理员维护一个全局标签集（Tag 字符串字典），题目 `tags` 字段只能从该集合中选择。增/删/改标签时同步更新所有引用该标签的题目（删除标签=从所有题目中移除该字符串）。

---

## 5. 关键交互细节

### 5.1 代码练习页（`/problems/[id]`）

```
┌────────────────┬──────────────────────────┬──────────────┐
│ 题目描述        │  Monaco 编辑器            │  测试结果     │
│ (Markdown)     │  Python 语法高亮/自动补全  │              │
│                │                          │ ▸ 用例1 ✅ 12ms│
│ 输入格式        │                          │ ▸ 用例2 ✅ 8ms │
│ 输出格式        │                          │ ▸ 用例3 ❌     │
│ 样例输入/输出   │                          │   期望: 10    │
│ 提示            │                          │   实际: 9     │
│                │                          │              │
│                │ [运行样例] [提交评测]      │              │
└────────────────┴──────────────────────────┴──────────────┘
```

- 「运行样例」只跑 isSample 用例，不计入提交记录
- 「提交评测」跑全部用例，写入 Submission
- 提交后按钮置灰 + 显示「评测中…」骨架屏，轮询到结果后展开
- 代码自动存 localStorage，刷新不丢

### 5.2 考试答题页（`/exams/[id]/take`）

- 顶栏固定：剩余时间（<5 分钟变红闪烁）、已答/总题数、交卷按钮
- 左侧题号宫格：未答灰色、已答绿色、标记待定黄色，点击跳转
- 交卷前弹确认框，列出未作答题号
- 断网时顶部横幅提示「网络异常，作答已暂存本地」，恢复后自动同步

### 5.3 批改页（`/t/*/grade`）

- 左列学生名单，显示批改进度 `12/45`
- 编程题展示：学生代码（只读高亮）+ 自动评测结果 + 分数输入框（预填自动分）
- 快捷键：`↓` 下一个学生，`Ctrl+Enter` 保存并下一个
- 支持「常用评语」快速插入

---

## 6. 分期实施路线

> **强制要求**：每个阶段完成后必须 `npm run build` 通过 + 手动验证 + git commit，才能进入下一阶段。

| 阶段               | 内容                                                                                   | 验收标准                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **P0 地基**        | create-next-app、Prisma schema 全量建模、docker-compose、shadcn 初始化、基础布局与导航 | `npx prisma migrate dev` 成功，首页可访问                                                             |
| **P1 认证**        | 注册/登录/角色守卫/教师审批/学生批量导入/改密                                          | 三种角色均可登录，越权访问被拦截                                                                      |
| **P2 评测内核** ⭐ | Docker 沙箱封装、BullMQ 队列、Worker、Submission API                                   | 提交 `print(sum(map(int,input().split())))` 能正确判 AC；死循环判 TLE；`while True: [0]*10**9` 判 MLE |
| **P3 题目与练习**  | 编程题 CRUD、测试用例管理、题目自测、学生练习页                                        | 教师建题→自测通过→学生做题→拿到正确结果                                                               |
| **P4 课程与资源**  | 课程 CRUD、邀请码、选课、资源上传下载                                                  | 文件上传下载正常，非选课学生无法下载                                                                  |
| **P5 作业**        | 作业发布、提交、自动+人工批改、成绩回显                                                | 完整走通一次作业闭环                                                                                  |
| **P6 试卷**        | 题库、四种题型编辑器、组卷、抽题、答题页、自动交卷                                     | 限时到点自动交卷，客观题自动判分正确                                                                  |
| **P7 批改与分析**  | 批改工作台、成绩单、考试分析图表                                                       | 教师能高效批完一个班                                                                                  |
| **P8 打磨**        | 空状态、加载态、错误边界、移动端适配、日志                                             | 无控制台报错，断网/超时有友好提示                                                                     |

**P2 是整个项目风险最高的部分，务必先单独做通再往下走。**

---

## 7. 非功能要求

- **安全**：密码 bcrypt(cost=12)；所有用户输入经 zod 校验；Markdown 渲染必须 sanitize（DOMPurify）；文件名不信任，一律 UUID 重命名；SQL 全走 Prisma 参数化
- **性能**：列表页一律分页（默认 20/页）；成绩汇总用数据库聚合而非应用层遍历；`Submission` 表按 `(userId, problemId)` 与 `(contextType, contextId)` 建索引
- **可靠**：评测 Worker 独立进程，崩溃不影响 Web；考试作答每 15 秒落库
- **可观测**：评测任务记录耗时与失败原因，`/admin/judge` 可见

---

## 8. 明确不做（防止范围蔓延）

- 不做视频直播/录播
- 不做实时聊天/讨论区（P8 之后再议）
- 不做移动端 App（响应式网页即可）
- 不做防切屏/摄像头监考
- 不做多语言评测（只支持 Python 3.11）
- 不做多学校 SaaS 租户隔离
