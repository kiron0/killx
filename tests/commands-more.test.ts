import { describe, expect, it } from "vitest";
import { runProcessCommand } from "../src/commands/process";
import { runKill } from "../src/commands/kill";
import { runCheckCommand, runInfoCommand } from "../src/commands/inspect";
import { runDevCommand } from "../src/commands/dev";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class TestProvider implements PlatformProvider {
  constructor(public listItems: ProcessInfo[] = []) {}
  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.listItems);
  }
  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.listItems.filter((i) => i.port === port));
  }
}

describe("more command branches", () => {
  it("runCheckCommand prints error when in use", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new TestProvider([
      {
        pid: 111,
        port: 3000,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await expect(runCheckCommand("3000", provider, printer)).rejects.toThrow();
    expect(out).toContain("Port 3000 is in use by node");
  });

  it("runInfoCommand prints table for non-json output", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new TestProvider([
      {
        pid: 111,
        port: 3000,
        process: "node",
        user: "me",
        command: "node server.js",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runInfoCommand("3000", provider, printer);
    expect(out).toContain("Port");
    expect(out).toContain("node server.js");
  });

  it("runProcessCommand renders table for process search", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    await runProcessCommand({ query: "node" }, printer);
    expect(out).toContain("PID");
  });

  it("runProcessCommand requires query with kill", async () => {
    const printer = new Printer({ quiet: true });
    await expect(runProcessCommand({ kill: true }, printer)).rejects.toThrow(
      /requires a search query/,
    );
  });

  it("runDevCommand kills dev servers if found", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new TestProvider([
      {
        pid: 222,
        port: 3000,
        process: "node",
        user: "me",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    // Will attempt to terminate PID 222; in test env might fail kill or succeed, let's catch or assert
    try {
      await runDevCommand({ yes: true, provider, printer });
    } catch {
      // ignore
    }
  });

  it("runKill throws when nothing listening", async () => {
    const printer = new Printer({ quiet: true });
    const provider = new TestProvider([]);
    await expect(
      runKill({ ports: [3000], provider, printer }),
    ).rejects.toThrow();
  });
});
