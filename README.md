# seu-cli

面向东南大学校园服务的 Agent-Friendly CLI。它不登录、不保存密码，只复用你**已经登录的 eHall 会话**，把课表、成绩、考试等数据整理成稳定 JSON。

## 两种后端

```text
A. fetch（默认，推荐）
seu-cli -> Node 原生 fetch -> ehall.seu.edu.cn（你导入的 Cookie）

B. bridge（可选）
seu-cli -> 127.0.0.1:10086 -> 你的浏览器 -> ehall.seu.edu.cn（已登录会话）
```

- 有 `~/.seu-cli/session.json` 时默认走 `fetch`，否则回退 `bridge`。
- 可以用 `--backend fetch|bridge` 或环境变量 `SEU_BACKEND` 强制指定。
- `fetch` 只需要 Node，不需要浏览器扩展，速度快（通常 200–800ms）。
- `bridge` 不需要手动导入 Cookie，但需要 Kimi Browser Extension 和本机守护进程。

## 安装

```bash
# 仓库内
npm install --global .

# 或分发 tarball
npm pack
npm install --global ./seu-cli-0.3.0.tgz
```

项目没有第三方运行时依赖；fetch 后端只需要 Node。

## 快速开始（fetch 后端，推荐）

要求：Node.js >= 20，浏览器已登录 `ehall.seu.edu.cn`。

### 1. 复制应用 Cookie

1. 浏览器打开办事大厅并进入任意应用（例如我的课表）。
2. F12 → Network → 过滤 `ehall.seu.edu.cn`。
3. 点一个 `POST` 的 `.do` 请求（如 `dqxnxq.do`）→ Headers → Request Headers → 复制整行 `Cookie`。
4. 存成 `app-cookie.txt`。

这个 Cookie 覆盖课表、成绩、考试、导出等日常命令。

### 2. 可选：复制门户 Cookie

只有 `apps list` 需要它：

1. 打开 `https://ehall.seu.edu.cn/new/index.html`。
2. Network → 找 `userDesktopInfo.json` 或 `getUserCategoryAppList.json`。
3. 同样复制整行 `Cookie`，存成 `portal-cookie.txt`。

应用会话和门户会话是两套 Cookie，互不通用；只导入应用 Cookie 也能正常查课表和成绩。

### 3. 导入

```bash
seu-cli auth import --cookie-file app-cookie.txt \
  --portal-cookie-file portal-cookie.txt
```

只导入应用 Cookie 时省略第二个参数即可。Cookie 保存到 `~/.seu-cli/session.json`，权限 `0600`。

### 4. 验证

```bash
seu-cli auth status
seu-cli course today
```

`auth status` 返回 `logged_in: true` 和姓名/学号即成功。Cookie 失效后重新导入一次。

## 快速开始（bridge 后端）

要求：Node.js >= 20、Chrome/Edge、Kimi Browser Extension、本机守护进程。

```bash
~/.kimi-webbridge/bin/kimi-webbridge start
# Windows: %USERPROFILE%\.kimi-webbridge\bin\kimi-webbridge.exe start
```

在浏览器里登录 `auth.seu.edu.cn`，然后：

```bash
seu-cli --backend bridge login-status
seu-cli --backend bridge course today
```

不导入任何 Cookie；CLI 每次通过浏览器读取数据。

## 静默续期

```bash
seu-cli auth refresh
```

直接读取本机 Chrome 的 Cookie 数据库，用 macOS Keychain 派生密钥解密，不需要浏览器插件或 Playwright。如果应用会话失效，它会用 Chrome 打开一次门户/课表页，让浏览器自己完成 SSO，然后重新同步；fetch 命令遇到 `NOT_LOGGED_IN` 也会自动尝试一次。可用 `--no-refresh` 关闭自动续期。

目前自动同步支持 macOS + Chrome/Edge；其他平台请用 `auth import` 手动导入。

## 命令

```bash
seu-cli auth import --cookie-file app-cookie.txt [--portal-cookie-file portal-cookie.txt]
seu-cli auth refresh
seu-cli auth status
seu-cli auth logout

seu-cli term current
seu-cli course today [--date YYYY-MM-DD]
seu-cli course week [--week N] [--weekday 1-7]
seu-cli course export-ics [--week N] [--from-week M --to-week N] [--out schedule.ics]

seu-cli grade list [--term 2025-2026-2] [--out grades.csv]
seu-cli grade summary [--term 2025-2026-2]

seu-cli exam list [--term 2025-2026-2]
seu-cli exam upcoming [--term 2025-2026-2] [--days N] [--limit N]

seu-cli apps list [--search 关键词] [--limit N]

seu-cli program show
seu-cli warning
seu-cli classroom empty --campus 九龙湖 [--building 教一] [--date YYYY-MM-DD] [--sections 6-7]
seu-cli timetable classes [--term 2026-2027-2] [--search 关键词] [--limit N]

seu-cli library search <关键词> [--page N] [--limit N]
seu-cli library item <marcNo>
seu-cli library loans
seu-cli library history [--page N]
```

