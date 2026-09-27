import Link from "next/link";
import { Pencil } from "lucide-react";

export function EditLink({ href, title }: { href: string; title?: string }) {
  return (
    <Link
      href={href}
      title={title ?? "编辑"}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Pencil className="h-3.5 w-3.5" />
    </Link>
  );
}