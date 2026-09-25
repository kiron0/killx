import { findFreePort } from "../port/free";
import { parsePort } from "../port/parser";
import type { Printer } from "../output";

export async function runFreeCommand(
  startArg: string | undefined,
  printer: Printer,
): Promise<void> {
  let start = 3000;
  if (startArg) {
    start = parsePort(startArg);
  }
  const available = await findFreePort(start);
  if (printer.json) {
    printer.encode({ port: available });
  } else {
    printer.line(String(available));
  }
}
