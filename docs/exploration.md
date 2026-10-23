# 东南大学站点勘察记录

勘察时间：2026-10-23。环境：Chrome + Kimi Browser Extension，使用用户本人已登录的会话。

## 入口与登录

| 用途 | URL |
|---|---|
| 统一身份认证 | `https://auth.seu.edu.cn/dist/#/dist/main/login` |
| 信息门户 / 应用中心 | `https://i.seu.edu.cn/default/index.html#/` |
| 网上办事大厅 | `https://ehall.seu.edu.cn/new/index.html` |

- `my.seu.edu.cn` 会 302 到 `auth.seu.edu.cn`。
- eHall 的会话较短；`i.seu.edu.cn` 的 SSO 会话更稳定。CLI 以 i.seu 的 ServiceShow 作为应用启动入口，每次都会换发新的 `gid_`。
- `seu-cli login-status` 使用 `GET https://i.seu.edu.cn/getLoginUser?_=<ts>`，返回 `{errcode:"0", data:{userName,userAccount,categoryName,deptName}}`。

## 应用启动方式

办事大厅应用不能直接用 `/jwapp/sys/<app>/*default/index.do` 打开，会返回 403。必须先经过门户的 ServiceShow：

```text
https://i.seu.edu.cn/default/index.html#/ServiceShow?isMobile=0&wid=<serviceWid>
        -> 302/前端跳转
https://ehall.seu.edu.cn/jwapp/sys/<app>/*default/index.do?gid_=...&amp_sec_version_=1&EMAP_LANG=zh&THEME=
```

`gid_` 在同一登录会话内可复用于多个应用，但会过期；CLI 每次启动都重新获取。

## 已接入应用

### 我的课表（wdkb）

- serviceWid：`831556292223983616`
- appId：`4770397878132218`
- 路径：`/jwapp/sys/wdkb/`

| 接口 | 请求 | 说明 |
|---|---|---|
| `/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do` | POST，空 body | 当前学期，`datas.dqxnxq.rows[0].{DM,MC,XNDM,XQDM}` |
| `/jwapp/sys/wdkb/modules/jshkcb/dqzc.do` | `XN=2026-2027&XQ=2&RQ=2026-10-23` | 当前周，`datas.dqzc.rows[0].{ZC,XQJ}` |
| `/jwapp/sys/wdkb/modules/xskcb/xskcb.do` | `*order=%2BKSJC&XNXQDM=2026-2027-2&SKZC=5` | 周课表，`datas.xskcb.rows[]` |

课表行关键字段：`KCM` 课程名、`KCH` 课程号、`SKJS` 教师、`JASMC` 地点、`SKXQ` 星期、`KSJC`/`JSJC` 起止节次、`ZCMC` 周次文本、`JXBID` 教学班。

### 成绩查询（cjcx）

- serviceWid：`831556292710522880`
- appId：`4768574631264620`
- 路径：`/jwapp/sys/cjcx/`

| 接口 | 请求 | 说明 |
|---|---|---|
| `/jwapp/sys/cjcx/modules/cjcx/xscjcx.do` | `querySetting=<JSON>&*order=-XNXQDM%2C-KCH%2C-KXH&pageSize=500&pageNumber=1` | 成绩列表 |

`querySetting` 示例：

```json
[
  { "name": "XNXQDM", "value": "2025-2026-2", "linkOpt": "and", "builder": "m_value_equal" },
  { "name": "SFYX", "caption": "是否有效", "linkOpt": "AND", "builderList": "cbl_m_List", "builder": "m_value_equal", "value": "1", "value_display": "是" }
]
```

省略 `XNXQDM` 即返回全部学期。成绩行关键字段：`KCM`、`KCH`、`XF` 学分、`ZCJ` 总成绩、`DJCJMC` 等级成绩名称、`KCXZDM_DISPLAY` 必修/限选、`KCLBDM_DISPLAY` 课程类别、`XNXQDM(_DISPLAY)`、`CXCKDM_DISPLAY` 首修/重修、`SFJG_DISPLAY` 是否合格。

### 我的考试安排（studentWdksapApp）

- serviceWid：`831556329574260736`
- appId：`4768687067472349`
- 路径：`/jwapp/sys/studentWdksapApp/`

