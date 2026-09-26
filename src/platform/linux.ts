import { defaultCommandRunner, type CommandRunner } from "./command";
import { enrichCommandLine, queryListeningLsof, portFromAddress } from "./lsof";
import type { ProcessInfo } from "../types";
import { BasePlatformProvider } from "./base";

const SS_PROCESS_REGEX = /users:\(\("([^"]+)",pid=([0-9]+)/;

export class LinuxProvider extends BasePlatformProvider {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = defaultCommandRunner) {
    super();
    this.runner = runner;
  }

  async list(): Promise<ProcessInfo[]> {
    try {
      return await queryListeningLsof(this.runner);
    } catch {
      return await this.listFallback();
    }
  }

  private async listFallback(): Promise<ProcessInfo[]> {
    try {
      const stdout = await this.runner("ss", ["-H", "-lptn"]);
      return await this.parseSS(stdout);
    } catch (error) {
      throw new Error(`inspect listening ports: ${String(error)}`, {
        cause: error,
      });
    }
  }

  private async parseSS(output: string): Promise<ProcessInfo[]> {
    const lines = output.split("\n");
    const result: ProcessInfo[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const fields = line.split(/\s+/);
      if (fields.length < 4) continue;
      const local = fields[3] ?? "";
      const port = portFromAddress(local);
      const match = SS_PROCESS_REGEX.exec(line);
      if (!port || !match || !match[1] || !match[2]) continue;

      const pid = Number(match[2]);
      const name = match[1];
      const user = await this.lookupUser(pid);
      const command = await enrichCommandLine(this.runner, pid, name);

      result.push({
        pid,
        port,
        process: name,
        user,
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

  private async lookupUser(pid: number): Promise<string> {
    try {
      const stdout = await this.runner("ps", [
        "-p",
        String(pid),
        "-o",
        "user=",
      ]);
      return stdout.trim();
    } catch {
      return "";
    }
  }
}
