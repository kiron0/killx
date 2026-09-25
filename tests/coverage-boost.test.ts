import { describe, expect, it } from "vitest";
import { runInfoCommand, runCheckCommand } from "../src/commands/inspect";
import { runProcessCommand } from "../src/commands/process";
import { runWaitCommand } from "../src/commands/wait";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class StubProvider implements PlatformProvider {
  constructor(public data: ProcessInfo[] = []) {}
  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.data);
  }
  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.data.filter((item) => item.port === port));
  }
}

describe("commands coverage expansion", () => {
  it("runInfoCommand handles multiple processes", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new StubProvider([
      {
        pid: 1,
        port: 3000,
        process: "p1",
        user: "u1",
        command: "c1",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 2,
        port: 3000,
        process: "p2",
        user: "u2",
        command: "c2",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runInfoCommand("3000", provider, printer);
    expect(out).toContain("p1");
    expect(out).toContain("p2");
  });

  it("runInfoCommand handles multiple processes in JSON", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new StubProvider([
      {
        pid: 1,
        port: 3000,
        process: "p1",
        user: "u1",
        command: "c1",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 2,
        port: 3000,
        process: "p2",
        user: "u2",
        command: "c2",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runInfoCommand("3000", provider, printer);
    expect(out).toContain('"pid": 1');
    expect(out).toContain('"pid": 2');
  });

  it("runCheckCommand handles occupied port in JSON", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    const provider = new StubProvider([
      {
        pid: 1,
        port: 3000,
        process: "p1",
        user: "u1",
        command: "c1",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await expect(runCheckCommand("3000", provider, printer)).rejects.toThrow();
    expect(out).toContain('"available": false');
  });

  it("runWaitCommand times out", async () => {
    const printer = new Printer({ quiet: true });
    const provider = new StubProvider([]);
    await expect(
      runWaitCommand({
        portArg: "3000",
        timeoutSeconds: 0.1,
        occupied: true,
        provider,
        printer,
      }),
    ).rejects.toThrow(/Timed out/);
  });

  it("runWaitCommand handles occupied port reached", async () => {
    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });
    const provider = new StubProvider([
      {
        pid: 1,
        port: 3000,
        process: "p1",
        user: "u1",
        command: "c1",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    await runWaitCommand({
      portArg: "3000",
      timeoutSeconds: 1,
      occupied: true,
      provider,
      printer,
    });
    expect(out).toContain("Port 3000 is occupied");
  });

  it("runProcessCommand supports json output", async () => {
    let out = "";
    const printer = new Printer({ json: true, writer: (t) => (out += t) });
    await runProcessCommand({ query: "node" }, printer);
    expect(out).toContain("[");
  });

  it("runProcessCommand kill throws on empty match", async () => {
    const printer = new Printer({ quiet: true });
    await expect(
      runProcessCommand(
        { query: "nonexistent_query_xyz_123", kill: true, yes: true },
        printer,
      ),
    ).rejects.toThrow(/No matching processes/);
  });
});
