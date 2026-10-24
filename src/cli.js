#!/usr/bin/env node
import { createRequire } from 'node:module';

import { parseOptions, kebab } from './args.js';
import { getBackend } from './backends/index.js';
import { CliError, exitCodeFor, invalidArgument, toErrorPayload } from './errors.js';
import { appsList } from './commands/apps.js';
import { authImport, authLogout, authRefresh, authStatus } from './commands/auth.js';
import { classroomEmpty } from './commands/classroom.js';
import { courseExportIcs, courseToday, courseWeek } from './commands/course.js';
import { examList, examUpcoming } from './commands/exam.js';
import { gradeList, gradeSummary } from './commands/grade.js';
import { loginStatus } from './commands/login.js';
import { programShow } from './commands/program.js';
import { termCurrent } from './commands/term.js';
import { timetableClasses } from './commands/timetable.js';
import { warningList } from './commands/warning.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const DEFAULT_DAEMON_URL = 'http://127.0.0.1:10086';

const COMMANDS = {
  'auth import': {
    summary: '导入浏览器里的 eHall Cookie，启用纯 HTTP 后端。',
    needsBackend: false,
    options: {
      cookieFile: { type: 'string' },
      cookie: { type: 'string' },
      portalCookieFile: { type: 'string' },
      portalCookie: { type: 'string' }
    },
    run: (context, options) => authImport(context, options)
  },
  'auth refresh': {
    summary: '从本机 Chrome 静默同步 eHall Cookie（无需插件）。',
    needsBackend: false,
    options: {
      browser: { type: 'string' },
      profile: { type: 'string' }
    },
    run: (_context, options) => authRefresh(options)
  },
  'auth status': {
    summary: '检查当前登录态（默认优先使用已导入的 Cookie）。',
    options: {},
    run: (context) => authStatus(context)
  },
  'auth logout': {
    summary: '删除本地保存的 eHall Cookie。',
    needsBackend: false,
    options: {},
    run: () => authLogout()
  },
  'login-status': {
    summary: '检查登录态并返回当前用户。',
    options: {},
    run: (context) => loginStatus(context)
  },
  'term current': {
    summary: '查询当前学期、教学周和星期。',
    options: {},
    run: (context) => termCurrent(context)
  },
  'course today': {
    summary: '查询今天（或指定日期）的课表。',
    options: { date: { type: 'date' } },
    run: (context, options) => courseToday(context, options)
  },
  'course week': {
    summary: '按教学周查询课表，可按星期过滤。',
    options: {
      week: { type: 'integer', min: 1, max: 30 },
      weekday: { type: 'integer', min: 1, max: 7 }
    },
    run: (context, options) => courseWeek(context, options)
  },
  'classroom empty': {
    summary: '查询某校区/教学楼在指定日期和节次的空闲教室。',
    options: {
      campus: { type: 'string' },
      building: { type: 'string' },
      date: { type: 'date' },
      sections: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
      selfStudy: { type: 'boolean' }
    },
    run: (context, options) => classroomEmpty(context, options)
  },
  'program show': {
    summary: '查看个人培养方案与学分完成进度。',
    options: {},
    run: (context) => programShow(context)
  },
  'warning': {
    summary: '查询学业预警结果。',
    options: {},
    run: (context) => warningList(context)
  },
  'timetable classes': {
    summary: '查询全校班级列表，可按关键词过滤。',
    options: {
      term: { type: 'term' },
      page: { type: 'integer', min: 1, max: 100 },
      limit: { type: 'integer', min: 1, max: 200 },
      search: { type: 'string' }
    },
    run: (context, options) => timetableClasses(context, options)
  },
  'course export-ics': {
    summary: '把课表导出为 .ics 日历文件。',
    options: {
      week: { type: 'integer', min: 1, max: 30 },
      fromWeek: { type: 'integer', min: 1, max: 30 },
      toWeek: { type: 'integer', min: 1, max: 30 },
      out: { type: 'string' }
    },
    run: (context, options) => courseExportIcs(context, options)
  },
  'grade list': {
    summary: '查询成绩，默认返回全部学期；可用 --term 过滤。',
    options: {
      term: { type: 'term' },
      out: { type: 'string' }
    },
    run: (context, options) => gradeList(context, options)
  },
  'grade summary': {
    summary: '按学期汇总学分与加权均分。',
    options: { term: { type: 'term' } },
    run: (context, options) => gradeSummary(context, options)
  },
  'exam list': {
    summary: '查询考试安排，默认当前学期；可用 --term 指定学期。',
    options: { term: { type: 'term' } },
    run: (context, options) => examList(context, options)
  },
  'exam upcoming': {
    summary: '列出未来考试和倒计时。',
    options: {
      term: { type: 'term' },
      days: { type: 'integer', min: 0, max: 365 },
      limit: { type: 'integer', min: 1, max: 100 }
    },
    run: (context, options) => examUpcoming(context, options)
  },
  'apps list': {
    summary: '列出有权限的办事大厅应用。',
    options: {
      search: { type: 'string' },
      limit: { type: 'integer', min: 1, max: 500 }
    },
    run: (context, options) => appsList(context, options)
  }
};

