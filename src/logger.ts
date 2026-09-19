export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  turn?: number;
  step?: number;
  requestId?: number;
}

export interface LogRecordInput {
  at: number;
  level: LogLevel;
  module: string;
  message: string;
  context: LogContext;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const LEVEL_TAGS: Record<LogLevel, string> = { debug: 'D', info: 'I', warn: 'W', error: 'E' };
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
};
const RESET = '\u001b[0m';
const DEFAULT_LEVEL: LogLevel = 'info';

let sink: ((record: LogRecordInput) => void) | undefined;
let warnedInvalidLevel = false;

export function setLogSink(next?: (record: LogRecordInput) => void): void {
  sink = next;
}

export function parseLogLevel(raw: string | undefined): LogLevel {
  if (raw === undefined || raw === '') {
    return DEFAULT_LEVEL;
  }
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  if (!warnedInvalidLevel) {
    warnedInvalidLevel = true;
    writeLine('warn', 'Logger', `Unknown MG_LOG_LEVEL "${raw}", falling back to ${DEFAULT_LEVEL}`);
  }
  return DEFAULT_LEVEL;
}

export function getLogLevel(): LogLevel {
  return parseLogLevel(process.env['MG_LOG_LEVEL']);
}

function timestamp(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function useColor(): boolean {
  return process.stderr.isTTY === true && process.env['NO_COLOR'] === undefined;
}

function formatPrefix(level: LogLevel, moduleName: string, at: number): string {
  const tag = `[${LEVEL_TAGS[level]}]`;
  const colored = useColor() ? `${LEVEL_COLORS[level]}${tag}${RESET}` : tag;
  return `${timestamp(at)} ${colored} ${moduleName} - `;
}

function writeLine(level: LogLevel, moduleName: string, message: string, at = Date.now()): void {
  process.stderr.write(`${formatPrefix(level, moduleName, at)}${message}\n`);
}

export function createLogger(moduleName: string): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    const at = Date.now();
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[getLogLevel()]) {
      writeLine(level, moduleName, message, at);
    }
    sink?.({ at, level, module: moduleName, message, context: context ?? {} });
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  };
}

export function installGlobalErrorHandlers(): void {
  const logger = createLogger('Process');
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error instanceof Error ? error.stack ?? error.message : error}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack ?? reason.message : reason}`);
  });
}
