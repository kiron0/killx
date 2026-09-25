import { describe, expect, it } from "vitest";
import { isTargetUnsafe } from "../src/commands/kill";
import { runInfoCommand, runCheckCommand } from "../src/commands/inspect";
import { runListCommand } from "../src/commands/list";
import { runFreeCommand } from "../src/commands/free";
import { runDevCommand } from "../src/commands/dev";
import { runWaitCommand } from "../src/commands/wait";
import { runWatchCommand } from "../src/commands/watch";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class MockProvider implements PlatformProvider {
  constructor(public items: ProcessInfo[] = []) {}

  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }

  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((item) => item.port === port));
  }
}

describe("isTargetUnsafe", () => {
  it("marks range or multiple targets as unsafe", () => {
    expect(isTargetUnsafe([], true)).toBe(true);
    const mockTargets: ProcessInfo[] = [
      {
        pid: 10,
        port: 3000,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 11,
        port: 3001,
        process: "vite",
        user: "me",
        command: "vite",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(mockTargets, false)).toBe(true);
  });

  it("marks pid 1 or root user as unsafe", () => {
    const rootTarget: ProcessInfo[] = [
      {
        pid: 99,
        port: 80,
        process: "nginx",
        user: "root",
        command: "nginx",
        protocol: "tcp",
        state: "listen",
      },
    ];
    expect(isTargetUnsafe(rootTarget, false)).toBe(true);
  });
});

describe("commands unit tests", () => {
  it("runInfoCommand outputs JSON when enabled", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new MockProvider([
      {
        pid: 1234,
        port: 3000,
        process: "node",
        user: "test",
        command: "node server.js",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runInfoCommand("3000", provider, printer);
    expect(out).toContain('"process": "node"');
  });

  it("runCheckCommand reports available when port not found", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new MockProvider([]);
    await runCheckCommand("3000", provider, printer);
    expect(out).toContain('"available": true');
  });

  it("runListCommand filters by port range", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new MockProvider([
      {
        pid: 10,
        port: 3000,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 20,
        port: 5000,
        process: "python",
        user: "me",
        command: "python",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runListCommand("3000-3500", provider, printer);
    expect(out).toContain('"port": 3000');
    expect(out).not.toContain('"port": 5000');
  });

  it("runFreeCommand prints next free port", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    await runFreeCommand("49200", printer);
    expect(out).toContain('"port":');
  });

  it("runDevCommand throws when no dev servers found", async () => {
    const printer = new Printer({ quiet: true });
    const provider = new MockProvider([
      {
        pid: 100,
        port: 3000,
        process: "customapp",
        user: "me",
        command: "customapp",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await expect(runDevCommand({ provider, printer })).rejects.toThrow();
  });

  it("runWaitCommand resolves when available", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new MockProvider([]);
    await runWaitCommand({
      portArg: "3000",
      timeoutSeconds: 1,
      provider,
      printer,
    });
    expect(out).toContain('"occupied": false');
  });

  it("runWatchCommand terminates when aborted", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new MockProvider([]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);
    await runWatchCommand({
      portArg: "3000",
      intervalMs: 100,
      provider,
      printer,
      signal: controller.signal,
    });
    expect(out).toContain("Watching :3000");
  });
});
