import Link from "next/link";
import { Eye } from "lucide-react";

export function PreviewLink({ id }: { id: string }) {
  return (
    <Link
      href={`/t/banks/preview/${id}`}
      title="学生视角预览"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Eye className="h-3.5 w-3.5" />
    </Link>
  );
}