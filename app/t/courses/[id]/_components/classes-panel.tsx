"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, X, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { addClassToCourseAction, removeClassFromCourseAction } from "@/app/t/courses/actions";

interface AssignedClass {
  id: string;
  name: string;
  gradeName: string;
  gradeJoinYear: number;
  studentCount: number;
  addedAt: Date;
}

interface AvailableClass {
  id: string;
  name: string;
  gradeName: string;
  studentCount: number;
}

interface Props {
  courseId: string;
  isOwner: boolean;
  assigned: AssignedClass[];
  available: AvailableClass[];
}

export function ClassesPanel({ courseId, isOwner, assigned, available }: Props) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleAdd(classId: string) {
    startTransition(async () => {
      await addClassToCourseAction(courseId, classId);
    });
  }

  function handleRemove(classId: string) {
    if (!isOwner) return;
    startTransition(async () => {
      await removeClassFromCourseAction(courseId, classId);
    });
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">授课班级</h2>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus />
                添加班级
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加授课班级</DialogTitle>
                <DialogDescription>
                  只能添加您任教且尚未加入此课程的班级。
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                {available.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    没有可添加的班级（您任教的班级都已加入此课程）
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {available.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">{c.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Badge variant="primary">{c.gradeName}</Badge>
                            <span className="num">{c.studentCount} 名学生</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() => handleAdd(c.id)}
                        >
                          添加
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
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center text-sm text-muted-foreground">
              <Users className="mx-auto h-6 w-6 text-subtle-foreground" />
              <p className="mt-2">尚未添加任何授课班级</p>
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
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="primary">{c.gradeName}</Badge>
                      <span className="num">{c.studentCount}</span> 名学生
                    </div>
                  </div>
                  {isOwner ? (
                    <button
                      type="button"
                      aria-label="移除班级"
                      onClick={() => handleRemove(c.id)}
                      disabled={pending}
                      className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-subtle-foreground" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}