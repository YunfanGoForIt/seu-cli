---
name: seu-cli
description: 通过本地 seu-cli 查询东南大学（SEU）课表、成绩和考试安排，并导出日历/CSV、列出校园应用。复用用户浏览器中已登录的统一身份认证会话，不处理密码；只读，输出结构化 JSON。当用户询问"今天有什么课""本周课表""导课表到日历""查成绩/绩点""导出成绩""考试安排/考场座位""下一场考试"或"学校有哪些应用"等东南大学校园信息时使用。
version: 0.2.0
license: MIT
---

# 东南大学校园服务 Skill（seu-cli）

`seu-cli` 是唯一事实来源。本 Skill 只说明何时调用、如何解释结果，不实现抓取或业务逻辑。

## 前置检查

1. 确认 CLI 可用：`seu-cli --version`。
2. 确认登录态：`seu-cli auth status`。返回 `data.backend` 是 `fetch` 或 `bridge`。
3. 若返回 `NOT_LOGGED_IN`：
   - `fetch` 后端：先执行一次 `seu-cli auth refresh`（macOS 会从 Chrome 静默同步）。仍失败时，让用户重新复制 eHall Cookie 到本地文件，再执行 `seu-cli auth import --cookie-file <文件>`。**绝不要让用户把 Cookie 发到对话里**。
   - `bridge` 后端：让用户在浏览器打开 `https://auth.seu.edu.cn` 完成登录，然后重试。
4. 若返回 `DAEMON_UNAVAILABLE`，说明本机浏览器桥接没启动；可让用户执行 `~/.kimi-webbridge/bin/kimi-webbridge start`，或改用 `--backend fetch`（需要已导入 Cookie）。不要在未确认时自行安装或升级组件。
5. 若返回 `PORTAL_COOKIE_REQUIRED`，说明只导入了应用 Cookie；`apps list` 需要额外导入门户 Cookie：`seu-cli auth import --portal-cookie-file <文件>`。

## 命令路由

| 用户意图 | 命令 |
|---|---|
| 当前学期/教学周 | `seu-cli term current` |
| 今天 / 指定日期有什么课 | `seu-cli course today [--date YYYY-MM-DD]` |
| 第 N 周课表、某天课表 | `seu-cli course week [--week N] [--weekday 1-7]` |
| 导出日历 | `seu-cli course export-ics [--week N] [--out schedule.ics]` |
| 成绩、某学期成绩 | `seu-cli grade list [--term 2025-2026-2]` |
| 导出成绩 CSV | `seu-cli grade list --out grades.csv` |
| 按学期汇总 GPA/学分 | `seu-cli grade summary [--term]` |
| 考试安排、考场、座位号 | `seu-cli exam list [--term 2025-2026-2]` |
| 下一场考试、倒计时 | `seu-cli exam upcoming [--days N]` |
| 查有哪些校园应用 | `seu-cli apps list [--search 关键词]` |
| 空闲教室 | `seu-cli classroom empty --campus 九龙湖 [--building 教一] [--sections 6-7]` |
| 培养方案/学分进度 | `seu-cli program show` |
| 学业预警 | `seu-cli warning` |
| 全校班级列表 | `seu-cli timetable classes [--search 关键词]` |

学期代码格式为 `YYYY-YYYY-N`，例如 `2025-2026-2`。用户说"上学期""这学期"时，先根据日期换算成明确代码；无法确定就先查 `exam list` 返回的 `currentTerm` 或直接不加 `--term` 查询全部成绩。

## 输出处理

- 所有命令输出 `{ok, data, meta}` 或 `{ok:false, error}`，按 JSON 解析，不要依赖人类文案。
- 课表按 `weekday`、`startSection` 排序；`sections` 是合并后的节次。
- 成绩的 `score` 可能是百分制或等级制；`summary.weightedAverage` 只统计可转成数字的百分制成绩，回答时要说明口径。
- 考试 `time` 已包含日期、时段和星期；`seat` 是座位号。
- 只回显用户需要的字段，不要主动展开学号、学院、全部成绩。

## 边界

- 只读。不要尝试选课、预约、缴费、评教等写操作；当前 CLI 也不提供。
- Cookie 是登录凭证：不要索取、回显、记录或转发；只让用户在本地保存为文件后通过 `auth import --cookie-file` 导入。
- 电子成绩单（`zzfw.seu.edu.cn`）使用独立账号密码登录，CLI 未接入；不要索取或代填密码，让用户自行在浏览器操作。
- 不要绕过统一身份认证、验证码或访问控制。
- 不要高频轮询；一次请求失败最多重试一次。
- `PAGE_CHANGED` 表示学校页面或接口变化，告知用户需要更新 CLI，不要反复重试。

## 错误码

| 错误码 | 处理 |
|---|---|
| `NOT_LOGGED_IN` | fetch：重新导入 Cookie；bridge：浏览器重新登录。只重试一次 |
| `PORTAL_COOKIE_REQUIRED` | `apps list` 需要门户 Cookie；`auth import --portal-cookie-file <文件>` |
| `APP_LAUNCH_FAILED` | 确认浏览器能手动打开办事大厅对应应用；仍失败则报告 |
| `PAGE_CHANGED` | 学校接口变化，停止重试 |
| `RATE_LIMITED` | 立即停止，等待几分钟，不要循环 |
| `NETWORK_ERROR` | 检查校园网/VPN，重试一次 |
| `DAEMON_UNAVAILABLE` / `EXTENSION_NOT_CONNECTED` | 启动桥接或启用扩展；或改用 fetch 后端 |
| `INVALID_ARGUMENT` | 修正参数，不要原样重试 |
