import { invalid } from "../errors";
import { parsePort } from "../port/parser";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export interface WatchCommandOptions {
  portArg: string;
  intervalMs?: number | undefined;
  provider: PlatformProvider;
  printer: Printer;
  signal?: AbortSignal | undefined;
}

export async function runWatchCommand(
  options: WatchCommandOptions,
): Promise<void> {
  const { portArg, intervalMs = 1000, provider, printer, signal } = options;
  const target = parsePort(portArg);

  if (intervalMs < 100) {
    throw invalid("interval must be at least 100ms");
  }

  printer.line(`Watching :${target}`);
  let last = "";

  while (!signal?.aborted) {
    const matches = await provider.find(target);
    const state =
      matches.length > 0
        ? `${matches[0]!.process} started PID ${matches[0]!.pid}`
        : "FREE";

    if (state !== last) {
      const timeStr = new Date().toTimeString().slice(0, 8);
      printer.line(`${timeStr}  ${state}`);
      last = state;
    }

    if (signal?.aborted) break;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
