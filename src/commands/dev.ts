import { runKill } from "./kill";
import { CliError, EXIT_NOT_FOUND } from "../errors";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

const DEV_PROCESS_NAMES = new Set([
  "node",
  "bun",
  "deno",
  "vite",
  "next",
  "next-server",
  "python",
  "python3",
  "django",
  "rails",
  "ruby",
  "php",
  "java",
]);

export interface DevCommandOptions {
  force?: boolean | undefined;
  yes?: boolean | undefined;
  provider: PlatformProvider;
  printer: Printer;
}

export async function runDevCommand(options: DevCommandOptions): Promise<void> {
  const { force = false, yes = false, provider, printer } = options;
  const listeners = await provider.list();

  const ports: number[] = [];
  const seenPort = new Set<number>();

  for (const item of listeners) {
    const name = item.process.toLowerCase();
    if (DEV_PROCESS_NAMES.has(name) && !seenPort.has(item.port)) {
      ports.push(item.port);
      seenPort.add(item.port);
    }
  }

  if (ports.length === 0) {
    throw new CliError(EXIT_NOT_FOUND, "• No development servers found");
  }

  await runKill({
    ports,
    hasRange: true,
    force,
    yes,
    timeoutMs: 0,
    provider,
    printer,
  });
}
