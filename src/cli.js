#!/usr/bin/env node
import { createRequire } from 'node:module';

import { parseOptions, kebab } from './args.js';
import { getBackend } from './backends/index.js';
import { CliError, exitCodeFor, invalidArgument, toErrorPayload } from './errors.js';
import { appsList } from './commands/apps.js';
import { authImport, authLogout, authStatus } from './commands/auth.js';
import { courseExportIcs, courseToday, courseWeek } from './commands/course.js';
import { examList, examUpcoming } from './commands/exam.js';
import { gradeList, gradeSummary } from './commands/grade.js';
import { loginStatus } from './commands/login.js';

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

async function main(argv) {
  const { args, daemonUrl, backend } = extractGlobalOptions(argv);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    writeJson({ ok: true, data: buildHelp(args.filter((arg) => !arg.startsWith('-'))) });
    return 0;
  }

  if (args[0] === '--version' || args[0] === '-v') {
    writeJson({ ok: true, data: { name: pkg.name, version: pkg.version } });
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
    writeJson({ ok: true, data: buildCommandHelp(commandKey) });
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
    writeJson({ ok: false, error: payload, meta: { command: commandKey, backend: backendKind } });
    return exitCodeFor(payload.code);
  }
}

function extractGlobalOptions(argv) {
  const args = [];
  let daemonUrl = process.env.SEU_DAEMON_URL || DEFAULT_DAEMON_URL;
  let backend = process.env.SEU_BACKEND || null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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

  return { args, daemonUrl, backend };
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
    if (matching.length === 1) return buildCommandHelp(matching[0]);
    if (matching.length > 1) {
      return {
        command: topic,
        commands: Object.fromEntries(matching.map((key) => [key, COMMANDS[key].summary]))
      };
    }
  }
  return {
    name: pkg.name,
    version: pkg.version,
    usage: 'seu-cli [--backend fetch|bridge] [--daemon-url URL] <command> [options]',
    commands: Object.fromEntries(
      Object.entries(COMMANDS).map(([name, definition]) => [name, definition.summary])
    ),
    hint: 'All commands print {"ok":true,"data":...} or {"ok":false,"error":...}.'
  };
}

function buildCommandHelp(key) {
  const definition = COMMANDS[key];
  const options = Object.entries(definition.options).map(([name, spec]) => ({
    flag: `--${kebab(name)}`,
    type: spec.type,
    ...(spec.min !== undefined ? { min: spec.min } : {}),
    ...(spec.max !== undefined ? { max: spec.max } : {})
  }));
  return {
    command: key,
    summary: definition.summary,
    options
  };
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
