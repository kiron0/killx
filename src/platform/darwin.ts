import { defaultCommandRunner, type CommandRunner } from "./command";
import { queryListeningLsof } from "./lsof";
import type { ProcessInfo } from "../types";
import { BasePlatformProvider } from "./base";

export class DarwinProvider extends BasePlatformProvider {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner = defaultCommandRunner) {
    super();
    this.runner = runner;
  }

  async list(): Promise<ProcessInfo[]> {
    try {
      return await queryListeningLsof(this.runner);
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
}
