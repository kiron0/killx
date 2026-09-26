import { CliError, EXIT_GENERIC, EXIT_NOT_FOUND } from "../errors";
import { parsePort } from "../port/parser";
import type { PlatformProvider, ProcessInfo } from "../types";
import type { Printer } from "../output";

export async function runInfoCommand(
  portArg: string,
  provider: PlatformProvider,
  printer: Printer,
): Promise<void> {
  const port = parsePort(portArg);
  const matches = await provider.find(port);

  if (matches.length === 0) {
    if (printer.json) {
      printer.encode(null);
    } else {
      printer.empty(`Nothing is listening on :${port}`);
    }
    throw new CliError(EXIT_NOT_FOUND);
  }

  if (printer.json) {
    printer.encodeSingleOrList(matches);
    return;
  }

  printInfoMatches(matches, printer);
}

function printInfoMatches(
  matches: readonly ProcessInfo[],
  printer: Printer,
): void {
  matches.forEach((item, index) => {
    if (index > 0) printer.line("");
    const headers = ["Field", "Value"];
    const rows = [
      ["Port", String(item.port)],
      ["PID", String(item.pid)],
      ["Process", item.process],
      ["User", item.user || ""],
      ["Protocol", item.protocol],
      ["State", item.state],
      ["Command", item.command],
    ];
    printer.table(headers, rows);
  });
}

export async function runCheckCommand(
  portArg: string,
  provider: PlatformProvider,
  printer: Printer,
): Promise<void> {
  const port = parsePort(portArg);
  const matches = await provider.find(port);

  if (matches.length === 0) {
    if (printer.json) {
      printer.encode({ port, available: true });
    } else {
      printer.line(`Port ${port} is available`);
    }
    return;
  }

  if (printer.json) {
    printer.encode({ port, available: false, processes: matches });
  } else {
    const first = matches[0]!;
    printer.line(
      `Port ${port} is in use by ${first.process} (PID ${first.pid})`,
    );
  }
  throw new CliError(EXIT_GENERIC);
}
