export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

const MAX_ENTRIES = 200;

/**
 * Strip sensitive data before storage.
 * - side=N → [REDACTED]
 * - price=N → price=[REDACTED]
 * - amount=N → amount=[REDACTED]
 * - Full 66-char hex addresses (0x…) → first 16 chars + …
 */
function redact(msg: string): string {
  return msg
    .replace(/\bside=\d+/gi, 'side=[REDACTED]')
    .replace(/\bprice=\d[\d.]*/gi, 'price=[REDACTED]')
    .replace(/\bamount=\d[\d.]*/gi, 'amount=[REDACTED]')
    .replace(/0x[a-fA-F0-9]{64}/g, (m) => m.slice(0, 16) + '...');
}

class LogService {
  private buffer: LogEntry[] = [];

  addLog(level: LogEntry['level'], source: string, message: string) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      source,
      message: redact(message),
    };
    this.buffer.push(entry);
    if (this.buffer.length > MAX_ENTRIES) {
      this.buffer.shift();
    }
  }

  getRecentLogs(count: number = 100): LogEntry[] {
    return this.buffer.slice(-count);
  }
}

export const logService = new LogService();
