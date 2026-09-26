import { userInfo } from "node:os";
import { confirm } from "@clack/prompts";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_NOT_FOUND,
  EXIT_PERMISSION,
  EXIT_TERMINATION,
} from "../errors";
import { terminateProcess } from "../process/kill";
import type { KillResult, PlatformProvider, ProcessInfo } from "../types";
import type { Printer } from "../output";

export interface RunKillOptions {
  ports: number[];
  hasRange?: boolean | undefined;
  force?: boolean | undefined;
  yes?: boolean | undefined;
  timeoutMs?: number | undefined;
  provider: PlatformProvider;
  printer: Printer;
}

export function isTargetUnsafe(
  targets: readonly ProcessInfo[],
  hasRange: boolean,
): boolean {
  if (hasRange || targets.length > 1) return true;
  let currentUsername = "";
  try {
    currentUsername = userInfo().username;
  } catch {
    // ignore
  }

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
    timeoutMs = 0,
    provider,
    printer,
  } = options;

  const targets: ProcessInfo[] = [];
  const seenPid = new Set<number>();

  for (const port of ports) {
    const matches = await provider.find(port);
    for (const match of matches) {
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

  const unsafe = isTargetUnsafe(targets, hasRange);
  if (unsafe && !yes) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      printer.line(`Found ${targets.length} process(es):\n`);
      for (const t of targets) {
        printer.line(`${t.port}  ${t.process}  PID ${t.pid}  ${t.user}`);
      }
      printer.line("");
      const confirmed = await confirm({
        message: `Kill all ${targets.length} process(es)?`,
        initialValue: false,
      });
      if (typeof confirmed === "symbol" || !confirmed) {
        throw new CliError(EXIT_GENERIC, "Kill cancelled");
      }
    } else {
      // In non-interactive environments without --yes, abort safely
      throw new CliError(
        EXIT_GENERIC,
        "Destructive kill of multiple/unsafe targets requires --yes confirmation in non-interactive shell",
      );
    }
  }

  targets.sort((a, b) => a.port - b.port);
  const results: KillResult[] = [];
  let failed = false;
  let permission = false;

  for (const target of targets) {
    try {
      const signal = await terminateProcess(target.pid, {
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
      failed = true;
      const isPerm =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "EPERM";
      if (isPerm) {
        permission = true;
      }
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

  if (printer.json) {
    if (results.length === 1) {
      printer.encode(results[0]);
    } else {
      printer.encode(results);
    }
  }

  if (failed) {
    const firstFailed = results.find((r) => !r.success);
    const lastError = firstFailed?.error;
    if (permission) {
      const msg =
        results.length === 1 && firstFailed
          ? `✗ Permission denied while terminating ${firstFailed.process} (PID ${firstFailed.pid})\n\nTry:\n  sudo killx ${firstFailed.port}`
          : "✗ Permission denied while terminating process\n\nTry:\n  sudo killx <port>";
      throw new CliError(EXIT_PERMISSION, msg, lastError);
    }
    const msg =
      results.length === 1 && firstFailed
        ? `✗ ${firstFailed.process} (PID ${firstFailed.pid}) did not exit\n\nTry:\n  killx ${firstFailed.port} --force`
        : "✗ Process could not be terminated; retry with --force";
    throw new CliError(EXIT_TERMINATION, msg, lastError);
  }

  if (results.length > 1 && !printer.json) {
    printer.line(`\nKilled ${results.length} processes`);
  }
}
