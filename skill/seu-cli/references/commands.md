# 命令参考

所有命令输出 `{ok, data, meta}` 或 `{ok:false, error}`。

## 认证

| 命令 | 说明 | 关键返回 |
|---|---|---|
| `seu-cli auth import --cookie-file app.txt [--portal-cookie-file portal.txt]` | 导入浏览器 Cookie | `imported, user, cookieKinds, sessionPath` |
| `seu-cli auth refresh [--browser chrome] [--profile Default]` | 从 Chrome 静默同步；失败时会打开浏览器完成 SSO | `refreshed, user, source, sessionPath` |
| `seu-cli auth status` | 检查登录态 | `logged_in, user, backend` |
| `seu-cli auth logout` | 删除本地会话 | `loggedOut, hadSession` |
| `seu-cli login-status` | 兼容入口，等同 `auth status` | `logged_in, user` |

## 学期与课表

| 命令 | 选项 | 关键返回 |
|---|---|---|
| `term current` | — | `term, currentWeek, weekday, date` |
| `course today` | `--date YYYY-MM-DD` | `term, date, week, weekday, count, courses[]` |
| `course week` | `--week N`, `--weekday 1-7` | `term, week, currentWeek, count, courses[]` |
| `course export-ics` | `--week N` 或 `--from-week M --to-week N`, `--out FILE` | `eventCount, file` 或 `ics` |

`courses[]` 字段：`courseName, courseCode, teacher, location, weekday, startSection, endSection, sections, weeks, classId`。

## 成绩与考试

| 命令 | 选项 | 关键返回 |
|---|---|---|
| `grade list` | `--term`, `--out FILE` | `count, summary, grades[]`；带 `--out` 返回 `file` |
| `grade summary` | `--term` | `count, overall, terms[]` |
| `exam list` | `--term` | `term, currentTerm, count, exams[]` |
| `exam upcoming` | `--term`, `--days N`, `--limit N` | `today, count, next, exams[]` |

`summary` 字段：`courses, totalCredits, gradedCredits, weightedAverage, passed, failed`。
`exams[]` 字段：`courseName, time, date, location, seat, teacher, credit`。

## 教务查询（fetch 后端）

| 命令 | 选项 | 关键返回 |
|---|---|---|
| `classroom empty` | `--campus`（必填）, `--building`, `--date`, `--sections 6-7`, `--start`, `--end`, `--self-study` | `campus, building, date, time, count, classrooms[]` |
| `program show` | — | `plan, credits.required/completed/remaining/percent` |
| `warning` | — | `count, warnings[]` |
| `timetable classes` | `--term`, `--page`, `--limit`, `--search` | `term, total, count, classes[]` |

`classrooms[]` 字段：`classroom, building, campus, floor, capacity, type, selfStudy, bookable`。
`warnings[]` 字段：`batch, conclusion, level, code, date`。
`classes[]` 字段：`classCode, className, grade, major, department, students, capacity`。

## 应用目录

| 命令 | 选项 | 关键返回 |
|---|---|---|
| `apps list` | `--search`, `--limit` | `total, count, apps[]` |

`apps[]` 字段：`name, appId, serviceWid, description, categories`。fetch 后端需要门户 Cookie。