`program`、`warning`、`classroom`、`timetable` 和 `apps list` 目前需要 fetch 后端。

所有命令默认输出：

```json
{ "ok": true, "data": {}, "meta": { "command": "course today", "backend": "fetch" } }
```

失败时：

```json
{ "ok": false, "error": { "code": "NOT_LOGGED_IN", "message": "…", "hint": "…" } }
```

## 输出示例

```bash
seu-cli course today --date 2026-10-21
```

```json
{
  "ok": true,
  "data": {
    "term": { "code": "2026-2027-2", "label": "2026-2027学年秋季学期" },
    "date": "2026-10-19",
    "week": 5,
    "currentWeek": 5,
    "weekday": 1,
    "weekdayName": "周一",
    "count": 1,
    "courses": [
      {
        "courseName": "数据结构与算法",
        "teacher": "张老师",
        "location": "教一-101",
        "weekday": 1,
        "startSection": 3,
        "endSection": 4,
        "sections": "3-4",
        "weeks": "1-16周"
      }
    ]
  }
}
```

## 导出与汇总

- `course export-ics` 按教学周生成日历；不传 `--out` 时把 ICS 内容放在 `data.ics` 里。
- `grade list --out grades.csv` 写出带 BOM 的 CSV，Excel 直接打开；stdout 仍是 JSON，包含文件路径和汇总。
- `grade summary` 按学期返回课程数、学分、加权均分和通过/未通过数。
- `apps list` 列出有权限的办事大厅应用；fetch 后端需要门户 Cookie。

## 错误码与退出码

| 退出码 | 错误码 | 含义 |
|---|---|---|
| 0 | — | 成功 |
| 2 | `INVALID_ARGUMENT`, `UNKNOWN_COMMAND`, `UNSUPPORTED_BACKEND` | 参数、命令或后端不匹配 |
| 3 | `NOT_LOGGED_IN`, `PORTAL_COOKIE_REQUIRED`, `SYNC_UNSUPPORTED`, `SYNC_UNAVAILABLE` | Cookie 缺失/过期，或无法从浏览器同步 |
| 4 | `PERMISSION_DENIED`, `RATE_LIMITED`, `PAGE_CHANGED`, `UPSTREAM_ERROR`, `APP_LAUNCH_FAILED` | 无权限、限流、接口变化或应用打不开 |
| 5 | `NETWORK_ERROR`, `DAEMON_UNAVAILABLE`, `EXTENSION_NOT_CONNECTED` | 网络或桥接不可用 |

## 数据来源与扩展

| 命令 | eHall 应用 | API |
|---|---|---|
| `course` | 我的课表 `wdkb` | `dqxnxq.do` / `dqzc.do` / `xskcb.do` |
| `grade` | 成绩查询 `cjcx` | `xscjcx.do` |
| `exam` | 我的考试安排 `studentWdksapApp` | `dqxnxq.do` / `wdksap.do` |
| `apps` | 办事大厅应用目录 | `getUserCategoryAppList.json` |
| `library` | 图书馆 OPAC | `ajax_search_adv.php` / `item.php` / `book_lst.php` |

新增应用时，在 `src/backends/fetch.js` 和 `src/backends/bridge.js` 各加一个方法，再在 `src/commands/` 写一个只做格式化的命令。接口与抓包记录见 [docs/exploration.md](docs/exploration.md)。

## 安全边界

- 不索取、不保存账号密码、验证码。
- 不绕过统一身份认证、验证码或访问控制。
- Cookie 等同于登录凭证：只保存在本机 `0600` 文件里，不打印、不提交 Git、不发给他人。
- 只读优先；当前没有选课、预约、缴费等写操作。
- 成绩、学号、学院等属于隐私数据，只回显用户需要的内容。

## 已知限制

- Cookie 会过期，失效后需要重新导入；`auth status` 会返回 `NOT_LOGGED_IN`。
- 应用 Cookie 和门户 Cookie 是两套会话；只导入应用 Cookie 时 `apps list` 会返回 `PORTAL_COOKIE_REQUIRED`。
- 学校页面或接口改版会导致 `PAGE_CHANGED`，需要更新适配器。
- 电子成绩单未接入：`zzfw.seu.edu.cn` 的自助打印系统使用独立的账号密码 + 验证码登录，不接学校 SSO，自动化会触碰密码，违反本项目的安全边界。
