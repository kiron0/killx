import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type { ProcessUsage } from "../types";

export async function searchProcesses(
  query = "",
  runner: CommandRunner = defaultCommandRunner,
): Promise<ProcessUsage[]> {
  const normalizedQuery = query.toLowerCase();

  if (process.platform === "win32") {
    const script = `Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
    try {
      const stdout = await runner("powershell", [
        "-NoProfile",
        "-Command",
        script,
      ]);
      const raw = JSON.parse(stdout.trim() || "[]") as Array<{
        ProcessId?: number;
        CommandLine?: string;
      }>;
      const list = Array.isArray(raw) ? raw : [raw];
      const result: ProcessUsage[] = [];
      for (const item of list) {
        const cmd = item.CommandLine ?? "";
        if (!normalizedQuery || cmd.toLowerCase().includes(normalizedQuery)) {
          result.push({
            pid: item.ProcessId ?? 0,
            user: "",
            cpu: 0,
            memory: 0,
            command: cmd,
          });
        }
      }
      return result;
    } catch {
      return [];
    }
  }

  // Darwin and Linux
  const stdout = await runner("ps", [
    "-axo",
    "pid=,user=,%cpu=,%mem=,command=",
  ]);
  const lines = stdout.split("\n");
  const result: ProcessUsage[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (fields.length < 5) continue;

    const command = fields.slice(4).join(" ");
    if (normalizedQuery && !command.toLowerCase().includes(normalizedQuery)) {
      continue;
    }

    const pid = Number(fields[0]);
    const user = fields[1] ?? "";
    const cpu = Number(fields[2]) || 0;
    const memory = Number(fields[3]) || 0;

    result.push({
      pid,
      user,
      cpu,
      memory,
      command,
    });
  }

  return result;
}
