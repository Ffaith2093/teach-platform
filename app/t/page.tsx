import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "教师工作台" };

export default function TeacherIndexPage() {
  redirect("/t/dashboard");
}
