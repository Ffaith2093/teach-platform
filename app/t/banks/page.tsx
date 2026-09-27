import { redirect } from "next/navigation";

export const metadata = { title: "我的题库" };

export default function TeacherBanksPage() {
  redirect("/t/banks/programming");
}