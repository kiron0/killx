import { describe, expect, it } from "vitest";
import { runCheckCommand, runInfoCommand } from "../src/commands/inspect";
import { Printer } from "../src/output";
import { EXIT_GENERIC, EXIT_NOT_FOUND } from "../src/errors";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class MockInspectProvider implements PlatformProvider {
  constructor(private items: ProcessInfo[] = []) {}

  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }

  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((item) => item.port === port));
  }
}

describe("runInfoCommand", () => {
  it("throws error for invalid port argument", async () => {
    const provider = new MockInspectProvider();
    const printer = new Printer();
    await expect(
      runInfoCommand("invalid", provider, printer),
    ).rejects.toThrow();
  });

  it("throws EXIT_NOT_FOUND and outputs empty notice when no listener found", async () => {
    const provider = new MockInspectProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await expect(
      runInfoCommand("3000", provider, printer),
    ).rejects.toMatchObject({
      code: EXIT_NOT_FOUND,
    });
    expect(lines.join("")).toContain("• Nothing is listening on :3000");
  });

  it("throws EXIT_NOT_FOUND and encodes null in json mode when no listener found", async () => {
    const provider = new MockInspectProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await expect(
      runInfoCommand("3000", provider, printer),
    ).rejects.toMatchObject({
      code: EXIT_NOT_FOUND,
    });
    expect(JSON.parse(lines.join(""))).toBeNull();
  });

  it("prints formatted key-value table for single listener in non-json mode", async () => {
    const proc: ProcessInfo = {
      pid: 1234,
      port: 3000,
      process: "node",
      user: "alice",
      protocol: "tcp",
      state: "listen",
      command: "node server.js",
    };
    const provider = new MockInspectProvider([proc]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runInfoCommand("3000", provider, printer);
    const text = lines.join("");
    expect(text).toContain("Port");
    expect(text).toContain("3000");
    expect(text).toContain("PID");
    expect(text).toContain("1234");
    expect(text).toContain("Process");
    expect(text).toContain("node");
    expect(text).toContain("User");
    expect(text).toContain("alice");
    expect(text).toContain("Command");
    expect(text).toContain("node server.js");
  });

  it("encodes single object in json mode for single listener", async () => {
    const proc: ProcessInfo = {
      pid: 5678,
      port: 8080,
      process: "java",
      user: "bob",
      protocol: "tcp",
      state: "listen",
      command: "java -jar app.jar",
    };
    const provider = new MockInspectProvider([proc]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runInfoCommand("8080", provider, printer);
    expect(JSON.parse(lines.join(""))).toEqual(proc);
  });

  it("encodes array of objects in json mode for multiple listeners", async () => {
    const p1: ProcessInfo = {
      pid: 101,
      port: 80,
      process: "nginx",
      user: "root",
      protocol: "tcp",
      state: "listen",
      command: "nginx",
    };
    const p2: ProcessInfo = {
      pid: 102,
      port: 80,
      process: "nginx",
      user: "www-data",
      protocol: "tcp",
      state: "listen",
      command: "nginx",
    };
    const provider = new MockInspectProvider([p1, p2]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runInfoCommand("80", provider, printer);
    expect(JSON.parse(lines.join(""))).toEqual([p1, p2]);
  });
});

describe("runCheckCommand", () => {
  it("throws error for invalid port argument", async () => {
    const provider = new MockInspectProvider();
    const printer = new Printer();
    await expect(
      runCheckCommand("bad-port", provider, printer),
    ).rejects.toThrow();
  });

  it("returns cleanly and prints availability message when port is free (non-json)", async () => {
    const provider = new MockInspectProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runCheckCommand("3000", provider, printer);
    expect(lines.join("")).toContain("Port 3000 is available");
  });

  it("returns cleanly and encodes available:true in json mode when port is free", async () => {
    const provider = new MockInspectProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runCheckCommand("3000", provider, printer);
    expect(JSON.parse(lines.join(""))).toEqual({
      port: 3000,
      available: true,
    });
  });

  it("throws EXIT_GENERIC and prints in-use message when port is occupied (non-json)", async () => {
    const proc: ProcessInfo = {
      pid: 4321,
      port: 5000,
      process: "python",
      user: "dev",
      protocol: "tcp",
      state: "listen",
      command: "python app.py",
    };
    const provider = new MockInspectProvider([proc]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await expect(
      runCheckCommand("5000", provider, printer),
    ).rejects.toMatchObject({
      code: EXIT_GENERIC,
    });
    expect(lines.join("")).toContain(
      "Port 5000 is in use by python (PID 4321)",
    );
  });

  it("throws EXIT_GENERIC and encodes available:false with processes in json mode when port is occupied", async () => {
    const proc: ProcessInfo = {
      pid: 4321,
      port: 5000,
      process: "python",
      user: "dev",
      protocol: "tcp",
      state: "listen",
      command: "python app.py",
    };
    const provider = new MockInspectProvider([proc]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await expect(
      runCheckCommand("5000", provider, printer),
    ).rejects.toMatchObject({
      code: EXIT_GENERIC,
    });
    expect(JSON.parse(lines.join(""))).toEqual({
      port: 5000,
      available: false,
      processes: [proc],
    });
  });

  const checkPorts = [80, 443, 3000, 5173, 8080, 9000, 65535];
  for (const p of checkPorts) {
    it(`checks port ${p} with mock provider`, async () => {
      const provider = new MockInspectProvider([]);
      const printer = new Printer({ quiet: true });
      await runCheckCommand(String(p), provider, printer);
    });
  }
});
