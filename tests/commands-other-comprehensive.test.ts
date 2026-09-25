import { describe, expect, it, vi } from "vitest";
import { runFreeCommand } from "../src/commands/free";
import { runListCommand } from "../src/commands/list";
import { runProcessCommand } from "../src/commands/process";
import { runDevCommand } from "../src/commands/dev";
import { runWaitCommand } from "../src/commands/wait";
import { runWatchCommand } from "../src/commands/watch";
import { Printer } from "../src/output";
import { EXIT_GENERIC, EXIT_NOT_FOUND, EXIT_TERMINATION } from "../src/errors";
import type { PlatformProvider, ProcessInfo } from "../src/types";
import * as procKill from "../src/process/kill";
import * as procSearch from "../src/process/search";
import * as cmdKill from "../src/commands/kill";

class MockProvider implements PlatformProvider {
  constructor(public items: ProcessInfo[] = []) {}

  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }

  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((item) => item.port === port));
  }
}

describe("runFreeCommand", () => {
  it("prints free port number starting from default 3000", async () => {
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });
    await runFreeCommand(undefined, printer);
    const port = Number(lines[0]!.trim());
    expect(port).toBeGreaterThanOrEqual(3000);
  });

  it("prints free port starting from custom port argument", async () => {
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });
    await runFreeCommand("40000", printer);
    const port = Number(lines[0]!.trim());
    expect(port).toBeGreaterThanOrEqual(40000);
  });

  it("outputs JSON when printer has json=true", async () => {
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });
    await runFreeCommand("50000", printer);
    const parsed = JSON.parse(lines.join("")) as { port: number };
    expect(parsed.port).toBeGreaterThanOrEqual(50000);
  });

  it("throws error when starting port argument is invalid", async () => {
    const printer = new Printer();
    await expect(runFreeCommand("not-a-port", printer)).rejects.toThrow();
  });
});

describe("runListCommand", () => {
  const sampleItems: ProcessInfo[] = [
    {
      pid: 10,
      port: 8080,
      process: "java",
      user: "u1",
      command: "java",
      protocol: "tcp",
      state: "listen",
    },
    {
      pid: 20,
      port: 3000,
      process: "node",
      user: "u2",
      command: "node",
      protocol: "tcp",
      state: "listen",
    },
    {
      pid: 30,
      port: 5173,
      process: "vite",
      user: "u3",
      command: "vite",
      protocol: "tcp",
      state: "listen",
    },
  ];

  it("lists all processes sorted by port ascending", async () => {
    const provider = new MockProvider(sampleItems);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runListCommand(undefined, provider, printer);
    const text = lines.join("");
    expect(text).toContain("3000");
    expect(text).toContain("5173");
    expect(text).toContain("8080");
  });

  it("filters processes by range argument", async () => {
    const provider = new MockProvider(sampleItems);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runListCommand("3000-5200", provider, printer);
    const text = lines.join("");
    expect(text).toContain("3000");
    expect(text).toContain("5173");
    expect(text).not.toContain("8080");
  });

  it("outputs JSON when printer has json=true", async () => {
    const provider = new MockProvider(sampleItems);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runListCommand("3000-4000", provider, printer);
    const parsed = JSON.parse(lines.join("")) as ProcessInfo[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.port).toBe(3000);
  });
});

describe("runProcessCommand", () => {
  it("renders table of processes matching search query", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([
        {
          pid: 100,
          user: "alice",
          cpu: 1.2,
          memory: 2.3,
          command: "node server.js",
        },
      ]);

    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });
    await runProcessCommand({ query: "node" }, printer);

    const text = lines.join("");
    expect(text).toContain("100");
    expect(text).toContain("alice");
    expect(text).toContain("node server.js");
    searchSpy.mockRestore();
  });

  it("renders JSON when printer has json=true", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([
        {
          pid: 200,
          user: "bob",
          cpu: 0.5,
          memory: 1.0,
          command: "python app.py",
        },
      ]);

    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });
    await runProcessCommand({ query: "python" }, printer);

    const parsed = JSON.parse(lines.join("")) as Array<{ pid: number }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.pid).toBe(200);
    searchSpy.mockRestore();
  });

  it("throws error when kill=true but query is missing", async () => {
    const printer = new Printer();
    await expect(
      runProcessCommand({ kill: true, query: "" }, printer),
    ).rejects.toThrow("process --kill requires a search query");
  });

  it("throws EXIT_NOT_FOUND when kill=true and no processes match", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([]);

    const printer = new Printer();
    await expect(
      runProcessCommand(
        { kill: true, query: "nonexistent", yes: true },
        printer,
      ),
    ).rejects.toMatchObject({ code: EXIT_NOT_FOUND });

    searchSpy.mockRestore();
  });

  it("throws EXIT_GENERIC in non-interactive shell when kill=true without --yes", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([
        { pid: 999, user: "u", cpu: 0, memory: 0, command: "cmd" },
      ]);

    const printer = new Printer();
    await expect(
      runProcessCommand({ kill: true, query: "cmd", yes: false }, printer),
    ).rejects.toMatchObject({ code: EXIT_GENERIC });

    searchSpy.mockRestore();
  });

  it("kills matching process with kill=true and yes=true", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([
        { pid: 77777, user: "u", cpu: 0, memory: 0, command: "cmd" },
      ]);
    const termSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockResolvedValue("SIGTERM");

    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });
    await runProcessCommand(
      { kill: true, query: "cmd", yes: true, force: false },
      printer,
    );

    expect(termSpy).toHaveBeenCalledWith(77777, { force: false });
    expect(lines.join("")).toContain("Killed 1 processes");

    searchSpy.mockRestore();
    termSpy.mockRestore();
  });

  it("throws EXIT_TERMINATION if terminating matched process throws", async () => {
    const searchSpy = vi
      .spyOn(procSearch, "searchProcesses")
      .mockResolvedValue([
        { pid: 88888, user: "u", cpu: 0, memory: 0, command: "cmd" },
      ]);
    const termSpy = vi
      .spyOn(procKill, "terminateProcess")
      .mockRejectedValue(new Error("failed"));

    const printer = new Printer({ quiet: true });
    await expect(
      runProcessCommand({ kill: true, query: "cmd", yes: true }, printer),
    ).rejects.toMatchObject({ code: EXIT_TERMINATION });

    searchSpy.mockRestore();
    termSpy.mockRestore();
  });
});

