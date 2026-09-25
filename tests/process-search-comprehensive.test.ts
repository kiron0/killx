import { describe, expect, it } from "vitest";
import { searchProcesses } from "../src/process/search";
import type { CommandRunner } from "../src/platform/command";

describe("searchProcesses on Darwin/Linux (ps)", () => {
  const samplePsOutput = [
    "  101 alice   1.5  0.8 /usr/local/bin/node /app/server.js",
    "  202 bob     0.0  2.1 /usr/bin/python3 main.py --worker",
    "  303 charlie 10.2 5.0 java -jar /var/app/service.jar",
    "  404 root    0.1  0.2 /usr/sbin/nginx -g daemon off;",
    "  505 alice   0.5  0.4 vite --port 5173",
    "  invalid-line",
    "",
    "  999 only three fields",
  ].join("\n");

  const psRunner: CommandRunner = async (_cmd, _args) => {
    return samplePsOutput;
  };

  it("returns all processes when query is empty", async () => {
    const results = await searchProcesses("", psRunner);
    expect(results).toHaveLength(5);
    expect(results[0]).toEqual({
      pid: 101,
      user: "alice",
      cpu: 1.5,
      memory: 0.8,
      command: "/usr/local/bin/node /app/server.js",
    });
    expect(results[1]!.process ?? results[1]!.command).toContain("python3");
  });

  it("filters processes by case-insensitive query", async () => {
    const results = await searchProcesses("NODE", psRunner);
    expect(results).toHaveLength(1);
    expect(results[0]!.pid).toBe(101);
  });

  it("filters processes matching partial query 'vite'", async () => {
    const results = await searchProcesses("vite", psRunner);
    expect(results).toHaveLength(1);
    expect(results[0]!.pid).toBe(505);
  });

  it("filters processes matching argument in command line '--worker'", async () => {
    const results = await searchProcesses("--worker", psRunner);
    expect(results).toHaveLength(1);
    expect(results[0]!.pid).toBe(202);
  });

  it("returns empty array when query does not match any process", async () => {
    const results = await searchProcesses("nonexistent-daemon", psRunner);
    expect(results).toHaveLength(0);
  });

  it("parses cpu and memory as numbers", async () => {
    const results = await searchProcesses("java", psRunner);
    expect(results[0]!.cpu).toBe(10.2);
    expect(results[0]!.memory).toBe(5.0);
  });

  const queryKeywords = [
    "python",
    "python3",
    "java",
    "nginx",
    "daemon",
    "server",
    "5173",
    "app",
  ];

  for (const kw of queryKeywords) {
    it(`searches with keyword "${kw}"`, async () => {
      const results = await searchProcesses(kw, psRunner);
      expect(results.length).toBeGreaterThan(0);
      for (const item of results) {
        expect(item.command.toLowerCase()).toContain(kw);
      }
    });
  }
});

describe("searchProcesses on Windows (powershell CIM)", () => {
  it("parses array of processes in JSON output", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const winRunner: CommandRunner = async () => {
      return JSON.stringify([
        {
          ProcessId: 1000,
          CommandLine: "C:\\Program Files\\nodejs\\node.exe server.js",
        },
        {
          ProcessId: 2000,
          CommandLine: "C:\\Python310\\python.exe -m http.server 8000",
        },
        { ProcessId: 3000, CommandLine: "C:\\Windows\\system32\\cmd.exe" },
      ]);
    };

    try {
      const all = await searchProcesses("", winRunner);
      expect(all).toHaveLength(3);
      expect(all[0]!.pid).toBe(1000);
      expect(all[0]!.command).toContain("node.exe");

      const filtered = await searchProcesses("python", winRunner);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.pid).toBe(2000);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("handles single object JSON output from powershell", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const winRunner: CommandRunner = async () => {
      return JSON.stringify({ ProcessId: 7777, CommandLine: "node index.js" });
    };

    try {
      const results = await searchProcesses("node", winRunner);
      expect(results).toHaveLength(1);
      expect(results[0]!.pid).toBe(7777);
      expect(results[0]!.command).toBe("node index.js");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("handles powershell command failure gracefully", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const brokenRunner: CommandRunner = async () => {
      throw new Error("powershell execution restricted");
    };

    try {
      const results = await searchProcesses("", brokenRunner);
      expect(results).toEqual([]);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("handles empty or null CommandLine in powershell output", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    const winRunner: CommandRunner = async () => {
      return JSON.stringify([
        { ProcessId: 8888, CommandLine: null },
        { ProcessId: 8889 },
      ]);
    };

    try {
      const results = await searchProcesses("", winRunner);
      expect(results).toHaveLength(2);
      expect(results[0]!.pid).toBe(8888);
      expect(results[0]!.command).toBe("");
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });
});
