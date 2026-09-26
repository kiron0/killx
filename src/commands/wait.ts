import { CliError, EXIT_GENERIC, invalid } from "../errors";
import { parsePort } from "../port/parser";
import type { PlatformProvider } from "../types";
import type { Printer } from "../output";

export interface WaitCommandOptions {
  portArg: string;
  timeoutSeconds?: number | undefined;
  occupied?: boolean | undefined;
  provider: PlatformProvider;
  printer: Printer;
}

export async function runWaitCommand(
  options: WaitCommandOptions,
): Promise<void> {
  const {
    portArg,
    timeoutSeconds = 0,
    occupied = false,
    provider,
    printer,
  } = options;
  const target = parsePort(portArg);

  if (timeoutSeconds < 0) {
    throw invalid("timeout cannot be negative");
  }

  const deadline = timeoutSeconds > 0 ? Date.now() + timeoutSeconds * 1000 : 0;

  while (true) {
    const matches = await provider.find(target);
    const ready = occupied ? matches.length > 0 : matches.length === 0;

    if (ready) {
      if (printer.json) {
        printer.encode({ port: target, occupied });
      } else {
        if (occupied) {
          printer.line(`Port ${target} is occupied`);
        } else {
          printer.line(`Port ${target} is available`);
        }
      }
      return;
    }

    if (deadline > 0 && Date.now() > deadline) {
      throw new CliError(EXIT_GENERIC, "✗ Timed out waiting for port state");
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