| 接口 | 请求 | 说明 |
|---|---|---|
| `/jwapp/sys/studentWdksapApp/modules/wdksap/dqxnxq.do` | POST，空 body | 当前学期 |
| `/jwapp/sys/studentWdksapApp/modules/wdksap/wdksap.do` | `XNXQDM=2025-2026-2&*order=-KSRQ%2C-KSSJMS` | 考试安排 |

考试行关键字段：`KCM`、`KCH`、`KSSJMS` 时间文本、`KSRQ` 日期、`JASMC` 地点、`ZWH` 座位号、`ZJJSXM` 教师、`KSMC` 考试名称、`XF` 学分。

## 未能直接使用的入口

| 尝试 | 结果 |
|---|---|
| `https://ehall.seu.edu.cn/jwapp/sys/wdkb/*default/index.do` | 403 |
| 加 `t_s` / `EMAP_LANG` / `THEME` | 仍 403 |
| `https://jw.seu.edu.cn` | 纪检监察网站，不是教务系统 |
| `https://ecard.seu.edu.cn` | 连接被重置 |

## 复现用 evaluate 片段

课表：

```js
const post = (path, body) => fetch(path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
  body
}).then((r) => r.json());

const term = (await post('/jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do', '')).datas.dqxnxq.rows[0];
const week = (await post('/jwapp/sys/wdkb/modules/jshkcb/dqzc.do',
  `XN=${term.XNDM}&XQ=${term.XQDM}&RQ=2026-10-23`)).datas.dqzc.rows[0].ZC;
const rows = (await post('/jwapp/sys/wdkb/modules/xskcb/xskcb.do',
  `*order=%2BKSJC&XNXQDM=${term.DM}&SKZC=${week}`)).datas.xskcb.rows;
```

## 课表节次时间

来源：[东南大学材料科学与工程学院 上课时间安排表](https://smse.seu.edu.cn/_t637/2017/0831/c17841a194359/page.htm)（2014-2015 学年起执行）。

```text
1  08:00-08:45   2  08:50-09:35   3  09:50-10:35   4  10:40-11:25   5  11:30-12:15
6  14:00-14:45   7  14:50-15:35   8  15:50-16:35   9  16:40-17:25   10 17:30-18:15
11 18:30-19:15   12 19:20-20:05   13 20:10-20:55
```

`course export-ics` 用 `dqzc.do` 返回的当前周次反推第 1 周周一，再按 `weekday` 和节次时间生成 UTC 时间戳。

## 电子成绩单（未接入）

- 入口：`http://zzfw.seu.edu.cn/wec-self-print-app-console/mobile.html`
- 门户 `serviceShow` 只返回裸 URL，不带 ticket。
- 该应用自带账号密码 + 验证码登录（`userName` / `password` / `verifiCode`），并提供 LDAP、手机等登录方式；没有 SEU CAS/SSO 入口。
- 结论：不自动化，避免处理密码；如需使用，请用户在浏览器手动登录后自行操作。

## 纯 HTTP 后端（fetch）

不依赖 Playwright / WebBridge 时，用浏览器里已有的 eHall Cookie 直接请求接口。

### 两套会话

| Cookie 来源 | 含有的关键 Cookie | 能访问 |
|---|---|---|
| 任意 `/jwapp/.../*.do` 请求 | `GS_SESSIONID`、`JSESSIONID` | 课表、成绩、考试等应用 API |
| `ehall.seu.edu.cn/new/index.html` 的 `userDesktopInfo.json` | `asessionid` | 应用目录、用户信息 |

两套 Cookie 不通用：

- 门户 Cookie 调 `dqxnxq.do` → 401；
- 应用 Cookie 调 `getUserCategoryAppList.json` → `hasLogin:false`。

### 验证与用户信息

- `POST /jwapp/sys/wdkb/modules/jshkcb/dqxnxq.do` 返回学期即应用会话有效。
- `POST /jwapp/sys/wdkb/modules/xskcb/cxxsjbxx.do` 返回 `XM`（姓名）、`XH`（学号）、`BJMC`（班级）、`YXDM_DISPLAY`（院系）。

### 请求头

```text
Cookie: <导入的 Cookie>
X-Requested-With: XMLHttpRequest
Referer: https://ehall.seu.edu.cn/new/index.html
Origin: https://ehall.seu.edu.cn
Content-Type: application/x-www-form-urlencoded; charset=UTF-8   (POST)
```

`redirect: 'manual'`，出现 3xx/401 即判定会话失效。
