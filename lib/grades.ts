export function formatGradeLabel(name: string, joinYear: number): string {
  const compact = name.replace(/\s+/g, "");
  return compact.includes(String(joinYear)) ? name : `${name} · ${joinYear}级`;
}

const classNameCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

/** 按班级名称中的数字自然排序，例如 2 班排在 11 班之前。 */
export function compareClassNames(a: string, b: string): number {
  const aNumber = a.match(/\d+/)?.[0];
  const bNumber = b.match(/\d+/)?.[0];
  if (aNumber && bNumber && Number(aNumber) !== Number(bNumber)) {
    return Number(aNumber) - Number(bNumber);
  }
  return classNameCollator.compare(a, b);
}
