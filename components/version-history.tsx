import { CalendarDays, CheckCircle2, History } from "lucide-react";
import { CURRENT_VERSION, RELEASES } from "@/lib/releases";

export function VersionHistory() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-subtle p-2 text-primary">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">版本更新</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              当前版本 <span className="font-medium text-primary">{CURRENT_VERSION}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {RELEASES.map((release) => (
          <article key={release.version} className="border-b border-border pb-6 last:border-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{release.version}</h2>
              <span className="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-medium text-primary">
                当前版本
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" />
                {release.date}
              </span>
            </div>
            <h3 className="mt-3 text-base font-medium">{release.title}</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {release.changes.map((change) => (
                <li key={change} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
