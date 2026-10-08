export function formatGradeLabel(name: string, joinYear: number): string {
  const compact = name.replace(/\s+/g, "");
  return compact.includes(String(joinYear)) ? name : `${name} · ${joinYear}级`;
}
