import { defaultCommandRunner, type CommandRunner } from "./command";
import { parseLsofWithCommand } from "./lsof";
import type { PlatformProvider, ProcessInfo } from "../types";

export class DarwinProvider implements PlatformProvider {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = defaultCommandRunner) {
    this.runner = runner;
  }

  async list(): Promise<ProcessInfo[]> {
    try {
      const stdout = await this.runner("lsof", [
        "-nP",
        "-iTCP",
        "-sTCP:LISTEN",
        "-FpcLntT",
      ]);
      return await parseLsofWithCommand(stdout, this.runner);
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: number }).code === 1
      ) {
        return [];
      }
      throw error;
    }
  }

  async find(port: number): Promise<ProcessInfo[]> {
    const all = await this.list();
    return all.filter((item) => item.port === port);
  }
}
