import { defaultCommandRunner, type CommandRunner } from "./command";
import { portFromAddress } from "./lsof";
import type { PlatformProvider, ProcessInfo } from "../types";

export class WindowsProvider implements PlatformProvider {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = defaultCommandRunner) {
    this.runner = runner;
  }

  async list(): Promise<ProcessInfo[]> {
    let output: string;
    try {
      output = await this.runner("netstat", ["-ano", "-p", "tcp"]);
    } catch (error) {
      throw new Error(`inspect listening ports: ${String(error)}`, {
        cause: error,
      });
    }

    const seen = new Set<string>();
    const preliminary: Array<{ pid: number; port: number }> = [];

    const lines = output.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const fields = line.split(/\s+/);
      if (
        fields.length < 5 ||
        fields[0]?.toUpperCase() !== "TCP" ||
        fields[3]?.toUpperCase() !== "LISTENING"
      ) {
        continue;
      }

      const port = portFromAddress(fields[1] ?? "");
      const pid = Number(fields[4]);
      if (!port || !pid) continue;

      const key = `${pid}:${port}`;
      if (seen.has(key)) continue;
      seen.add(key);

      preliminary.push({ pid, port });
    }

    const result: ProcessInfo[] = [];
    for (const item of preliminary) {
      const { name, command } = await this.metadata(item.pid);
      result.push({
        pid: item.pid,
        port: item.port,
        process: name,
        user: "",
        command,
        protocol: "tcp",
        state: "listen",
      });
    }

    result.sort((a, b) =>
      a.port === b.port ? a.pid - b.pid : a.port - b.port,
    );
    return result;
  }

  private async metadata(
    pid: number,
  ): Promise<{ name: string; command: string }> {
    const script = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){$p.Name; $p.CommandLine}`;
    try {
      const stdout = await this.runner("powershell", [
        "-NoProfile",
        "-Command",
        script,
      ]);
      const lines = stdout
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const rawName = lines[0] ?? "unknown";
      const name = rawName.endsWith(".exe") ? rawName.slice(0, -4) : rawName;
      const command = lines.length > 1 ? lines.slice(1).join(" ") : name;
      return { name, command };
    } catch {
      return { name: "unknown", command: "" };
    }
  }

  async find(port: number): Promise<ProcessInfo[]> {
    const all = await this.list();
    return all.filter((item) => item.port === port);
  }
}
