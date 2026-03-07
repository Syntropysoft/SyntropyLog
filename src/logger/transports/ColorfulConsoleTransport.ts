/**
 * @file src/logger/transports/ColorfulConsoleTransport.ts
 * @description A transport that formats logs with full-line, level-based colors (Python colorlog/rich style).
 * Timestamp, level, service, message and metadata are all colored so the entire line is vivid end-to-end.
 */
import { LogLevel } from '../levels';
import { TransportOptions } from './Transport';
import { BaseConsolePrettyTransport } from './BaseConsolePrettyTransport';
import { LogEntry } from '../../types';

const LEVEL_PAD = 8;

type LevelStyle = {
  level: (s: string) => string;
  message: (s: string) => string;
  metaKey: (s: string) => string;
  metaValue: (s: string) => string;
};

/**
 * @class ColorfulConsoleTransport
 * @description Console transport with full-line colored output (Python colorlog/rich style):
 * timestamp, level, service, message and metadata all use level-based colors so the whole line is vivid.
 * @extends {BaseConsolePrettyTransport}
 */
export class ColorfulConsoleTransport extends BaseConsolePrettyTransport {
  private readonly levelStyleMap: Record<Exclude<LogLevel, 'silent'>, LevelStyle>;

  constructor(options?: TransportOptions) {
    super(options);
    const c = this.chalk;
    // Full-line color schemes per level (colorlog/rich style)
    this.levelStyleMap = {
      trace: { level: c.gray.bold, message: c.gray, metaKey: c.gray.dim, metaValue: c.gray },
      debug: { level: c.cyan.bold, message: c.cyan, metaKey: c.cyan.dim, metaValue: c.cyan },
      info: { level: c.green.bold, message: c.green, metaKey: c.green.dim, metaValue: c.green },
      warn: { level: c.yellow.bold, message: c.yellow, metaKey: c.yellow.dim, metaValue: c.yellow },
      error: { level: c.red.bold, message: c.red, metaKey: c.red.dim, metaValue: c.red },
      fatal: { level: c.red.bgWhite.bold, message: c.red.bold, metaKey: c.red.dim, metaValue: c.red },
      audit: { level: c.magenta.bold, message: c.magenta, metaKey: c.magenta.dim, metaValue: c.magenta },
    };
  }

  /**
   * Formats the log entry with full-line coloring: every part uses the level color scheme.
   */
  protected formatLogString(logObject: LogEntry): string {
    const { timestamp, level, service, message, ...rest } = logObject;

    const style =
      this.levelStyleMap[level as Exclude<LogLevel, 'silent'>] ?? {
        level: this.chalk.white.bold,
        message: this.chalk.white,
        metaKey: this.chalk.gray,
        metaValue: this.chalk.white,
      };

    const timeStr = style.metaKey(
      new Date(timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    );
    const levelLabel = level.toUpperCase().padEnd(LEVEL_PAD);
    const levelStr = style.level(levelLabel);
    const serviceStr = service ? style.metaValue(`(${service})`) : '';
    const messageText = style.message(message ?? '');

    let line = `${timeStr} ${levelStr}`;
    if (serviceStr) line += ` ${serviceStr}`;
    line += ` ${messageText}`;

    const metaKeys = Object.keys(rest);
    if (metaKeys.length > 0) {
      const metaParts = metaKeys.map((key) => {
        const value = rest[key];
        const formatted =
          typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
        return `${style.metaKey(key)}=${style.metaValue(formatted)}`;
      });
      line += `\n  ${this.chalk.dim('└─')} ${metaParts.join(' ')}`;
    }

    return line;
  }
}
