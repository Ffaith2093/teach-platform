export const CURRENT_VERSION = "v1.0.0";

export const RELEASES = [
  {
    version: CURRENT_VERSION,
    date: "2026-10-09",
    title: "首个正式版本",
    changes: [
      "完善年级、班级、教师和学生的组织管理流程",
      "支持选择题、填空题、代码填空题和编程题的创建与使用",
      "支持按班级查看课程出勤与学习数据",
      "优化千人学生导入、在线评测和学生答题体验",
    ],
  },
] as const;
