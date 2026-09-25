import { confirm } from "@clack/prompts";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_NOT_FOUND,
  EXIT_TERMINATION,
} from "../errors";
import { searchProcesses } from "../process/search";
import { terminateProcess } from "../process/kill";
import type { ProcessUsage } from "../types";
import type { Printer } from "../output";

export interface ProcessCommandOptions {
  query?: string | undefined;
  kill?: boolean | undefined;
  force?: boolean | undefined;
  yes?: boolean | undefined;
}

export async function runProcessCommand(
  options: ProcessCommandOptions,
  printer: Printer,
): Promise<void> {
  const query = options.query ?? "";
  if (options.kill && !query) {
    throw new Error("process --kill requires a search query");
  }

  const matches = await searchProcesses(query);

  if (options.kill) {
    await killProcessMatches(
      matches,
      options.force ?? false,
      options.yes ?? false,
      printer,
    );
    return;
  }

  if (printer.json) {
    printer.encode(matches);
    return;
  }

  const headers = ["PID", "USER", "CPU", "MEM", "COMMAND"];
  const rows = matches.map((m) => [
    String(m.pid),
    m.user,
    m.cpu.toFixed(1),
    m.memory.toFixed(1),
    m.command,
  ]);
  printer.table(headers, rows);
}

async function killProcessMatches(
  matches: readonly ProcessUsage[],
  force: boolean,
  yes: boolean,
  printer: Printer,
): Promise<void> {
  if (matches.length === 0) {
    throw new CliError(EXIT_NOT_FOUND, "• No matching processes");
  }

  if (!yes) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const confirmed = await confirm({
        message: `Kill ${matches.length} matching process(es)?`,
        initialValue: false,
      });
      if (typeof confirmed === "symbol" || !confirmed) {
        throw new CliError(EXIT_GENERIC, "Kill cancelled");
      }
    } else {
      throw new CliError(
        EXIT_GENERIC,
        "Destructive process killing requires --yes in non-interactive environment",
      );
    }
  }

  let failed = false;
  let killed = 0;
  const currentPid = process.pid;

  for (const item of matches) {
    if (item.pid === currentPid) continue;
    try {
      await terminateProcess(item.pid, { force });
      killed++;
    } catch {
      failed = true;
    }
  }

  if (failed) {
    throw new CliError(
      EXIT_TERMINATION,
      "✗ One or more processes could not be terminated",
    );
  }

  printer.success(`Killed ${killed} processes`);
}