const GROUPS = [
  ['认证与登录', ['auth import', 'auth refresh', 'auth status', 'auth logout', 'login-status']],
  ['学期与课表', ['term current', 'course today', 'course week', 'course export-ics']],
  ['成绩与考试', ['grade list', 'grade summary', 'exam list', 'exam upcoming']],
  ['教务查询', ['classroom empty', 'program show', 'warning', 'timetable classes']],
  ['应用目录', ['apps list']]
];

const GLOBAL_OPTIONS = [
  { flag: '--format', type: 'string', choices: ['text', 'json'], default: 'json', description: '帮助输出格式' },
  { flag: '--backend', type: 'string', choices: ['fetch', 'bridge'], description: '强制指定后端' },
  { flag: '--daemon-url', type: 'string', default: 'http://127.0.0.1:10086', description: '桥接守护进程地址' },
  { flag: '--no-refresh', type: 'boolean', description: '禁用 Cookie 过期时的自动续期' }
];

const META = {
  'auth import': {
    backend: 'both',
    examples: ['seu-cli auth import --cookie-file app.txt', 'seu-cli auth import --cookie-file app.txt --portal-cookie-file portal.txt'],
    returns: 'imported, user, cookieKinds, sessionPath',
    optionHelp: {
      cookieFile: { description: '应用 Cookie 文件' },
      cookie: { description: '直接传入应用 Cookie' },
      portalCookieFile: { description: '门户 Cookie 文件（apps list 用）' },
      portalCookie: { description: '直接传入门户 Cookie' }
    }
  },
  'auth refresh': {
    backend: 'both',
    examples: ['seu-cli auth refresh', 'seu-cli auth refresh --profile "Profile 1"'],
    returns: 'refreshed, user, source, sessionPath',
    optionHelp: {
      browser: { description: 'chrome 或 edge', default: 'chrome' },
      profile: { description: '浏览器 profile 目录名', default: 'Default' }
    }
  },
  'auth status': { backend: 'both', examples: ['seu-cli auth status'], returns: 'logged_in, user, backend, sessionPath' },
  'auth logout': { backend: 'both', examples: ['seu-cli auth logout'], returns: 'loggedOut, hadSession, sessionPath' },
  'login-status': { backend: 'both', examples: ['seu-cli login-status'], returns: 'logged_in, user, checkedUrl' },
  'term current': { backend: 'both', examples: ['seu-cli term current'], returns: 'term, currentWeek, weekday, date' },
  'course today': {
    backend: 'both',
    examples: ['seu-cli course today', 'seu-cli course today --date 2026-10-21'],
    returns: 'term, date, week, weekday, count, courses[]',
    optionHelp: { date: { description: '目标日期，默认今天' } }
  },
  'course week': {
    backend: 'both',
    examples: ['seu-cli course week --week 5', 'seu-cli course week --week 5 --weekday 3'],
    returns: 'term, week, currentWeek, count, courses[]',
    optionHelp: {
      week: { description: '教学周，默认当前周' },
      weekday: { description: '1-7，周一为 1' }
    }
  },
  'course export-ics': {
    backend: 'both',
    examples: ['seu-cli course export-ics --week 5 --out week5.ics', 'seu-cli course export-ics --from-week 1 --to-week 16 --out all.ics'],
    returns: 'term, fromWeek, toWeek, eventCount, file 或 ics',
    optionHelp: {
      week: { description: '单周导出' },
      fromWeek: { description: '起始周' },
      toWeek: { description: '结束周' },
      out: { description: '输出 .ics 路径；省略时返回 ics 字符串' }
    }
  },
  'grade list': {
    backend: 'both',
    examples: ['seu-cli grade list', 'seu-cli grade list --term 2025-2026-2', 'seu-cli grade list --out grades.csv'],
    returns: 'count, summary, grades[]；带 --out 时返回 file',
    optionHelp: {
      term: { description: '学期代码，如 2025-2026-2' },
      out: { description: '导出 CSV 路径' }
    }
  },
  'grade summary': {
    backend: 'both',
    examples: ['seu-cli grade summary', 'seu-cli grade summary --term 2025-2026-2'],
    returns: 'count, overall, terms[]',
    optionHelp: { term: { description: '只统计指定学期' } }
  },
  'exam list': {
    backend: 'both',
    examples: ['seu-cli exam list', 'seu-cli exam list --term 2025-2026-2'],
    returns: 'term, currentTerm, count, exams[]',
    optionHelp: { term: { description: '学期代码' } }
  },
  'exam upcoming': {
    backend: 'both',
    examples: ['seu-cli exam upcoming', 'seu-cli exam upcoming --days 30 --limit 5'],
    returns: 'today, count, next, exams[]',
    optionHelp: {
      term: { description: '学期代码' },
      days: { description: '只看未来 N 天' },
      limit: { description: '最多返回条数', default: 10 }
    }
  },
  'classroom empty': {
    backend: 'fetch',
    examples: ['seu-cli classroom empty --campus 九龙湖', 'seu-cli classroom empty --campus 九龙湖 --building 教一 --sections 6-7'],
    returns: 'campus, building, date, time, count, classrooms[]',
    optionHelp: {
      campus: { description: '校区名称或代码', required: true },
      building: { description: '教学楼名称或代码' },
      date: { description: '日期，默认今天' },
      sections: { description: '节次，如 6-7；默认 1-2', default: '1-2' },
      start: { description: '开始时间 HH:MM' },
      end: { description: '结束时间 HH:MM' },
      selfStudy: { description: '只返回可自习教室' }
    }
  },
  'program show': {
    backend: 'fetch',
    examples: ['seu-cli program show'],
    returns: 'plan, credits.required/completed/remaining/percent'
  },
  warning: { backend: 'fetch', examples: ['seu-cli warning'], returns: 'count, warnings[]' },
  'timetable classes': {
    backend: 'fetch',
    examples: ['seu-cli timetable classes --limit 5', 'seu-cli timetable classes --search 建筑'],
    returns: 'term, total, count, classes[]',
    optionHelp: {
      term: { description: '学期代码' },
      page: { description: '页码', default: 1 },
      limit: { description: '每页条数', default: 50 },
      search: { description: '按班级/专业/院系过滤' }
    }
  },
  'apps list': {
    backend: 'both',
    examples: ['seu-cli apps list --search 教室', 'seu-cli apps list --limit 20'],
    returns: 'total, count, apps[]',
    optionHelp: {
      search: { description: '按名称/描述过滤' },
      limit: { description: '最多返回条数', default: 200 }
    }
  }
};

