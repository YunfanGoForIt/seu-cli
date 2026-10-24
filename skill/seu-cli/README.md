# seu-cli Skill

这个目录是随 `seu-cli` 发布的 Agent Skill，告诉 Agent 何时、如何安全地调用 CLI。

## 安装 CLI

```bash
# 仓库内
npm install --global .
# 或分发包
npm install --global ./seu-cli-0.3.0.tgz
```

要求 Node.js >= 20。

## 首次使用

```bash
seu-cli auth refresh      # macOS + Chrome：读取浏览器会话
seu-cli auth status
seu-cli course today
```

如果自动同步不可用：

```bash
seu-cli auth import --cookie-file app.txt \
  --portal-cookie-file portal.txt
```

## 安装 Skill

把整个 `skill/seu-cli/` 目录复制到 Agent 的 skills 目录，或：

```bash
npx skills add https://github.com/YunfanGoForIt/seu-cli --skill seu-cli --global
```

## 目录

```text
SKILL.md                 路由、边界、按需读取索引
references/commands.md   命令参数与输出字段
references/errors.md     错误码与重试策略
references/examples.md   自然语言 → 命令
references/backends.md   登录态、Cookie 同步、后端
references/privacy-safety.md  隐私与安全
```

## 排障

```bash
seu-cli help              # 命令总览
seu-cli help course       # 分组帮助
seu-cli help grade list   # 单命令参数
seu-cli --help --format text
```
