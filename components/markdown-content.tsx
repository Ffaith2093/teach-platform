import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { cn } from "@/lib/utils";

export function MarkdownContent({
  content,
  className,
  emptyText,
}: {
  content: string;
  className?: string;
  emptyText?: string;
}) {
  const source = content.trim();
  if (!source) {
    return emptyText ? <p className="text-sm text-subtle-foreground">{emptyText}</p> : null;
  }

  const html = DOMPurify.sanitize(String(marked.parse(source, { async: false, breaks: true })), {
    USE_PROFILES: { html: true },
  });

  return (
    <div
      className={cn("markdown-content text-base leading-7 text-foreground", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
