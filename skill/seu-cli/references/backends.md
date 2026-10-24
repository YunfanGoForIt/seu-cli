# 后端与登录态

## 两种后端

| 后端 | 依赖 | 适用 |
|---|---|---|
| `fetch`（默认） | Node + 本地 Cookie | 日常查询，速度快 |
| `bridge` | Kimi Browser Extension + 守护进程 | 不想导入 Cookie，或 fetch 失败的兜底 |

有 `~/.seu-cli/session.json` 时默认 fetch，否则 bridge。可用 `--backend fetch|bridge` 或 `SEU_BACKEND` 强制指定。

## 会话文件

```text
~/.seu-cli/session.json   权限 0600
```

包含：

- `cookie`：eHall 应用会话（课表、成绩、考试、培养方案、预警、全校课表）
- `portalCookie`：eHall 门户会话（`apps list`）
- `hostCookies`：`its.seu.edu.cn` 会话（空闲教室）
- `user`：姓名、学号、学院、班级（仅用于 `auth status`）

## 静默续期

```bash
seu-cli auth refresh
```

1. 读取 Chrome `Cookies` SQLite；
2. 用 macOS Keychain 的 “Chrome Safe Storage” 派生密钥，解密 v10 Cookie；
3. 分别组装 eHall 应用、门户和 `its` 三套 Cookie；
4. 如果应用会话无效，用 Chrome 打开一次 `i.seu.edu.cn` 和课表应用，让浏览器完成 SSO；
5. 重新读取并验证，成功后写回 `session.json`。

fetch 命令遇到 `NOT_LOGGED_IN` 会自动执行一次 `auth refresh` 并重试；`--no-refresh` 可关闭。

限制：自动同步目前只支持 macOS + Chrome/Edge。Windows 用：

```bash
seu-cli auth import --cookie-file app.txt --portal-cookie-file portal.txt \
  --its-cookie-file its.txt --lib-cookie-file lib.txt
```

| 功能 | macOS | Windows |
|---|---|---|
| 课表/成绩/考试/培养方案/预警/班级 | 自动同步 | 手动导入应用 Cookie |
| 图书馆检索/详情 | 支持 | 支持（公开） |
| 当前借阅/历史 | 自动同步 | 手动导入 libopac Cookie |
| 空闲教室 | 自动同步 | 手动导入 its Cookie |
| `auth refresh` | 支持 | `SYNC_UNSUPPORTED` |

## Cookie 怎么取

- 应用 Cookie：eHall 应用页 → DevTools → Network → 任一 `*.do` 请求 → Request Headers → `Cookie`。
- 门户 Cookie：`ehall.seu.edu.cn/new/index.html` → `userDesktopInfo.json` 请求 → `Cookie`。
- `its` Cookie：打开一次 `教室查借` 后由 `auth refresh` 自动读取。

## 常见问题

| 现象 | 处理 |
|---|---|
| `NOT_LOGGED_IN` | `auth refresh`；仍失败则浏览器重新登录 eHall |
| `SYNC_UNSUPPORTED` | 当前平台不支持自动同步，手动导入 |
| `PORTAL_COOKIE_REQUIRED` | 补导门户 Cookie |
| `UNSUPPORTED_BACKEND` | 该命令只支持 fetch，去掉 `--backend bridge` |
| `DAEMON_UNAVAILABLE` | 启动 `kimi-webbridge`，或改用 fetch |
