import type { ProcessInfo } from "../types";

export interface PrinterOptions {
  json?: boolean | undefined;
  quiet?: boolean | undefined;
  noColor?: boolean | undefined;
  writer?: ((text: string) => void) | undefined;
  errorWriter?: ((text: string) => void) | undefined;
}

export class Printer {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly color: boolean;
  private readonly writeOutput: (text: string) => void;
  private readonly writeError: (text: string) => void;

  constructor(options: PrinterOptions = {}) {
    this.json = Boolean(options.json);
    this.quiet = Boolean(options.quiet);
    this.color =
      !options.noColor &&
      !process.env.NO_COLOR &&
      Boolean(process.stdout.isTTY);
    this.writeOutput = options.writer ?? ((text) => process.stdout.write(text));
    this.writeError =
      options.errorWriter ?? ((text) => process.stderr.write(text));
  }

  encode(value: unknown): void {
    if (this.quiet) return;
    this.writeOutput(JSON.stringify(value, null, 2) + "\n");
  }

  encodeSingleOrList<T>(items: readonly T[]): void {
    this.encode(items.length === 1 ? items[0] : items);
  }

  line(message: string): void {
    if (this.quiet) return;
    this.writeOutput(`${message}\n`);
  }

  error(message: string): void {
    this.writeError(`${message}\n`);
  }

  success(message: string): void {
    if (this.quiet) return;
    const prefix = this.color ? "\x1b[32m✓\x1b[0m" : "✓";
    this.line(`${prefix} ${message}`);
  }

  empty(message: string): void {
    if (this.quiet) return;
    const prefix = this.color ? "\x1b[2m•\x1b[0m" : "•";
    this.line(`${prefix} ${message}`);
  }

  processes(processes: readonly ProcessInfo[]): void {
    if (this.quiet) return;
    if (this.json) {
      this.encode(processes);
      return;
    }
    const headers = ["PORT", "PID", "PROCESS", "USER"];
    const rows = processes.map((item) => [
      String(item.port),
      String(item.pid),
      item.process,
      item.user || "",
    ]);
    this.table(headers, rows);
  }

  table(headers: string[], rows: string[][]): void {
    if (this.quiet) return;
    const colWidths = headers.map((header, colIndex) => {
      let max = header.length;
      for (const row of rows) {
        const cell = row[colIndex] ?? "";
        if (cell.length > max) max = cell.length;
      }
      return max;
    });

    const formatRow = (cols: string[]) =>
      cols
        .map((cell, idx) => {
          const width = colWidths[idx] ?? cell.length;
          return cell.padEnd(width);
        })
        .join("  ")
        .trimEnd();

    this.line(formatRow(headers));
    for (const row of rows) {
      this.line(formatRow(row));
    }
  }
}

export const THANKS_MESSAGE =
  "\nThanks for using killx..!\nFor more visit - killx.js.org";

export function printThanks(): void {
  console.log(THANKS_MESSAGE);
}