async function main(argv) {
  const { args, daemonUrl, backend, noRefresh, format } = extractGlobalOptions(argv);

  if (args[0] === '--version' || args[0] === '-v') {
    writeJson({ ok: true, data: { name: pkg.name, version: pkg.version } });
    return 0;
  }

  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    const topicArgs = args[0] === 'help' ? args.slice(1) : args.filter((arg) => !arg.startsWith('-'));
    writeHelp(buildHelp(topicArgs), format);
    return 0;
  }

  const commandKey = resolveCommand(args);
  if (!commandKey) {
    const error = new CliError('UNKNOWN_COMMAND', `Unknown command: ${args.slice(0, 2).join(' ')}.`, {
      hint: 'Run `seu-cli --help` to see supported commands.',
      details: { commands: Object.keys(COMMANDS) }
    });
    writeJson({ ok: false, error: toErrorPayload(error) });
    return exitCodeFor(error.code);
  }

  const definition = COMMANDS[commandKey];
  const rest = args.slice(commandKey.split(' ').length);
  if (rest.includes('--help') || rest.includes('-h')) {
    writeHelp(buildCommandHelp(commandKey), format);
    return 0;
  }

  let backendKind = definition.needsBackend === false ? 'local' : (backend ?? 'auto');
  try {
    const options = parseOptions(rest, definition.options);
    const context = definition.needsBackend === false
      ? {}
      : { backend: await getBackend({ daemonUrl, backend }) };
    if (context.backend) backendKind = context.backend.kind;

    const data = await definition.run(context, options);
    writeJson({
      ok: true,
      data,
      meta: { command: commandKey, backend: backendKind, daemonUrl }
    });
    return 0;
  } catch (error) {
    const payload = toErrorPayload(error);

    if (payload.code === 'NOT_LOGGED_IN'
      && definition.needsBackend !== false
      && backendKind === 'fetch'
      && !noRefresh) {
      try {
        await authRefresh({});
        const options = parseOptions(rest, definition.options);
        const retryBackend = await getBackend({ daemonUrl, backend: 'fetch' });
        const data = await definition.run({ backend: retryBackend }, options);
        writeJson({
          ok: true,
          data,
          meta: { command: commandKey, backend: 'fetch', daemonUrl, refreshed: true }
        });
        return 0;
      } catch {
        payload.hint = [payload.hint, '也可以运行 `seu-cli auth refresh` 从 Chrome 同步会话。']
          .filter(Boolean)
          .join(' ');
      }
    }

    writeJson({ ok: false, error: payload, meta: { command: commandKey, backend: backendKind } });
    return exitCodeFor(payload.code);
  }
}

