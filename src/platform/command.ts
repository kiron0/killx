import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandOptions {
  timeout?: number;
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options?: CommandOptions,
) => Promise<string>;

export const defaultCommandRunner: CommandRunner = async (
  command,
  args,
  options = {},
) => {
  const { stdout } = await execFileAsync(command, [...args], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeout ?? 15_000,
    windowsHide: true,
  });
  return stdout;
};
