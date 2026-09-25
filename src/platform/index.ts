import { DarwinProvider } from "./darwin";
import { LinuxProvider } from "./linux";
import { WindowsProvider } from "./windows";
import type { PlatformProvider } from "../types";

export function createPlatformProvider(): PlatformProvider {
  switch (process.platform) {
    case "darwin":
      return new DarwinProvider();
    case "win32":
      return new WindowsProvider();
    default:
      return new LinuxProvider();
  }
}

export { DarwinProvider, LinuxProvider, WindowsProvider };
export { defaultCommandRunner, type CommandRunner } from "./command";
export {
  parseLsof,
  parseLsofWithCommand,
  portFromAddress,
  enrichCommandLine,
} from "./lsof";
