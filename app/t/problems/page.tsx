import { redirect } from "next/navigation";

export const metadata = { title: "我的编程题" };

export default function TeacherProblemsPage() {
  redirect("/t/banks/programming");
}