# 错误码与重试策略

| 退出码 | 错误码 | 含义 | 处理 |
|---|---|---|---|
| 0 | — | 成功 | — |
| 2 | `INVALID_ARGUMENT` | 参数不合法 | 修正参数，不要原样重试 |
| 2 | `UNKNOWN_COMMAND` | 命令不存在 | 运行 `seu-cli help` |
| 2 | `UNSUPPORTED_BACKEND` | 该命令只支持 fetch | 去掉 `--backend bridge`，先 `auth refresh` |
| 3 | `NOT_LOGGED_IN` | 会话缺失或过期 | fetch：`auth refresh`；bridge：浏览器重新登录。最多重试一次 |
| 3 | `PORTAL_COOKIE_REQUIRED` | 缺少门户 Cookie | `auth import --portal-cookie-file <文件>` |
| 3 | `SYNC_UNSUPPORTED` | 平台不支持自动同步 | 手动 `auth import` |
| 3 | `SYNC_UNAVAILABLE` | 读不到浏览器 Cookie | 确认 Chrome 已登录；或手动导入 |
| 4 | `PERMISSION_DENIED` | 账号无权访问 | 确认浏览器能打开同一页面，不要重试 |
| 4 | `RATE_LIMITED` | 被限流 | 立即停止，等待几分钟 |
| 4 | `PAGE_CHANGED` | 页面/接口结构变化 | 停止重试，更新适配器 |
| 4 | `UPSTREAM_ERROR` | 学校系统 5xx | 稍后重试一次 |
| 4 | `APP_LAUNCH_FAILED` | 应用打不开 | 确认浏览器能手动打开 |
| 5 | `NETWORK_ERROR` | 网络不可达 | 检查校园网/VPN，重试一次 |
| 5 | `DAEMON_UNAVAILABLE` | 桥接守护进程未启动 | `~/.kimi-webbridge/bin/kimi-webbridge start` |
| 5 | `EXTENSION_NOT_CONNECTED` | 浏览器扩展未连接 | 启用扩展远程控制 |
| 1 | `UNKNOWN_ERROR` | 未分类 | 报告完整 JSON，不要反复重试 |

## 重试原则

- 登录和网络错误各最多重试一次。
- `RATE_LIMITED` 立即停止。
- `PAGE_CHANGED`、`PERMISSION_DENIED` 不重试。
- 不要把错误信息里的 Cookie、token、学号原样展示给用户。