function extractGlobalOptions(argv) {
  const args = [];
  let daemonUrl = process.env.SEU_DAEMON_URL || DEFAULT_DAEMON_URL;
  let backend = process.env.SEU_BACKEND || null;
  let noRefresh = false;
  let format = 'json';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-refresh') {
      noRefresh = true;
      continue;
    }
    if (arg === '--format') {
      const value = argv[index + 1];
      if (!['json', 'text'].includes(value)) throw invalidArgument('--format must be json or text.');
      format = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length);
      if (!['json', 'text'].includes(value)) throw invalidArgument('--format must be json or text.');
      format = value;
      continue;
    }
    if (arg === '--daemon-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw invalidArgument('--daemon-url requires a value.');
      daemonUrl = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--daemon-url=')) {
      daemonUrl = arg.slice('--daemon-url='.length);
      continue;
    }
    if (arg === '--backend') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw invalidArgument('--backend requires fetch or bridge.');
      backend = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--backend=')) {
      backend = arg.slice('--backend='.length);
      continue;
    }
    args.push(arg);
  }

  return { args, daemonUrl, backend, noRefresh, format };
}

function resolveCommand(args) {
  const twoWord = args.slice(0, 2).join(' ');
  if (Object.hasOwn(COMMANDS, twoWord)) return twoWord;
  if (Object.hasOwn(COMMANDS, args[0])) return args[0];
  return null;
}

