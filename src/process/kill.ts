import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type { SignalName, TerminateOptions } from "../types";

export function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "EPERM"
    ) {
      return true;
    }
    return false;
  }
}

export function sendSignal(pid: number, force = false): void {
  const signal: NodeJS.Signals = force ? "SIGKILL" : "SIGTERM";
  process.kill(pid, signal);
}

export async function sendSignalWindows(
  pid: number,
  force = false,
  runner: CommandRunner = defaultCommandRunner,
): Promise<void> {
  const args = ["/PID", String(pid), "/T"];
  if (force) {
    args.push("/F");
  }
  await runner("taskkill", args);
}

export async function waitUntilGone(
  pid: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !isProcessAlive(pid);
}

export async function terminateProcess(
  pid: number,
  options: TerminateOptions = {},
  runner: CommandRunner = defaultCommandRunner,
): Promise<SignalName> {
  if (pid <= 1 || pid === process.pid) {
    throw new Error(`refusing to terminate protected PID ${pid}`);
  }

  const force = Boolean(options.force);
  const timeoutMs = options.timeoutMs ?? 0;

  const killFn = async (isForce: boolean) => {
    if (process.platform === "win32") {
      try {
        await sendSignalWindows(pid, isForce, runner);
      } catch {
        // Fall back to node process.kill
        sendSignal(pid, isForce);
      }
    } else {
      sendSignal(pid, isForce);
    }
  };

  const forceKill = async (): Promise<SignalName> => {
    await killFn(true);
    const gone = await waitUntilGone(pid, 2000);
    if (!gone) {
      throw new Error("process is still running");
    }
    return "SIGKILL";
  };

  if (force) {
    return await forceKill();
  }

  // Graceful termination
  await killFn(false);
  const waitTime = timeoutMs > 0 ? timeoutMs : 500;
  const gone = await waitUntilGone(pid, waitTime);
  if (gone) {
    return "SIGTERM";
  }

  if (timeoutMs <= 0) {
    throw new Error("process is still running");
  }

  return await forceKill();
}
