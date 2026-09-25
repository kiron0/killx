import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runKill } from "../src/commands/kill";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class LiveMockProvider implements PlatformProvider {
  constructor(private readonly items: ProcessInfo[]) {}
  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }
  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((i) => i.port === port));
  }
}

describe("runKill live tests", () => {
  it("kills process and formats success message", async () => {
    const child = spawn(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    const pid = child.pid!;

    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new LiveMockProvider([
      {
        pid,
        port: 48999,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);

    await runKill({
      ports: [48999],
      yes: true,
      provider,
      printer,
    });

    expect(out).toContain("Killed node");
  });

  it("kills multiple processes with JSON output", async () => {
    const child1 = spawn(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    const child2 = spawn(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);

    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new LiveMockProvider([
      {
        pid: child1.pid!,
        port: 48997,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: child2.pid!,
        port: 48998,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);

    await runKill({
      ports: [48997, 48998],
      yes: true,
      provider,
      printer,
    });

    expect(out).toContain('"success": true');
    expect(out).toContain("48997");
    expect(out).toContain("48998");
  });
});
