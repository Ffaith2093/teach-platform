"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, X, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { assignClassAction, unassignClassAction } from "@/app/admin/teachers/actions";

interface AssignedClass {
  id: string;
  name: string;
  gradeName: string;
  gradeJoinYear: number;
  studentCount: number;
}

interface AvailableClass {
  id: string;
  name: string;
  gradeName: string;
  currentTeacherName: string | null;
  currentTeacherId: string | null;
}

interface Props {
  teacherId: string;
  assigned: AssignedClass[];
  available: AvailableClass[];
}

export function AssignClassesPanel({ teacherId, assigned, available }: Props) {
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleAssign(classId: string) {
    startTransition(async () => {
      await assignClassAction(teacherId, classId);
    });
  }

  function handleUnassign(classId: string) {
    startTransition(async () => {
      await unassignClassAction(teacherId, classId);
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">任课班级</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              勾选班级即可占用。每个班级只能由一位教师独占，已被他教师任教的班级在勾选时自动顶替原教师。
            </p>
          </div>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                分配班级
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>分配班级</DialogTitle>
                <DialogDescription>
                  从下方「未分配」或「由他教师任教」的班级中选择。点击即直接占用。
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-96 overflow-y-auto rounded-lg border border-border">
                {available.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    没有可分配的班级
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {available.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">
                            {c.gradeName} · {c.name}
                          </div>
                          {c.currentTeacherName ? (
                            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              当前由 <b className="mx-0.5">{c.currentTeacherName}</b> 任教，分配后将被顶替
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">未分配</div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => handleAssign(c.id)}
                        >
                          分配给此教师
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-4">
          {assigned.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
              <Users className="mx-auto h-6 w-6 text-subtle-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">此教师暂未任教任何班级</p>
              <p className="mt-1 text-xs text-subtle-foreground">
                点击右上角「分配班级」开始分配
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {assigned.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="primary">{c.gradeName}</Badge>
                      <span className="num">{c.gradeJoinYear} 级</span>
                      <span>·</span>
                      <span className="num">{c.studentCount} 名学生</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="解除分配"
                    onClick={() => handleUnassign(c.id)}
                    disabled={pending}
                    className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}