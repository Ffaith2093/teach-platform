import { redirect } from "next/navigation";

export default async function LegacyAssignmentGradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/t/assignments/${id}?tab=submissions`);
}
