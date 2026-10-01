import { userInfo } from "node:os";
import { cancel, confirm } from "@clack/prompts";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_NOT_FOUND,
  EXIT_PERMISSION,
  EXIT_TERMINATION,
} from "../errors";
import { terminateProcess } from "../process/kill";
import {
  formatTreePreview,
  getProcessAncestry,
  getSupervisorRoot,
  terminateProcessTree,
} from "../process/tree";
import {
  findDockerContainerForPort,
  isDockerProcess,
  stopDockerContainer,
} from "../platform/docker";
import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type {
  KillResult,
  PlatformProvider,
  ProcessInfo,
  SignalName,
} from "../types";
import type { Printer } from "../output";

export interface RunKillOptions {
  ports: number[];
  hasRange?: boolean | undefined;
  force?: boolean | undefined;
  yes?: boolean | undefined;
  tree?: boolean | undefined;
  timeoutMs?: number | undefined;
  provider: PlatformProvider;
  printer: Printer;
  runner?: CommandRunner | undefined;
}

export function isTargetUnsafe(
  targets: readonly ProcessInfo[],
  hasRange: boolean,
): boolean {
  if (hasRange || targets.length > 1) return true;
  let currentUsername = "";
  try {
    currentUsername = userInfo().username;
  } catch {}

  for (const t of targets) {
    if (t.pid === 1) return true;
    if (t.user === "root") return true;
    if (t.user && currentUsername && t.user !== currentUsername) return true;
  }
  return false;
}