describe("runDevCommand", () => {
  it("throws EXIT_NOT_FOUND when no dev servers are active", async () => {
    const provider = new MockProvider([
      {
        pid: 1,
        port: 80,
        process: "custom-daemon",
        user: "u",
        command: "c",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const printer = new Printer();

    await expect(
      runDevCommand({ provider, printer, yes: true }),
    ).rejects.toMatchObject({ code: EXIT_NOT_FOUND });
  });

  it("identifies common dev servers (node, vite, python, java, etc.) and calls runKill", async () => {
    const provider = new MockProvider([
      {
        pid: 10,
        port: 3000,
        process: "node",
        user: "dev",
        command: "node app.js",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 20,
        port: 5173,
        process: "Vite", // case-insensitive
        user: "dev",
        command: "vite",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 30,
        port: 8000,
        process: "Python3",
        user: "dev",
        command: "python3 manage.py",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const runKillSpy = vi.spyOn(cmdKill, "runKill").mockResolvedValue();
    const printer = new Printer({ quiet: true });

    await runDevCommand({ provider, printer, yes: true, force: true });

    expect(runKillSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ports: [3000, 5173, 8000],
        hasRange: true,
        force: true,
        yes: true,
      }),
    );
    runKillSpy.mockRestore();
  });
});

describe("runWaitCommand", () => {
  it("throws error for negative timeoutSeconds", async () => {
    const provider = new MockProvider();
    const printer = new Printer();
    await expect(
      runWaitCommand({
        portArg: "3000",
        timeoutSeconds: -1,
        provider,
        printer,
      }),
    ).rejects.toThrow("timeout cannot be negative");
  });

  it("resolves immediately when waiting for free port and port is already free", async () => {
    const provider = new MockProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runWaitCommand({
      portArg: "3000",
      occupied: false,
      provider,
      printer,
    });
    expect(lines.join("")).toContain("Port 3000 is available");
  });

  it("resolves immediately when waiting for occupied port and port is already occupied", async () => {
    const provider = new MockProvider([
      {
        pid: 123,
        port: 3000,
        process: "node",
        user: "dev",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    await runWaitCommand({
      portArg: "3000",
      occupied: true,
      provider,
      printer,
    });
    expect(lines.join("")).toContain("Port 3000 is occupied");
  });

  it("outputs JSON in wait command when printer has json=true", async () => {
    const provider = new MockProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ json: true, writer: (s) => lines.push(s) });

    await runWaitCommand({
      portArg: "4000",
      occupied: false,
      provider,
      printer,
    });
    expect(JSON.parse(lines.join(""))).toEqual({
      port: 4000,
      occupied: false,
    });
  });

  it("times out and throws EXIT_GENERIC when condition not met within deadline", async () => {
    const provider = new MockProvider([
      {
        pid: 123,
        port: 3000,
        process: "node",
        user: "dev",
        command: "node",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const printer = new Printer({ quiet: true });

    await expect(
      runWaitCommand({
        portArg: "3000",
        occupied: false, // waiting for free, but it stays occupied
        timeoutSeconds: 0.1,
        provider,
        printer,
      }),
    ).rejects.toMatchObject({ code: EXIT_GENERIC });
  });
});

describe("runWatchCommand", () => {
  it("throws error when interval is less than 100ms", async () => {
    const provider = new MockProvider();
    const printer = new Printer();
    await expect(
      runWatchCommand({
        portArg: "3000",
        intervalMs: 50,
        provider,
        printer,
      }),
    ).rejects.toThrow("interval must be at least 100ms");
  });

  it("watches port and detects state changes until aborted", async () => {
    const provider = new MockProvider([]);
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });
    const ac = new AbortController();

    // After 150ms, simulate port becoming occupied and then abort
    setTimeout(() => {
      provider.items = [
        {
          pid: 9999,
          port: 3000,
          process: "node",
          user: "dev",
          command: "node",
          protocol: "tcp",
          state: "listen",
        },
      ];
    }, 150);

    setTimeout(() => {
      ac.abort();
    }, 350);

    await runWatchCommand({
      portArg: "3000",
      intervalMs: 100,
      provider,
      printer,
      signal: ac.signal,
    });

    const text = lines.join("");
    expect(text).toContain("Watching :3000");
    expect(text).toContain("FREE");
    expect(text).toContain("node started PID 9999");
  });
});
