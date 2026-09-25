import { describe, expect, it } from "vitest";
import { LinuxProvider } from "../src/platform/linux";
import type { CommandRunner } from "../src/platform/command";

describe("LinuxProvider with lsof success", () => {
  it("uses lsof when available and enriches processes", async () => {
    const lsofOutput = ["p100", "cnode", "Ldev", "n*:3000 (LISTEN)"].join("\n");

    const mockRunner: CommandRunner = (cmd) => {
      if (cmd === "lsof") return Promise.resolve(lsofOutput);
      if (cmd === "ps") return Promise.resolve("node server.js");
      return Promise.reject(new Error(`Unexpected command: ${cmd}`));
    };

    const provider = new LinuxProvider(mockRunner);
    const results = await provider.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.port).toBe(3000);
    expect(results[0]!.process).toBe("node");
    expect(results[0]!.command).toBe("node server.js");
  });
});

describe("LinuxProvider ss fallback", () => {
  const ssSampleOutput = [
    `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=1234,fd=19))`,
    `LISTEN 0 128 [::]:8080 [::]:* users:(("java",pid=5678,fd=42))`,
    `LISTEN 0 100 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=999,fd=7))`,
    `LISTEN 0 128 *:443 *:* users:(("nginx",pid=100,fd=5))`,
  ].join("\n");

  const fallbackRunner: CommandRunner = (cmd, args) => {
    if (cmd === "lsof")
      return Promise.reject(new Error("lsof: command not found"));
    if (cmd === "ss") return Promise.resolve(ssSampleOutput);
    if (cmd === "ps") {
      if (args.includes("user=")) return Promise.resolve("appuser");
      if (args.includes("command="))
        return Promise.resolve(`full-cmd-${args[1]}`);
    }
    return Promise.resolve("");
  };

  it("falls back to ss when lsof fails", async () => {
    const provider = new LinuxProvider(fallbackRunner);
    const results = await provider.list();
    expect(results).toHaveLength(4);
    expect(results[0]!.port).toBe(443);
    expect(results[0]!.process).toBe("nginx");
    expect(results[0]!.user).toBe("appuser");

    expect(results[1]!.port).toBe(3000);
    expect(results[1]!.pid).toBe(1234);

    expect(results[2]!.port).toBe(5432);
    expect(results[2]!.pid).toBe(999);

    expect(results[3]!.port).toBe(8080);
    expect(results[3]!.pid).toBe(5678);
  });

  it("handles empty or malformed ss lines gracefully", async () => {
    const malformedSs = [
      "",
      "State Recv-Q Send-Q Local Address:Port Peer Address:Port",
      "LISTEN 0 128 0.0.0.0:3000",
      'LISTEN 0 128 0.0.0.0:notaport users:(("bad",pid=1))',
      'LISTEN 0 128 0.0.0.0:4000 users:(("no-pid"))',
      'LISTEN 0 511 127.0.0.1:4000 users:(("valid",pid=222,fd=3))',
    ].join("\n");

    const runner: CommandRunner = (cmd) => {
      if (cmd === "lsof") return Promise.reject(new Error("not found"));
      if (cmd === "ss") return Promise.resolve(malformedSs);
      return Promise.resolve("");
    };

    const provider = new LinuxProvider(runner);
    const results = await provider.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.port).toBe(4000);
    expect(results[0]!.pid).toBe(222);
  });

  it("handles ps failure when looking up user and command", async () => {
    const runner: CommandRunner = (cmd) => {
      if (cmd === "lsof") return Promise.reject(new Error("not found"));
      if (cmd === "ss")
        return Promise.resolve(
          `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=123,fd=1))`,
        );
      if (cmd === "ps") return Promise.reject(new Error("ps restricted"));
      return Promise.resolve("");
    };

    const provider = new LinuxProvider(runner);
    const results = await provider.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.user).toBe("");
    expect(results[0]!.command).toBe("node"); // fallback to process name
  });

  it("throws wrapped error if both lsof and ss fail", async () => {
    const brokenRunner: CommandRunner = () =>
      Promise.reject(new Error("subcommand failed"));

    const provider = new LinuxProvider(brokenRunner);
    await expect(provider.list()).rejects.toThrow(
      "inspect listening ports: Error: subcommand failed",
    );
  });
});

describe("LinuxProvider.find", () => {
  const ssOutput = [
    `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=10,fd=1))`,
    `LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("worker",pid=11,fd=2))`,
    `LISTEN 0 511 0.0.0.0:8080 0.0.0.0:* users:(("java",pid=20,fd=3))`,
  ].join("\n");

  const runner: CommandRunner = (cmd) => {
    if (cmd === "lsof") return Promise.reject(new Error("no lsof"));
    if (cmd === "ss") return Promise.resolve(ssOutput);
    return Promise.resolve("");
  };

  it("finds multiple processes on port 3000", async () => {
    const provider = new LinuxProvider(runner);
    const results = await provider.find(3000);
    expect(results).toHaveLength(2);
    expect(results[0]!.pid).toBe(10);
    expect(results[1]!.pid).toBe(11);
  });

  it("returns empty array for unused port", async () => {
    const provider = new LinuxProvider(runner);
    const results = await provider.find(9999);
    expect(results).toEqual([]);
  });

  const ports = [22, 80, 443, 3000, 8080, 5000, 9000];
  for (const p of ports) {
    it(`runs find(${p}) on linux provider`, async () => {
      const provider = new LinuxProvider(runner);
      const res = await provider.find(p);
      expect(Array.isArray(res)).toBe(true);
    });
  }
});
