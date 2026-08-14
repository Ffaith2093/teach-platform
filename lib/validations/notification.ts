import { z } from "zod";

export const announceSchema = z.object({
  classId: z.string().min(1, "请选择班级"),
  title: z.string().min(1, "请输入标题").max(100, "标题最多 100 字"),
  body: z.string().min(1, "请输入内容").max(2000, "内容最多 2000 字"),
});

export type AnnounceInput = z.input<typeof announceSchema>;