import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { terminateProcess } from "../src/process/kill";

describe("terminateProcess integration", () => {
  it("terminates process using SIGTERM by default", async () => {
    // Spawn a long running node process
    const child = spawn(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    const pid = child.pid!;
    expect(pid).toBeGreaterThan(1);

    const signal = await terminateProcess(pid, {
      force: false,
      timeoutMs: 1000,
    });
    expect(signal).toBe("SIGTERM");
  });

  it("terminates process using SIGKILL with force: true", async () => {
    const child = spawn(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    const pid = child.pid!;
    expect(pid).toBeGreaterThan(1);

    const signal = await terminateProcess(pid, { force: true });
    expect(signal).toBe("SIGKILL");
  });

  it("escalates to SIGKILL if process ignores SIGTERM", async () => {
    // Process traps SIGTERM and ignores it
    const child = spawn(process.execPath, [
      "-e",
      "process.on('SIGTERM', () => {}); process.stdout.write('ready\\n'); setInterval(() => {}, 1000)",
    ]);
    const pid = child.pid!;
    expect(pid).toBeGreaterThan(1);

    await new Promise<void>((resolve) => {
      child.stdout.once("data", () => resolve());
    });

    const signal = await terminateProcess(pid, {
      force: false,
      timeoutMs: 200,
    });
    expect(signal).toBe("SIGKILL");
  });

  it("refuses to terminate PID 1", async () => {
    await expect(terminateProcess(1)).rejects.toThrow(/refusing to terminate/);
  });
});
