type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_TAGS: Record<LogLevel, string> = {
  debug: 'D',
  info: 'I',
  warn: 'W',
  error: 'E',
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(moduleName: string): Logger {
  const write = (level: LogLevel, message: string): void => {
    process.stderr.write(`[${LEVEL_TAGS[level]}] ${moduleName} - ${message}\n`);
  };

  return {
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
  };
}
