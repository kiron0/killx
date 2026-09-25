import { expandPorts } from "../port/parser";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export async function runListCommand(
  rangeArg: string | undefined,
  provider: PlatformProvider,
  printer: Printer,
): Promise<void> {
  let processes = await provider.list();

  if (rangeArg) {
    const { ports } = expandPorts([rangeArg]);
    const allowed = new Set(ports);
    processes = processes.filter((item) => allowed.has(item.port));
  }

  processes.sort((a, b) => a.port - b.port);
  printer.processes(processes);
}
