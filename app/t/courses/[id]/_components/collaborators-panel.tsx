"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, X, ArrowRightLeft, Crown, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  addCollaboratorAction,
  removeCollaboratorAction,
  transferOwnershipAction,
} from "@/app/t/courses/actions";
import type { CourseTeacherRole, UserStatus } from "@prisma/client";

interface Member {
  id: string;
  name: string;
  teacherNo: string | null;
  subjects: string[];
  role: CourseTeacherRole;
  status: UserStatus;
}

interface AvailableCollaborator {
  id: string;
  name: string;
  teacherNo: string | null;
  subjects: string[];
}

interface Props {
  courseId: string;
  isOwner: boolean;
  currentUserId: string;
  members: Member[];
  available: AvailableCollaborator[];
}

const ROLE_LABELS: Record<CourseTeacherRole, { label: string; tone: "primary" | "accent" | "default" }> = {
  OWNER: { label: "主讲", tone: "primary" },
  ASSISTANT: { label: "助教", tone: "accent" },
  CONTRIBUTOR: { label: "外聘", tone: "default" },
};

export function CollaboratorsPanel({
  courseId,
  isOwner,
  currentUserId,
  members,
  available,
}: Props) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [targetId, setTargetId] = React.useState<string>(members.find((m) => m.role !== "OWNER")?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);

  function handleAdd(id: string) {
    startTransition(async () => {
      await addCollaboratorAction(courseId, id);
    });
  }

  function handleRemove(id: string) {
    if (!isOwner) return;
    startTransition(async () => {
      try {
        await removeCollaboratorAction(courseId, id);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  function handleTransfer() {
    setError(null);
    startTransition(async () => {
      try {
        await transferOwnershipAction(courseId, targetId);
        setTransferOpen(false);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  const currentOwner = members.find((m) => m.role === "OWNER");
  const transferCandidates = members.filter((m) => m.role !== "OWNER" && m.status === "ACTIVE");

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">教师团队</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              主讲（OWNER）拥有完整权限；助教可出题与批改。
            </p>
          </div>
          {isOwner && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus />
                  邀请
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>邀请协作者</DialogTitle>
                  <DialogDescription>
                    添加的教师将作为助教加入课程。
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
                  {available.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                      没有可邀请的教师
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
                              {c.teacherNo && (
                                <span className="num font-mono">{c.teacherNo}</span>
                              )}
                              {c.subjects.length > 0 && (
                                <>
                                  {c.teacherNo && <span>·</span>}
                                  <span>{c.subjects.slice(0, 2).join(" / ")}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => handleAdd(c.id)}
                          >
                            邀请
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <ul className="mt-4 space-y-2">
          {members.map((m) => {
            const role = ROLE_LABELS[m.role];
            const isCurrentUser = m.id === currentUserId;
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {m.role === "OWNER" && <Crown className="h-3.5 w-3.5 text-primary" />}
                    {m.name}
                    {isCurrentUser && <span className="text-[11px] text-subtle-foreground">(我)</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {m.teacherNo && <span className="num font-mono">{m.teacherNo}</span>}
                    {m.subjects.length > 0 && (
                      <>
                        {m.teacherNo && <span>·</span>}
                        <span>{m.subjects.slice(0, 2).join(" / ")}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <Badge variant={role.tone}>{role.label}</Badge>
                    {m.status !== "ACTIVE" && (
                      <Badge variant="default">已停用</Badge>
                    )}
                  </div>
                </div>
                {isOwner && m.role !== "OWNER" && (
                  <button
                    type="button"
                    aria-label="移除"
                    onClick={() => handleRemove(m.id)}
                    disabled={pending}
                    className="rounded-md p-1.5 text-subtle-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isOwner && transferCandidates.length > 0 && currentOwner && (
          <div className="mt-3 border-t border-border pt-3">
            <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-primary transition-colors hover:underline"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  转让主讲
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>转让主讲</DialogTitle>
                  <DialogDescription>
                    您将降级为助教，新主讲获得完整权限。可后续再转让回来。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="new-owner">新主讲教师</Label>
                  <select
                    id="new-owner"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm focus-visible:border-primary focus-visible:bg-card focus-visible:outline-none"
                  >
                    {transferCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}（{c.teacherNo ?? ""}）
                      </option>
                    ))}
                  </select>
                </div>
                {error && (
                  <div className="rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2 text-xs text-danger">
                    {error}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                    取消
                  </Button>
                  <Button type="button" disabled={pending || !targetId} onClick={handleTransfer}>
                    {pending ? "转让中…" : "确认转让"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {!isOwner && (
          <p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" />
            仅主讲可增删协作者和转让所有权
          </p>
        )}
      </CardContent>
    </Card>
  );
}