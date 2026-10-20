import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function linkOpeningTag(file: string, href: string): string {
  const source = readFileSync(file, "utf8");
  const hrefIndex = source.indexOf(href);
  assert.notEqual(hrefIndex, -1, `${file} must contain ${href}`);

  const tagStart = source.lastIndexOf("<Link", hrefIndex);
  const tagEnd = source.indexOf(">", hrefIndex);
  assert.notEqual(tagStart, -1, `${href} must be rendered by Link`);
  assert.notEqual(tagEnd, -1, `${href} must have a closing angle bracket`);
  return source.slice(tagStart, tagEnd + 1);
}

test("dense teacher lists do not prefetch every detail route", () => {
  const links = [
    {
      file: "app/t/assignments/[id]/page.tsx",
      href: "href={`/t/assignments/${assignmentId}/submissions/${sub.id}`}",
    },
    {
      file: "app/t/assignments/page.tsx",
      href: "href={`/t/assignments/${a.id}`}",
    },
    {
      file: "app/t/exams/page.tsx",
      href: "href={`/t/exams/${e.id}`}",
    },
    {
      file: "app/t/banks/programming/page.tsx",
      href: "href={`/t/problems/${p.id}`}",
    },
    {
      file: "app/t/courses/[id]/students/page.tsx",
      href: "href={`/t/students/${s.id}`}",
    },
    {
      file: "app/t/banks/[id]/_components/bank-problem-list.tsx",
      href: "href={`/t/problems/${q.problemId}`}",
    },
    {
      file: "components/question-preview/preview-link.tsx",
      href: "href={`/t/banks/preview/${id}`}",
    },
    {
      file: "components/question-preview/edit-link.tsx",
      href: "href={href}",
    },
  ];

  for (const link of links) {
    assert.match(
      linkOpeningTag(link.file, link.href),
      /prefetch=\{false\}/,
      `${link.file} must disable automatic prefetch for dense detail links`,
    );
  }
});
