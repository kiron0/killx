import { CliError, EXIT_GENERIC, EXIT_NOT_FOUND } from "../errors";
import { parsePort } from "../port/parser";
import {
  findDockerContainerForPort,
  isDockerProcess,
} from "../platform/docker";
import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type {
  DockerContainerInfo,
  PlatformProvider,
  ProcessInfo,
} from "../types";
import type { Printer } from "../output";

export function detectSpecialSource(
  item: ProcessInfo,
  dockerInfo?: DockerContainerInfo | null,
): { source: string; details?: Record<string, string> } {
  if (dockerInfo) {
    return {
      source: "Docker",
      details: {
        Container: dockerInfo.name,
        Image: dockerInfo.image,
      },
    };
  }

  const procLower = item.process.toLowerCase();
  const cmdLower = item.command.toLowerCase();

  if (procLower.includes("kubectl") || cmdLower.includes("port-forward")) {
    return { source: "kubectl port-forward" };
  }

  if (procLower.includes("ssh") || cmdLower.includes("-l")) {
    return { source: "ssh -L" };
  }

  if (isDockerProcess(procLower, cmdLower)) {
    return { source: "Docker" };
  }

  return { source: "Native" };
}

export async function runInfoCommand(
  portArg: string,
  provider: PlatformProvider,
  printer: Printer,
  runner: CommandRunner = defaultCommandRunner,
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

  const isDocker = matches.some((m) => isDockerProcess(m.process, m.command));
  const dockerInfo = isDocker
    ? await findDockerContainerForPort(port, runner)
    : null;

  const effectiveMatches: ProcessInfo[] = matches;

  if (printer.json) {
    const jsonOutput = effectiveMatches.map((item) => {
      const { source, details } = detectSpecialSource(item, dockerInfo);
      if (source === "Native" && !dockerInfo && !details) {
        return item;
      }
      return {
        ...item,
        ...(source !== "Native" ? { source } : {}),
        ...(dockerInfo ? { docker: dockerInfo } : {}),
        ...(details ? { details } : {}),
      };
    });
    printer.encodeSingleOrList(jsonOutput);
    return;
  }

  printInfoMatches(effectiveMatches, dockerInfo, printer);
}

function printInfoMatches(
  matches: readonly ProcessInfo[],
  dockerInfo: DockerContainerInfo | null,
  printer: Printer,
): void {
  matches.forEach((item, index) => {
    if (index > 0) printer.line("");
    const { source, details } = detectSpecialSource(item, dockerInfo);
    const headers = ["Field", "Value"];
    const rows: string[][] = [["Port", String(item.port)]];

    if (source !== "Native") {
      rows.push(["Source", source]);
    }
    if (details) {
      for (const [k, v] of Object.entries(details)) {
        rows.push([k, v]);
      }
    }

    if (item.pid > 0) {
      rows.push(["PID", String(item.pid)]);
    }
    rows.push(["Process", item.process]);
    if (item.user) {
      rows.push(["User", item.user]);
    }
    rows.push(["Protocol", item.protocol]);
    rows.push(["State", item.state]);
    rows.push(["Command", item.command]);

    printer.table(headers, rows);
  });
}

export async function runCheckCommand(
  portArg: string,
  provider: PlatformProvider,
  printer: Printer,
  runner: CommandRunner = defaultCommandRunner,
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

  const isDocker = matches.some((m) => isDockerProcess(m.process, m.command));
  const dockerInfo = isDocker
    ? await findDockerContainerForPort(port, runner)
    : null;

  if (printer.json) {
    printer.encode({
      port,
      available: false,
      processes: matches,
      ...(dockerInfo ? { docker: dockerInfo } : {}),
    });
  } else {
    if (dockerInfo) {
      printer.line(
        `Port ${port} is in use by Docker container "${dockerInfo.name}"`,
      );
    } else {
      const first = matches[0]!;
      printer.line(
        `Port ${port} is in use by ${first.process} (PID ${first.pid})`,
      );
    }
  }
  throw new CliError(EXIT_GENERIC);
}
