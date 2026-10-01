import { spawn, type ChildProcess } from "node:child_process";
import { CliError, EXIT_GENERIC } from "../errors";
import { runKill } from "./kill";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export type SpawnRunner = (
  file: string,
  args: string[],
  options: { stdio: "inherit"; shell: boolean },
) => ChildProcess;

export interface RunCommandOptions {
  ports: number[];
  command: string[];
  force?: boolean | undefined;
  tree?: boolean | undefined;
  timeoutMs?: number | undefined;
  provider: PlatformProvider;
  printer: Printer;
  spawnRunner?: SpawnRunner | undefined;
}

export async function waitForPortsFree(
  ports: readonly number[],
  provider: PlatformProvider,
  timeoutMs = 5000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let anyOccupied = false;
    for (const port of ports) {
      const matches = await provider.find(port);
      if (matches.length > 0) {
        anyOccupied = true;
        break;
      }
    }
    if (!anyOccupied) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const port of ports) {
    const matches = await provider.find(port);
    if (matches.length > 0) return false;
  }
  return true;
}

export async function runRunCommand(
  options: RunCommandOptions,
): Promise<number> {
  const {
    ports,
    command,
    force = false,
    tree = false,
    timeoutMs = 0,
    provider,
    printer,
    spawnRunner,
  } = options;

  if (ports.length === 0) {
    throw new CliError(EXIT_GENERIC, "run requires at least one port");
  }

  if (!command || command.length === 0) {
    throw new CliError(
      EXIT_GENERIC,
      "run requires a command to execute (e.g. killx run 3000 -- npm run dev)",
    );
  }

  const occupiedPorts: number[] = [];
  for (const port of ports) {
    const matches = await provider.find(port);
    if (matches.length > 0) {
      occupiedPorts.push(port);
    }
  }

  if (occupiedPorts.length > 0) {
    if (!printer.quiet && !printer.json) {
      printer.line(
        `Port :${occupiedPorts.join(", :")} occupied. Freeing listener(s)...`,
      );
    }
    await runKill({
      ports: occupiedPorts,
      hasRange: occupiedPorts.length > 1,
      force,
      tree,
      yes: true,
      timeoutMs,
      provider,
      printer,
    });
  }

  const freed = await waitForPortsFree(ports, provider, 5000);
  if (!freed) {
    throw new CliError(
      EXIT_GENERIC,
      `Failed to free port(s) :${ports.join(", :")} in time`,
    );
  }

  if (!printer.quiet && !printer.json) {
    printer.line(
      `✓ Port :${ports.join(", :")} free. Running: ${command.join(" ")}\n`,
    );
  }

  const [cmd, ...args] = command;
  return await new Promise<number>((resolve, reject) => {
    const spawnFn = spawnRunner ?? spawn;
    const child = spawnFn(cmd!, args, {
      stdio: "inherit",
      shell: true,
    });

    const forwardSignal = (sig: NodeJS.Signals) => {
      try {
        child.kill(sig);
      } catch {}
    };

    const sigintHandler = () => forwardSignal("SIGINT");
    const sigtermHandler = () => forwardSignal("SIGTERM");
    const sighupHandler = () => forwardSignal("SIGHUP");
    const sigquitHandler = () => forwardSignal("SIGQUIT");

    process.on("SIGINT", sigintHandler);
    process.on("SIGTERM", sigtermHandler);
    process.on("SIGHUP", sighupHandler);
    process.on("SIGQUIT", sigquitHandler);

    const cleanup = () => {
      process.removeListener("SIGINT", sigintHandler);
      process.removeListener("SIGTERM", sigtermHandler);
      process.removeListener("SIGHUP", sighupHandler);
      process.removeListener("SIGQUIT", sigquitHandler);
    };

    child.on("error", (err) => {
      cleanup();
      reject(err);
    });

    child.on("exit", (code, signal) => {
      cleanup();
      if (code !== null) {
        resolve(code);
      } else if (signal === "SIGINT") {
        resolve(130);
      } else if (signal === "SIGTERM") {
        resolve(143);
      } else if (signal === "SIGHUP") {
        resolve(129);
      } else if (signal === "SIGQUIT") {
        resolve(131);
      } else {
        resolve(1);
      }
    });
  });
}