function buildHelp(topicParts) {
  const topic = topicParts.join(' ');
  if (topic && COMMANDS[topic]) return buildCommandHelp(topic);

  if (topic) {
    const matching = Object.keys(COMMANDS).filter((key) => key.startsWith(`${topic} `));
    if (matching.length > 1) {
      return {
        group: topic,
        commands: matching.map((key) => ({ command: key, summary: COMMANDS[key].summary }))
      };
    }
  }

  return {
    name: pkg.name,
    version: pkg.version,
    usage: 'seu-cli [--format text|json] [--backend fetch|bridge] [--daemon-url URL] [--no-refresh] <command> [options]',
    globalOptions: GLOBAL_OPTIONS,
    groups: GROUPS.map(([name, keys]) => ({
      name,
      commands: keys.map((key) => ({
        command: key,
        summary: COMMANDS[key].summary,
        backend: META[key]?.backend ?? 'both'
      }))
    })),
    hint: '所有命令输出 JSON；seu-cli help <command> 查看单个命令，--format text 查看人类可读版本。'
  };
}

function buildCommandHelp(key) {
  const definition = COMMANDS[key];
  const meta = META[key] ?? {};
  const options = Object.entries(definition.options).map(([name, spec]) => {
    const help = meta.optionHelp?.[name] ?? {};
    return {
      flag: `--${kebab(name)}`,
      type: spec.type,
      ...(help.required ? { required: true } : {}),
      ...(spec.choices ? { choices: spec.choices } : {}),
      ...(help.default !== undefined ? { default: help.default } : {}),
      ...(spec.min !== undefined ? { min: spec.min } : {}),
      ...(spec.max !== undefined ? { max: spec.max } : {}),
      ...(help.description ? { description: help.description } : {})
    };
  });

  return {
    command: key,
    summary: definition.summary,
    backend: meta.backend ?? 'both',
    usage: `seu-cli ${key} [options]`,
    options,
    examples: meta.examples ?? [],
    returns: meta.returns ?? null,
    globalOptions: GLOBAL_OPTIONS
  };
}

function writeHelp(data, format) {
  if (format === 'text') {
    process.stdout.write(renderText(data));
    return;
  }
  writeJson({ ok: true, data });
}

function renderText(data) {
  const lines = [];
  if (data.groups) {
    lines.push(`${data.name} ${data.version}`, '', '用法:', `  ${data.usage}`, '', '全局选项:');
    for (const option of data.globalOptions) {
      lines.push(`  ${pad(option.flag)} ${optionDescription(option)}`);
    }
    for (const group of data.groups) {
      lines.push('', `${group.name}:`);
      for (const command of group.commands) {
        lines.push(`  ${pad(command.command)} ${command.summary}${command.backend === 'fetch' ? ' [fetch]' : ''}`);
      }
    }
    lines.push('', data.hint);
    return `${lines.join('\n')}\n`;
  }

  if (data.commands) {
    lines.push(`seu-cli ${data.group}`, '');
    for (const command of data.commands) lines.push(`  ${pad(command.command)} ${command.summary}`);
    return `${lines.join('\n')}\n`;
  }

  lines.push(`seu-cli ${data.command}`, '', data.summary, '', `后端: ${data.backend}`, '用法:', `  ${data.usage}`, '', '参数:');
  if (!data.options.length) lines.push('  （无）');
  for (const option of data.options) lines.push(`  ${pad(option.flag)} ${optionDescription(option)}`);
  if (data.examples.length) {
    lines.push('', '示例:');
    for (const example of data.examples) lines.push(`  ${example}`);
  }
  if (data.returns) lines.push('', `返回: ${data.returns}`);
  return `${lines.join('\n')}\n`;
}

function optionDescription(option) {
  const parts = [];
  if (option.description) parts.push(option.description);
  if (option.required) parts.push('(必填)');
  if (option.default !== undefined) parts.push(`(默认 ${option.default})`);
  if (option.choices) parts.push(`(${option.choices.join('|')})`);
  return parts.join(' ');
}

function pad(text, width = 24) {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const payload = toErrorPayload(error);
    writeJson({ ok: false, error: payload });
    process.exitCode = exitCodeFor(payload.code);
  });
