import { describe, expect, it, vi } from "vitest";
import { isTargetUnsafe, runKill } from "../src/commands/kill";
import { Printer } from "../src/output";
import {
  EXIT_GENERIC,
  EXIT_NOT_FOUND,
  EXIT_PERMISSION,
  EXIT_TERMINATION,
} from "../src/errors";
import type { KillResult, PlatformProvider, ProcessInfo } from "../src/types";
import * as procKill from "../src/process/kill";

class MockProvider implements PlatformProvider {
  constructor(private items: ProcessInfo[] = []) {}

  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }

  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((item) => item.port === port));
  }
}

describe("isTargetUnsafe function", () => {
  it("returns true when hasRange is true", () => {
    expect(isTargetUnsafe([], true)).toBe(true);
  });

  it("returns true when there are multiple targets", () => {
    const targets: ProcessInfo[] = [
      {
        pid: 10,
        port: 3000,
        process: "node",
        user: "dev",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 20,
        port: 3001,
        process: "vite",
        user: "dev",
        command: "vite",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(targets, false)).toBe(true);
  });

  it("returns true when target has pid 1", () => {
    const targets: ProcessInfo[] = [
      {
        pid: 1,
        port: 80,
        process: "init",
        user: "dev",
        command: "init",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(targets, false)).toBe(true);
  });

  it("returns true when target belongs to root", () => {
    const targets: ProcessInfo[] = [
      {
        pid: 50,
        port: 80,
        process: "nginx",
        user: "root",
        command: "nginx",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(targets, false)).toBe(true);
  });

  it("returns true when target user is different from current user", () => {
    const targets: ProcessInfo[] = [
      {
        pid: 60,
        port: 8080,
        process: "java",
        user: "some_other_user_99999",
        command: "java",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(targets, false)).toBe(true);
  });
});

describe("runKill command", () => {
  it("throws EXIT_NOT_FOUND when port has no listeners (non-json)", async () => {
    const provider = new MockProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await expect(
      runKill({
        ports: [3000],
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_NOT_FOUND });

    expect(lines.join("")).toContain("• Nothing is listening on :3000");
  });

  it("throws EXIT_NOT_FOUND and encodes empty array in json mode", async () => {
    const provider = new MockProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await expect(
      runKill({
        ports: [3000],
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_NOT_FOUND });

    expect(JSON.parse(lines.join(""))).toEqual([]);
  });

  it("throws EXIT_GENERIC in non-interactive environment when target is unsafe without --yes", async () => {
    const provider = new MockProvider([
      {
        pid: 999,
        port: 80,
        process: "nginx",
        user: "root",
        command: "nginx",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const printer = new Printer();

    await expect(
      runKill({
        ports: [80],
        yes: false,
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_GENERIC });
  });

  it("successfully terminates single process and prints success", async () => {
    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockResolvedValue("SIGTERM");

    const provider = new MockProvider([
      {
        pid: 1234,
        port: 3000,
        process: "node",
        user: "",
        command: "node server.js",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runKill({
      ports: [3000],
      yes: true,
      provider,
      printer,
    });

    expect(terminateSpy).toHaveBeenCalledWith(1234, {
      force: false,
      timeoutMs: 0,
    });
    expect(lines.join("")).toContain("Killed node (PID 1234) on :3000");
    terminateSpy.mockRestore();
  });

  it("successfully terminates process with force=true", async () => {
    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockResolvedValue("SIGKILL");

    const provider = new MockProvider([
      {
        pid: 2222,
        port: 5000,
        process: "python",
        user: "",
        command: "python app.py",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runKill({
      ports: [5000],
      force: true,
      yes: true,
      provider,
      printer,
    });

    expect(terminateSpy).toHaveBeenCalledWith(2222, {
      force: true,
      timeoutMs: 0,
    });
    terminateSpy.mockRestore();
  });

  it("outputs single KillResult in json mode for single target", async () => {
    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockResolvedValue("SIGTERM");

    const provider = new MockProvider([
      {
        pid: 3333,
        port: 8080,
        process: "java",
        user: "",
        command: "java",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runKill({
      ports: [8080],
      yes: true,
      provider,
      printer,
    });

    const parsed = JSON.parse(lines.join("")) as KillResult;
    expect(parsed).toEqual({
      success: true,
      port: 8080,
      pid: 3333,
      process: "java",
      signal: "SIGTERM",
    });
    terminateSpy.mockRestore();
  });

  it("outputs KillResult array in json mode for multiple targets", async () => {
    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockResolvedValue("SIGTERM");

    const provider = new MockProvider([
      {
        pid: 4001,
        port: 3000,
        process: "node",
        user: "",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 4002,
        port: 3001,
        process: "vite",
        user: "",
        command: "vite",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runKill({
      ports: [3000, 3001],
      yes: true,
      provider,
      printer,
    });

    const parsed = JSON.parse(lines.join("")) as KillResult[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.pid).toBe(4001);
    expect(parsed[1]?.pid).toBe(4002);
    terminateSpy.mockRestore();
  });

  it("throws EXIT_TERMINATION when process termination fails", async () => {
    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockRejectedValue(new Error("process is still running"));

    const provider = new MockProvider([
      {
        pid: 5555,
        port: 4000,
        process: "stuck-proc",
        user: "",
        command: "stuck",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const printer = new Printer({ quiet: true });

    await expect(
      runKill({
        ports: [4000],
        yes: true,
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_TERMINATION });

    terminateSpy.mockRestore();
  });

  it("throws EXIT_PERMISSION when process termination fails with EPERM", async () => {
    const permErr = new Error("kill EPERM");
    (permErr as { code?: string }).code = "EPERM";

    const terminateSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockRejectedValue(permErr);

    const provider = new MockProvider([
      {
        pid: 6666,
        port: 80,
        process: "root-proc",
        user: "",
        command: "root",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const printer = new Printer({ quiet: true });

    await expect(
      runKill({
        ports: [80],
        yes: true,
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_PERMISSION });

    terminateSpy.mockRestore();
  });
});
