import { expandPorts } from "../port/parser";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export interface RunListOptions {
  rangeArg?: string | undefined;
  process?: string | undefined;
  port?: number | undefined;
}

export async function runListCommand(
  targetOrOptions: string | RunListOptions | undefined,
  provider: PlatformProvider,
  printer: Printer,
): Promise<void> {
  const options: RunListOptions =
    typeof targetOrOptions === "string"
      ? { rangeArg: targetOrOptions }
      : (targetOrOptions ?? {});

  let processes = await provider.list();

  if (options.rangeArg) {
    const { ports } = expandPorts([options.rangeArg]);
    const allowed = new Set(ports);
    processes = processes.filter((item) => allowed.has(item.port));
  }

  if (options.port !== undefined) {
    processes = processes.filter((item) => item.port === options.port);
  }

  if (options.process) {
    const query = options.process.toLowerCase();
    processes = processes.filter(
      (item) =>
        item.process.toLowerCase().includes(query) ||
        (item.command && item.command.toLowerCase().includes(query)),
    );
  }

  processes.sort((a, b) => a.port - b.port);
  printer.processes(processes);
}
