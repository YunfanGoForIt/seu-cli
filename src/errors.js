export class CliError extends Error {
  constructor(code, message, { hint, details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'CliError';
    this.code = code;
    if (hint) this.hint = hint;
    if (details !== undefined) this.details = details;
  }
}

const EXIT_CODES = {
  INVALID_ARGUMENT: 2,
  UNKNOWN_COMMAND: 2,
  UNSUPPORTED_BACKEND: 2,
  NOT_LOGGED_IN: 3,
  PORTAL_COOKIE_REQUIRED: 3,
  PERMISSION_DENIED: 4,
  RATE_LIMITED: 4,
  UPSTREAM_ERROR: 4,
  PAGE_CHANGED: 4,
  APP_LAUNCH_FAILED: 4,
  NETWORK_ERROR: 5,
  DAEMON_UNAVAILABLE: 5,
  EXTENSION_NOT_CONNECTED: 5,
  DAEMON_ERROR: 5
};

export function exitCodeFor(code) {
  return EXIT_CODES[code] ?? 1;
}

export function toErrorPayload(error) {
  if (error instanceof CliError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
      ...(error.details !== undefined ? { details: error.details } : {})
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : String(error)
  };
}

export function invalidArgument(message, details) {
  return new CliError('INVALID_ARGUMENT', message, {
    hint: 'Run `seu-cli <command> --help` to see supported options.',
    details
  });
}

export function notLoggedIn(message = 'The browser is not logged in to Southeast University.') {
  return new CliError('NOT_LOGGED_IN', message, {
    hint: 'Open https://auth.seu.edu.cn in the browser and finish login, then retry.'
  });
}

export function pageChanged(message) {
  return new CliError('PAGE_CHANGED', message, {
    hint: 'The SEU page or API shape may have changed. Re-run once; if it persists, update the command adapter.'
  });
}

export function requireFetchBackend(backend) {
  if (backend.kind !== 'fetch') {
    throw new CliError('UNSUPPORTED_BACKEND', 'This command currently requires the fetch backend.', {
      hint: 'Run `seu-cli auth refresh` and retry without `--backend bridge`.'
    });
  }
}
