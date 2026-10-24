# 自然语言 → 命令

| 用户说 | 执行 |
|---|---|
| 今天有什么课 | `seu-cli course today` |
| 周三的课 | `seu-cli course week --weekday 3` |
| 第 8 周课表 | `seu-cli course week --week 8` |
| 把这学期课表导到日历 | `seu-cli course export-ics --from-week 1 --to-week 16 --out schedule.ics` |
| 现在第几周 | `seu-cli term current` |
| 查成绩 | `seu-cli grade list` |
| 查上学期成绩 | `seu-cli grade list --term 2025-2026-2` |
| 我均分多少 | `seu-cli grade summary` |
| 导出成绩单 | `seu-cli grade list --out grades.csv` |
| 下一场考试 | `seu-cli exam upcoming` |
| 期末考场和座位 | `seu-cli exam list --term 2025-2026-2` |
| 九龙湖 6-7 节哪有空教室 | `seu-cli classroom empty --campus 九龙湖 --sections 6-7` |
| 教一今天下午空教室 | `seu-cli classroom empty --campus 九龙湖 --building 教一 --sections 6-7` |
| 我还差多少学分 | `seu-cli program show` |
| 我有学业预警吗 | `seu-cli warning` |
| 建筑类有哪些班 | `seu-cli timetable classes --search 建筑` |
| 学校有哪些应用 | `seu-cli apps list --limit 20` |
| 登录过期了 | `seu-cli auth refresh`；仍失败再按提示手动导入 |

## 回答要求

- 只回显用户要的字段；不要主动展开全部成绩、学号或学院。
- 课表按星期和节次排序；`sections` 是合并后的节次。
- `weightedAverage` 只统计可转成数字的百分制成绩，回答时说明口径。
- 考试 `time` 已包含日期、时段和星期。
- 空教室结果较多时，按教学楼汇总或只列前 10 间。
