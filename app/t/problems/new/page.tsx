import Link from "next/link";
import { Topbar } from "@/components/shell/topbar";
import { ChevronLeft, Code } from "lucide-react";
import { ProblemEditor } from "../_components/problem-editor";

export const metadata = { title: "新建编程题" };

export default function NewProblemPage() {
  return (
    <>
      <Topbar
        crumbs={[
          { label: "我的编程题", href: "/t/problems" },
          { label: "新建题目" },
        ]}
      />
      <main className="flex-1 p-8">
        <div className="mx-auto flex max-w-[1024px] flex-col gap-6">
          <div>
            <Link
              href="/t/problems"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              返回我的编程题
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">新建编程题</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              填写基本信息后创建。创建后可继续添加测试用例并验证参考答案。
            </p>
          </div>

          <ProblemEditor
            mode="new"
            initial={{
              title: "",
              description: "",
              difficulty: "MEDIUM",
              timeLimitMs: 3000,
              memoryLimitMb: 128,
              starterCode: "",
              referenceSolution: "",
              tags: [],
              isPublic: false,
            }}
            testCases={[]}
          />

          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
            <Code className="mr-1.5 inline h-3.5 w-3.5" />
            提示：题干支持 Markdown 语法（暂未启用实时预览，编辑时请参考 Markdown 语法）。
            测试用例至少要 1 组，发布前建议用参考答案跑全部用例。
          </div>
        </div>
      </main>
    </>
  );
}