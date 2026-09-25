import { describe, expect, it } from "vitest";
import { DarwinProvider } from "../src/platform/darwin";
import type { CommandRunner } from "../src/platform/command";

describe("DarwinProvider.list", () => {
  it("invokes lsof with correct arguments", async () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];

    const mockRunner: CommandRunner = (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "lsof") {
        return Promise.resolve("p100\ncnode\nLuser\nn*:3000 (LISTEN)\n");
      }
      return Promise.resolve("node server.js");
    };

    const provider = new DarwinProvider(mockRunner);
    const results = await provider.list();

    expect(calls[0]!.cmd).toBe("lsof");
    expect(calls[0]!.args).toEqual([
      "-nP",
      "-iTCP",
      "-sTCP:LISTEN",
      "-FpcLntT",
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]!.port).toBe(3000);
    expect(results[0]!.pid).toBe(100);
  });

  it("returns empty array when lsof exits with code 1 (no listening processes)", async () => {
    const mockRunner: CommandRunner = () => {
      const err = new Error("Command failed: lsof");
      (err as { code?: number }).code = 1;
      return Promise.reject(err);
    };

    const provider = new DarwinProvider(mockRunner);
    const results = await provider.list();
    expect(results).toEqual([]);
  });

  it("rethrows error when lsof exits with code > 1", async () => {
    const mockRunner: CommandRunner = () => {
      const err = new Error("Command failed: lsof permission denied");
      (err as { code?: number }).code = 2;
      return Promise.reject(err);
    };

    const provider = new DarwinProvider(mockRunner);
    await expect(provider.list()).rejects.toThrow("permission denied");
  });

  it("rethrows non-object error from runner", async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    const mockRunner: CommandRunner = () => Promise.reject("fatal crash");

    const provider = new DarwinProvider(mockRunner);
    await expect(provider.list()).rejects.toBe("fatal crash");
  });

  it("parses multiple processes and sorts by port and pid", async () => {
    const mockRunner: CommandRunner = (cmd, args) => {
      if (cmd === "lsof") {
        return Promise.resolve(
          [
            "p50",
            "cvite",
            "Ldev",
            "n*:5173 (LISTEN)",
            "p40",
            "cnode",
            "Ldev",
            "n*:3000 (LISTEN)",
            "p30",
            "cpython",
            "Ldev",
            "n*:3000 (LISTEN)",
          ].join("\n"),
        );
      }
      if (cmd === "ps") {
        return Promise.resolve(`cmd-${args[1]}`);
      }
      return Promise.resolve("");
    };

    const provider = new DarwinProvider(mockRunner);
    const results = await provider.list();
    expect(results).toHaveLength(3);
    expect(results[0]!.port).toBe(3000);
    expect(results[0]!.pid).toBe(30);
    expect(results[1]!.port).toBe(3000);
    expect(results[1]!.pid).toBe(40);
    expect(results[2]!.port).toBe(5173);
    expect(results[2]!.pid).toBe(50);
  });
});

describe("DarwinProvider.find", () => {
  const sampleOutput = [
    "p10",
    "cnode",
    "Ldev",
    "n*:3000 (LISTEN)",
    "p20",
    "cnode",
    "Ldev",
    "n*:3000 (LISTEN)",
    "p30",
    "cvite",
    "Ldev",
    "n*:5173 (LISTEN)",
    "p40",
    "cnginx",
    "Lroot",
    "n*:80 (LISTEN)",
  ].join("\n");

  const runner: CommandRunner = (cmd, args) => {
    if (cmd === "lsof") return Promise.resolve(sampleOutput);
    return Promise.resolve(`cmd-${args[1]}`);
  };

  it("finds processes for an existing port", async () => {
    const provider = new DarwinProvider(runner);
    const results = await provider.find(5173);
    expect(results).toHaveLength(1);
    expect(results[0]!.pid).toBe(30);
    expect(results[0]!.process).toBe("vite");
  });

  it("finds multiple processes sharing the same port", async () => {
    const provider = new DarwinProvider(runner);
    const results = await provider.find(3000);
    expect(results).toHaveLength(2);
    expect(results[0]!.pid).toBe(10);
    expect(results[1]!.pid).toBe(20);
  });

  it("returns empty array for non-listening port", async () => {
    const provider = new DarwinProvider(runner);
    const results = await provider.find(9999);
    expect(results).toEqual([]);
  });

  const testPorts = [1, 22, 80, 443, 3000, 5173, 8080, 9000, 65535];
  for (const port of testPorts) {
    it(`runs find(${port}) returning matching processes array`, async () => {
      const provider = new DarwinProvider(runner);
      const res = await provider.find(port);
      expect(Array.isArray(res)).toBe(true);
      for (const item of res) {
        expect(item.port).toBe(port);
      }
    });
  }
});
