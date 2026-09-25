import type { CommandRunner } from "./command";
import type { ProcessInfo } from "../types";

export function portFromAddress(address: string): number {
  const index = address.lastIndexOf(":");
  if (index < 0) return 0;
  const raw = address
    .slice(index + 1)
    .replace(" (LISTEN)", "")
    .trim();
  const port = Number(raw);
  return Number.isInteger(port) ? port : 0;
}

export function parseLsof(output: string): Array<Omit<ProcessInfo, "command">> {
  const result: Array<Omit<ProcessInfo, "command">> = [];
  let current: Partial<Omit<ProcessInfo, "command">> = {
    protocol: "tcp",
    state: "listen",
  };
  const seen = new Set<string>();

  const flush = () => {
    if (current.pid && current.port) {
      const key = `${current.pid}:${current.port}`;
      if (!seen.has(key)) {
        result.push({
          pid: current.pid,
          port: current.port,
          process: current.process ?? "unknown",
          user: current.user ?? "",
          protocol: "tcp",
          state: current.state ?? "listen",
        });
        seen.add(key);
      }
    }
    delete current.port;
  };

  const lines = output.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const tag = line[0];
    const value = line.slice(1);

    switch (tag) {
      case "p":
        flush();
        current = {
          pid: Number(value) || 0,
          protocol: "tcp",
          state: "listen",
        };
        break;
      case "c":
        current.process = value;
        break;
      case "L":
        current.user = value;
        break;
      case "n":
        flush();
        current.port = portFromAddress(value);
        break;
      case "T":
        if (value.startsWith("ST=")) {
          current.state = value.slice(3).toLowerCase();
        }
        break;
    }
  }
  flush();
  return result;
}

export async function enrichCommandLine(
  runner: CommandRunner,
  pid: number,
  fallback: string,
): Promise<string> {
  try {
    const stdout = await runner("ps", ["-p", String(pid), "-o", "command="]);
    const trimmed = stdout.trim();
    return trimmed || fallback;
  } catch {
    return fallback;
  }
}

export async function parseLsofWithCommand(
  output: string,
  runner: CommandRunner,
): Promise<ProcessInfo[]> {
  const base = parseLsof(output);
  const enriched = await Promise.all(
    base.map(async (item) => ({
      ...item,
      command: await enrichCommandLine(runner, item.pid, item.process),
    })),
  );
  enriched.sort((a, b) =>
    a.port === b.port ? a.pid - b.pid : a.port - b.port,
  );
  return enriched;
}