export async function runKill(options: RunKillOptions): Promise<void> {
  const {
    ports,
    hasRange = false,
    force = false,
    yes = false,
    tree = false,
    timeoutMs = 0,
    provider,
    printer,
    runner = defaultCommandRunner,
  } = options;

  const targets: ProcessInfo[] = [];
  const seenPid = new Set<number>();
  const portsWithListeners = new Set<number>();

  for (const port of ports) {
    const matches = await provider.find(port);
    for (const match of matches) {
      portsWithListeners.add(port);
      if (!seenPid.has(match.pid)) {
        targets.push(match);
        seenPid.add(match.pid);
      }
    }
  }

  if (targets.length === 0) {
    if (printer.json) {
      printer.encode([]);
    } else {
      for (const port of ports) {
        printer.empty(`Nothing is listening on :${port}`);
      }
    }
    throw new CliError(EXIT_NOT_FOUND);
  }

  const results: KillResult[] = [];
  const handledDockerPorts = new Set<number>();

  for (const port of portsWithListeners) {
    const portTargets = targets.filter((t) => t.port === port);
    const hasDockerHint = portTargets.some((t) =>
      isDockerProcess(t.process, t.command),
    );

    const dockerInfo = hasDockerHint
      ? await findDockerContainerForPort(port, runner)
      : null;

    if (dockerInfo) {
      handledDockerPorts.add(port);
      if (!yes) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          printer.line(
            `Port ${port} is published by Docker container "${dockerInfo.name}".\n`,
          );
          const confirmed = await confirm({
            message: "Stop container?",
            initialValue: false,
          });
          if (typeof confirmed === "symbol" || !confirmed) {
            cancel("Cancelled.");
            throw new CliError(EXIT_GENERIC, "Kill cancelled");
          }
        } else {
          throw new CliError(
            EXIT_GENERIC,
            `Port ${port} is published by Docker container "${dockerInfo.name}". Use --yes to confirm stopping container in non-interactive shell`,
          );
        }
      }

      try {
        const dockerTimeoutSec =
          timeoutMs > 0 ? Math.round(timeoutMs / 1000) : undefined;
        await stopDockerContainer(
          dockerInfo.name,
          force,
          runner,
          dockerTimeoutSec,
        );
        results.push({
          success: true,
          port,
          process: `docker:${dockerInfo.name}`,
          signal: force ? "SIGKILL" : "SIGTERM",
        });
        if (!printer.json) {
          printer.success(
            `Stopped Docker container "${dockerInfo.name}" on :${port}`,
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({
          success: false,
          port,
          process: `docker:${dockerInfo.name}`,
          error: message,
        });
      }
    }
  }

  const remainingTargets = targets.filter(
    (t) => !handledDockerPorts.has(t.port),
  );

  if (tree && remainingTargets.length > 0) {
    const killedSupervisors = new Map<number, SignalName>();

    for (const target of remainingTargets) {
      const ancestry = await getProcessAncestry(target.pid, runner);
      const supervisor = getSupervisorRoot(ancestry) ?? {
        pid: target.pid,
        name: target.process,
        command: target.command,
        ppid: 1,
      };

      if (killedSupervisors.has(supervisor.pid)) {
        const existingSignal = killedSupervisors.get(supervisor.pid)!;
        results.push({
          success: true,
          port: target.port,
          pid: supervisor.pid,
          process: supervisor.name,
          signal: existingSignal,
        });
        continue;
      }

      if (!yes) {
        if (process.stdin.isTTY && process.stdout.isTTY) {
          printer.line(`Port :${target.port}\n`);
          printer.line(formatTreePreview(ancestry, target.pid));
          printer.line("");
          const confirmed = await confirm({
            message: "Kill process tree?",
            initialValue: false,
          });
          if (typeof confirmed === "symbol" || !confirmed) {
            cancel("Cancelled.");
            throw new CliError(EXIT_GENERIC, "Kill cancelled");
          }
        } else {
          throw new CliError(
            EXIT_GENERIC,
            "Destructive tree kill requires --yes confirmation in non-interactive shell",
          );
        }
      }

      try {
        const signal = await terminateProcessTree(
          supervisor.pid,
          { force, timeoutMs },
          runner,
        );
        killedSupervisors.set(supervisor.pid, signal);
        results.push({
          success: true,
          port: target.port,
          pid: supervisor.pid,
          process: supervisor.name,
          signal,
        });
        if (!printer.json) {
          printer.success(
            `Killed process tree for :${target.port} (root ${supervisor.name} PID ${supervisor.pid})`,
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          success: false,
          port: target.port,
          pid: supervisor.pid,
          process: supervisor.name,
          error: message,
        });
      }
    }
  } else if (remainingTargets.length > 0) {
    const unsafe = isTargetUnsafe(remainingTargets, hasRange);
    if (unsafe && !yes) {
      if (process.stdin.isTTY && process.stdout.isTTY) {
        printer.line(`Found ${remainingTargets.length} process(es):\n`);
        for (const t of remainingTargets) {
          printer.line(`${t.port}  ${t.process}  PID ${t.pid}  ${t.user}`);
        }
        printer.line("");
        const confirmed = await confirm({
          message: `Kill all ${remainingTargets.length} process(es)?`,
          initialValue: false,
        });
        if (typeof confirmed === "symbol" || !confirmed) {
          cancel("Cancelled.");
          throw new CliError(EXIT_GENERIC, "Kill cancelled");
        }
      } else {
        throw new CliError(
          EXIT_GENERIC,
          "Destructive kill of multiple/unsafe targets requires --yes confirmation in non-interactive shell",
        );
      }
    }

    remainingTargets.sort((a, b) => a.port - b.port);
    for (const target of remainingTargets) {
      try {
        const signal = options.runner
          ? await terminateProcess(
              target.pid,
              {
                force,
                timeoutMs,
              },
              runner,
            )
          : await terminateProcess(target.pid, {
              force,
              timeoutMs,
            });
        results.push({
          success: true,
          port: target.port,
          pid: target.pid,
          process: target.process,
          signal,
        });
        if (!printer.json) {
          printer.success(
            `Killed ${target.process} (PID ${target.pid}) on :${target.port}`,
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          success: false,
          port: target.port,
          pid: target.pid,
          process: target.process,
          error: message,
        });
      }
    }
  }

  if (printer.json) {
    printer.encodeSingleOrList(results);
  }

  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    const firstFailed = failed[0]!;
    const lastError = firstFailed.error;
    const isPerm =
      lastError?.includes("EPERM") ||
      lastError?.includes("Operation not permitted") ||
      lastError?.includes("Access is denied");

    const pidLabel = firstFailed.pid ? ` (PID ${firstFailed.pid})` : "";
    if (isPerm) {
      const msg =
        results.length === 1
          ? `✗ Permission denied while terminating ${firstFailed.process}${pidLabel}\n\nTry:\n  sudo killx ${firstFailed.port}`
          : "✗ Permission denied while terminating process\n\nTry:\n  sudo killx <port>";
      throw new CliError(EXIT_PERMISSION, msg, lastError);
    }

    const msg =
      results.length === 1
        ? `✗ ${firstFailed.process}${pidLabel} did not exit\n\nTry:\n  killx ${firstFailed.port} --force`
        : "✗ Process could not be terminated; retry with --force";
    throw new CliError(EXIT_TERMINATION, msg, lastError);
  }

  if (results.length > 1 && !printer.json) {
    printer.line(`\nKilled ${results.length} processes`);
  }
}
