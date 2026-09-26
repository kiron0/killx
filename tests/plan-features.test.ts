import { describe, expect, it, vi } from "vitest";
import { parseCliArgs } from "../src/cli/args";
import { runListCommand } from "../src/commands/list";
import { runKill } from "../src/commands/kill";
import { runCli } from "../src/cli";
import { Printer } from "../src/output";
import {
  CliError,
  EXIT_INVALID_ARGUMENTS,
  EXIT_PERMISSION,
  EXIT_TERMINATION,
} from "../src/errors";
import * as procKill from "../src/process/kill";
import type { PlatformProvider, ProcessInfo } from "../src/types";

class MockProvider implements PlatformProvider {
  constructor(private items: ProcessInfo[] = []) {}

  list(): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items);
  }

  find(port: number): Promise<ProcessInfo[]> {
    return Promise.resolve(this.items.filter((item) => item.port === port));
  }
}

describe("PLAN.md features implementation", () => {
  describe("CLI args parsing for new PLAN.md flags", () => {
    it("parses --no-color flag", () => {
      const parsed = parseCliArgs(["--no-color", "3000"]);
      expect(parsed.flags.noColor).toBe(true);
      expect(parsed.command).toBe("kill");
      expect(parsed.positionals).toEqual(["3000"]);
    });

    it("parses --process flag with space and equal sign", () => {
      const p1 = parseCliArgs(["list", "--process", "node"]);
      expect(p1.command).toBe("list");
      expect(p1.flags.process).toBe("node");

      const p2 = parseCliArgs(["list", "--process=python"]);
      expect(p2.command).toBe("list");
      expect(p2.flags.process).toBe("python");
    });

    it("throws when --process has missing value", () => {
      expect(() => parseCliArgs(["list", "--process"])).toThrow(
        "option '--process' requires a value",
      );
      expect(() => parseCliArgs(["list", "--process="])).toThrow(
        "option '--process' requires a value",
      );
    });

    it("parses --port flag with space and equal sign", () => {
      const p1 = parseCliArgs(["list", "--port", "3000"]);
      expect(p1.command).toBe("list");
      expect(p1.flags.port).toBe(3000);

      const p2 = parseCliArgs(["list", "--port=8080"]);
      expect(p2.command).toBe("list");
      expect(p2.flags.port).toBe(8080);
    });

    it("throws when --port has non-numeric value or missing", () => {
      expect(() => parseCliArgs(["list", "--port"])).toThrow(
        "option '--port' requires a numeric value",
      );
      expect(() => parseCliArgs(["list", "--port", "abc"])).toThrow(
        "option '--port' requires a numeric value",
      );
    });
  });

  describe("Printer no-color support", () => {
    it("strips ANSI color when noColor: true", () => {
      let output = "";
      const printer = new Printer({
        noColor: true,
        writer: (text) => (output += text),
      });
      expect(printer.color).toBe(false);
      printer.success("Test message");
      expect(output).toContain("✓ Test message");
      expect(output).not.toContain("\x1b[32m");
    });
  });

  describe("runListCommand with process and port filtering", () => {
    const sampleProcesses: ProcessInfo[] = [
      {
        pid: 101,
        port: 3000,
        process: "node",
        user: "alice",
        command: "node server.js",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 102,
        port: 5173,
        process: "vite",
        user: "alice",
        command: "vite dev",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 103,
        port: 8080,
        process: "java",
        user: "bob",
        command: "java -jar app.jar",
        protocol: "tcp",
        state: "listen",
      },
    ];

    it("filters processes by --process name", async () => {
      const provider = new MockProvider(sampleProcesses);
      let output = "";
      const printer = new Printer({
        json: true,
        writer: (text) => (output += text),
      });

      await runListCommand({ process: "node" }, provider, printer);

      const res = JSON.parse(output) as ProcessInfo[];
      expect(res).toHaveLength(1);
      expect(res[0]?.process).toBe("node");
      expect(res[0]?.port).toBe(3000);
    });

    it("filters processes by --port", async () => {
      const provider = new MockProvider(sampleProcesses);
      let output = "";
      const printer = new Printer({
        json: true,
        writer: (text) => (output += text),
      });

      await runListCommand({ port: 5173 }, provider, printer);

      const res = JSON.parse(output) as ProcessInfo[];
      expect(res).toHaveLength(1);
      expect(res[0]?.port).toBe(5173);
      expect(res[0]?.process).toBe("vite");
    });

    it("combines range and process filtering", async () => {
      const provider = new MockProvider(sampleProcesses);
      let output = "";
      const printer = new Printer({
        json: true,
        writer: (text) => (output += text),
      });

      await runListCommand(
        { rangeArg: "3000-6000", process: "vite" },
        provider,
        printer,
      );

      const res = JSON.parse(output) as ProcessInfo[];
      expect(res).toHaveLength(1);
      expect(res[0]?.port).toBe(5173);
    });
  });

  describe("Enhanced error messages in runKill", () => {
    it("reports specific process info on single process termination failure", async () => {
      const terminateSpy = vi
        .spyOn(procKill, "terminateProcess")
        .mockRejectedValue(new Error("process is still running"));

      const provider = new MockProvider([
        {
          pid: 18342,
          port: 3000,
          process: "node",
          user: "toufiq",
          command: "node server.js",
          protocol: "tcp",
          state: "listen",
        },
      ]);
      const printer = new Printer({ quiet: true });

      try {
        await runKill({
          ports: [3000],
          yes: true,
          provider,
          printer,
        });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CliError);
        const cliErr = err as CliError;
        expect(cliErr.code).toBe(EXIT_TERMINATION);
        expect(cliErr.message).toContain("✗ node (PID 18342) did not exit");
        expect(cliErr.message).toContain("killx 3000 --force");
        expect(cliErr.causeError).toBe("process is still running");
      } finally {
        terminateSpy.mockRestore();
      }
    });

    it("reports specific process info on single process permission denied", async () => {
      const permErr = Object.assign(new Error("kill EPERM"), { code: "EPERM" });

      const terminateSpy = vi
        .spyOn(procKill, "terminateProcess")
        .mockRejectedValue(permErr);

      const provider = new MockProvider([
        {
          pid: 812,
          port: 80,
          process: "nginx",
          user: "root",
          command: "nginx",
          protocol: "tcp",
          state: "listen",
        },
      ]);
      const printer = new Printer({ quiet: true });

      try {
        await runKill({
          ports: [80],
          yes: true,
          provider,
          printer,
        });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(CliError);
        const cliErr = err as CliError;
        expect(cliErr.code).toBe(EXIT_PERMISSION);
        expect(cliErr.message).toContain(
          "✗ Permission denied while terminating nginx (PID 812)",
        );
        expect(cliErr.message).toContain("sudo killx 80");
        expect(cliErr.causeError).toBe("kill EPERM");
      } finally {
        terminateSpy.mockRestore();
      }
    });
  });

  describe("runCli verbose error output", () => {
    it("outputs error cause in verbose mode", async () => {
      let stderr = "";
      const writeSpy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk: string | Uint8Array) => {
          stderr += String(chunk);
          return true;
        });

      try {
        // Run with an invalid port to trigger error in verbose mode
        const code = await runCli(["--verbose", "invalid-port"]);
        expect(code).toBe(EXIT_INVALID_ARGUMENTS);
        expect(stderr).toContain("✗");
      } finally {
        writeSpy.mockRestore();
      }
    });
  });
});
