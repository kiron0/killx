import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import {
  findProjectRoot,
  isDevProcess,
  processBelongsToProject,
  runDevCommand,
} from "../src/commands/dev";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";
import type { CommandRunner } from "../src/platform/command";

describe("Project-scoped dev server killing", () => {
  describe("findProjectRoot", () => {
    it("finds root folder containing package.json or git repo", () => {
      const root = findProjectRoot(process.cwd());
      expect(root).toBeDefined();
      expect(typeof root).toBe("string");
    });
  });

  describe("isDevProcess", () => {
    it("identifies standard dev process names", () => {
      expect(isDevProcess("node")).toBe(true);
      expect(isDevProcess("vite")).toBe(true);
      expect(isDevProcess("next")).toBe(true);
      expect(isDevProcess("python3")).toBe(true);
      expect(isDevProcess("rails")).toBe(true);
      expect(isDevProcess("cargo")).toBe(true);
      expect(isDevProcess("air")).toBe(true);
    });

    it("identifies dev processes from command line", () => {
      expect(isDevProcess("bash", "npm run dev")).toBe(true);
      expect(isDevProcess("sh", "vite --port 3000")).toBe(true);
      expect(isDevProcess("python", "uvicorn main:app --reload")).toBe(true);
      expect(isDevProcess("other", "custom command")).toBe(false);
    });
  });

  describe("processBelongsToProject", () => {
    const projectRoot = "/Users/test/projects/my-app";

    it("returns true when process cwd is inside projectRoot", async () => {
      const proc: ProcessInfo = {
        pid: 100,
        port: 3000,
        process: "next",
        user: "test",
        command: "next dev",
        protocol: "tcp",
        state: "listen",
      };
      const mockRunner = vi.fn().mockResolvedValue("");
      const result = await processBelongsToProject(
        proc,
        "/Users/test/projects/my-app",
        projectRoot,
        mockRunner,
      );
      expect(result).toBe(true);
    });

    it("returns true when process cwd is a subdirectory of projectRoot", async () => {
      const proc: ProcessInfo = {
        pid: 101,
        port: 3001,
        process: "node",
        user: "test",
        command: "node server.js",
        protocol: "tcp",
        state: "listen",
      };
      const mockRunner = vi.fn().mockResolvedValue("");
      const result = await processBelongsToProject(
        proc,
        "/Users/test/projects/my-app/packages/frontend",
        projectRoot,
        mockRunner,
      );
      expect(result).toBe(true);
    });

    it("returns true when command path mentions project root", async () => {
      const proc: ProcessInfo = {
        pid: 102,
        port: 3002,
        process: "vite",
        user: "test",
        command: "/Users/test/projects/my-app/node_modules/.bin/vite",
        protocol: "tcp",
        state: "listen",
      };
      const mockRunner = vi.fn().mockResolvedValue("");
      const result = await processBelongsToProject(
        proc,
        "",
        projectRoot,
        mockRunner,
      );
      expect(result).toBe(true);
    });

    it("returns false when process belongs to completely different project", async () => {
      const proc: ProcessInfo = {
        pid: 103,
        port: 5173,
        process: "vite",
        user: "test",
        command: "vite ../other-project",
        protocol: "tcp",
        state: "listen",
      };
      const mockRunner: CommandRunner = vi.fn().mockImplementation(() => {
        return Promise.resolve("");
      });
      const result = await processBelongsToProject(
        proc,
        "/Users/test/projects/other-project",
        projectRoot,
        mockRunner,
      );
      expect(result).toBe(false);
    });

    it("returns true when ancestor process belongs to project root", async () => {
      const proc: ProcessInfo = {
        pid: 104,
        port: 3004,
        process: "node",
        user: "test",
        command: "node",
        protocol: "tcp",
        state: "listen",
      };
      const mockRunner: CommandRunner = vi
        .fn()
        .mockImplementation((cmd: string, args: readonly string[]) => {
          if (cmd === "ps") {
            return Promise.resolve(
              [
                "   500      1 test     npm        npm run dev",
                "   104    500 test     node       node",
              ].join("\n"),
            );
          }
          if (cmd === "lsof" && args.includes("500")) {
            return Promise.resolve("p500\nfcwd\nn" + projectRoot + "\n");
          }
          return Promise.resolve("");
        });

      const result = await processBelongsToProject(
        proc,
        "",
        projectRoot,
        mockRunner,
      );
      expect(result).toBe(true);
    });
  });

  describe("runDevCommand with project scoping", () => {
    it("partitions matches into Found and Ignored, and kills only Found", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () =>
          Promise.resolve([
            {
              pid: 1000,
              port: 3000,
              process: "next",
              user: "test",
              command: "next dev",
              protocol: "tcp",
              state: "listen",
            },
            {
              pid: 2000,
              port: 5173,
              process: "vite",
              user: "test",
              command: "vite",
              protocol: "tcp",
              state: "listen",
            },
          ]),
        find: (p) => {
          if (p === 3000) {
            return Promise.resolve([
              {
                pid: 1000,
                port: 3000,
                process: "next",
                user: "test",
                command: "next dev",
                protocol: "tcp",
                state: "listen",
              },
            ]);
          }
          return Promise.resolve([]);
        },
      };

      const mockRunner: CommandRunner = vi
        .fn()
        .mockImplementation((cmd: string, args: readonly string[]) => {
          if (cmd === "lsof" && args.includes("1000")) {
            return Promise.resolve("p1000\nfcwd\nn" + resolve(".") + "\n");
          }
          if (cmd === "lsof" && args.includes("2000")) {
            return Promise.resolve("p2000\nfcwd\nn/Users/test/other-project\n");
          }
          return Promise.resolve("");
        });

      let killed = false;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid, sig) => {
          if (sig === 0 && killed) {
            throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
          }
          if (sig !== 0) {
            killed = true;
          }
          return true;
        });

      await runDevCommand({
        cwd: ".",
        yes: true,
        provider,
        printer,
        runner: mockRunner,
      });

      killSpy.mockRestore();

      const output = lines.join("\n");
      expect(output).toContain("Found:");
      expect(output).toContain(":3000");
      expect(output).toContain("Ignored:");
      expect(output).toContain(":5173");
      expect(output).toContain("Killed next (PID 1000) on :3000");
    });
  });
});
