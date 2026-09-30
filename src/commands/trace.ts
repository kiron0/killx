import { CliError, EXIT_NOT_FOUND } from "../errors";
import { parsePort } from "../port/parser";
import {
  formatTraceTree,
  getProcessAncestry,
  getSupervisorRoot,
} from "../process/tree";
import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export async function runTraceCommand(
  portArg: string,
  provider: PlatformProvider,
  printer: Printer,
  runner: CommandRunner = defaultCommandRunner,
): Promise<void> {
  const port = parsePort(portArg);
  const matches = await provider.find(port);

  if (matches.length === 0) {
    if (printer.json) {
      printer.encode({ port, found: false, tree: [] });
    } else {
      printer.empty(`Nothing is listening on :${port}`);
    }
    throw new CliError(EXIT_NOT_FOUND);
  }

  const listener = matches[0]!;
  const ancestry = await getProcessAncestry(listener.pid, runner);
  const supervisor = getSupervisorRoot(ancestry);

  if (printer.json) {
    printer.encode({
      port,
      found: true,
      listener: {
        port,
        pid: listener.pid,
        process: listener.process,
        user: listener.user,
        command: listener.command,
        protocol: listener.protocol,
        state: listener.state,
      },
      supervisor: supervisor
        ? {
            pid: supervisor.pid,
            name: supervisor.name,
            command: supervisor.command,
          }
        : null,
      tree: ancestry,
    });
    return;
  }

  const treeText = formatTraceTree(port, ancestry);
  printer.line(treeText);

  if (supervisor && supervisor.pid !== listener.pid) {
    printer.line("");
    printer.line(
      `Supervisor detected: ${supervisor.name} (PID ${supervisor.pid})`,
    );
    printer.line(
      `To terminate the full supervisor and prevent restarts, run: killx ${port} --tree`,
    );
  }
}
