import { describe, expect, it } from "vitest";
import {
  enrichCommandLine,
  parseLsof,
  parseLsofWithCommand,
  portFromAddress,
} from "../src/platform/lsof";
import type { CommandRunner } from "../src/platform/command";

describe("portFromAddress", () => {
  const addressCases: Array<[string, number]> = [
    ["*:3000", 3000],
    ["*:80", 80],
    ["*:443", 443],
    ["127.0.0.1:5173", 5173],
    ["127.0.0.1:8080", 8080],
    ["0.0.0.0:3306", 3306],
    ["[::1]:5432", 5432],
    ["[::]:27017", 27017],
    ["*:3000 (LISTEN)", 3000],
    ["127.0.0.1:8000 (LISTEN)", 8000],
    ["192.168.1.50:9000 (LISTEN)", 9000],
    ["[::1]:6379 (LISTEN)", 6379],
    ["localhost:8080", 8080],
    ["localhost", 0],
    ["no-port-here", 0],
    ["", 0],
    [":", 0],
    ["127.0.0.1:", 0],
    ["*:abc", 0],
    ["*:3000.5", 0],
    ["*:-80", -80],
    ["*:0", 0],
    ["*:65535", 65535],
    ["*:65536", 65536],
  ];

  for (const [addr, expected] of addressCases) {
    it(`extracts port ${expected} from address "${addr}"`, () => {
      expect(portFromAddress(addr)).toBe(expected);
    });
  }
});

describe("parseLsof", () => {
  it("returns empty array for empty lsof output", () => {
    expect(parseLsof("")).toEqual([]);
  });

  it("returns empty array for whitespace-only output", () => {
    expect(parseLsof("   \n\n\t  \n")).toEqual([]);
  });

  it("parses single process with single port", () => {
    const raw = [
      "p1234",
      "cnode",
      "Ljohn",
      "n*:3000 (LISTEN)",
      "TST=LISTEN",
    ].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed).toEqual([
      {
        pid: 1234,
        port: 3000,
        process: "node",
        user: "john",
        protocol: "tcp",
        state: "listen",
      },
    ]);
  });

  it("parses single process with multiple ports", () => {
    const raw = [
      "p500",
      "cnode",
      "Lalice",
      "n*:3000 (LISTEN)",
      "n*:3001 (LISTEN)",
      "n*:3002 (LISTEN)",
    ].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ pid: 500, port: 3000, process: "node" });
    expect(parsed[1]).toMatchObject({ pid: 500, port: 3001, process: "node" });
    expect(parsed[2]).toMatchObject({ pid: 500, port: 3002, process: "node" });
  });

  it("parses multiple processes on different ports", () => {
    const raw = [
      "p100",
      "cvite",
      "Ldev",
      "n*:5173 (LISTEN)",
      "p200",
      "cpython",
      "Ldev",
      "n*:8000 (LISTEN)",
    ].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.process).toBe("vite");
    expect(parsed[0]!.port).toBe(5173);
    expect(parsed[1]!.process).toBe("python");
    expect(parsed[1]!.port).toBe(8000);
  });

  it("parses multiple processes listening on the same port", () => {
    const raw = [
      "p10",
      "cnginx",
      "Lroot",
      "n*:80 (LISTEN)",
      "p11",
      "cnginx",
      "Lwww-data",
      "n*:80 (LISTEN)",
    ].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.pid).toBe(10);
    expect(parsed[1]!.pid).toBe(11);
  });

  it("defaults missing process name to 'unknown'", () => {
    const raw = ["p999", "Lnobody", "n*:4000 (LISTEN)"].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed[0]!.process).toBe("unknown");
  });

  it("defaults missing user to empty string", () => {
    const raw = ["p888", "cnode", "n*:4001 (LISTEN)"].join("\n");
    const parsed = parseLsof(raw);
    expect(parsed[0]!.user).toBe("");
  });

  it("parses custom state from T tag", () => {
    const raw = ["p777", "cnode", "n*:4002 (LISTEN)", "TST=ESTABLISHED"].join(
      "\n",
    );
    const parsed = parseLsof(raw);
    expect(parsed[0]!.state).toBe("established");
  });

  it("deduplicates identical pid:port records", () => {
    const raw = ["p123", "capp", "n*:3000 (LISTEN)", "n*:3000 (LISTEN)"].join(
      "\n",
    );
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(1);
  });

  it("ignores unknown tags gracefully", () => {
    const raw = ["p456", "capp", "Xunknown", "Yother", "n*:9090 (LISTEN)"].join(
      "\n",
    );
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.port).toBe(9090);
  });
});

describe("enrichCommandLine", () => {
  it("returns trimmed output from ps command", async () => {
    const mockRunner: CommandRunner = async (_cmd, args) => {
      expect(args).toEqual(["-p", "123", "-o", "command="]);
      return "  node server.js --port 3000 \n";
    };
    const cmd = await enrichCommandLine(mockRunner, 123, "node");
    expect(cmd).toBe("node server.js --port 3000");
  });

  it("returns fallback if ps returns empty string", async () => {
    const mockRunner: CommandRunner = async () => "   \n";
    const cmd = await enrichCommandLine(mockRunner, 456, "default-fallback");
    expect(cmd).toBe("default-fallback");
  });

  it("returns fallback if ps command fails", async () => {
    const mockRunner: CommandRunner = async () => {
      throw new Error("process died");
    };
    const cmd = await enrichCommandLine(mockRunner, 789, "node");
    expect(cmd).toBe("node");
  });
});

describe("parseLsofWithCommand", () => {
  it("enriches and sorts processes by port then pid", async () => {
    const raw = [
      "p20",
      "cjava",
      "n*:8080 (LISTEN)",
      "p10",
      "cnode",
      "n*:3000 (LISTEN)",
      "p15",
      "cpython",
      "n*:3000 (LISTEN)",
    ].join("\n");

    const mockRunner: CommandRunner = async (_cmd, args) => {
      const pid = args[1];
      return `full-command-for-${pid}`;
    };

    const results = await parseLsofWithCommand(raw, mockRunner);
    expect(results).toHaveLength(3);
    // Port 3000 comes before 8080
    expect(results[0]!.port).toBe(3000);
    expect(results[0]!.pid).toBe(10);
    expect(results[0]!.command).toBe("full-command-for-10");

    expect(results[1]!.port).toBe(3000);
    expect(results[1]!.pid).toBe(15);
    expect(results[1]!.command).toBe("full-command-for-15");

    expect(results[2]!.port).toBe(8080);
    expect(results[2]!.pid).toBe(20);
    expect(results[2]!.command).toBe("full-command-for-20");
  });

  it("returns empty array when output has no listening ports", async () => {
    const mockRunner: CommandRunner = async () => "";
    const results = await parseLsofWithCommand("", mockRunner);
    expect(results).toEqual([]);
  });
});
