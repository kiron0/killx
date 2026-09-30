import { describe, expect, it, vi } from "vitest";
import { formatTraceTree } from "../src/process/tree";
import { runTraceCommand } from "../src/commands/trace";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessTreeNode } from "../src/types";

describe("killx trace command", () => {
  describe("formatTraceTree", () => {
    it("formats ancestry chain according to specification", () => {
      const ancestry: ProcessTreeNode[] = [
        {
          pid: 9214,
          ppid: 9191,
          name: "node",
          command: "node server.js",
          cwd: "/Users/test/code/app",
          isListener: true,
        },
        {
          pid: 9191,
          ppid: 9177,
          name: "next",
          command: "next dev",
        },
        {
          pid: 9177,
          ppid: 8120,
          name: "npm",
          command: "npm run dev",
        },
        {
          pid: 8120,
          ppid: 1,
          name: "zsh",
          command: "zsh",
        },
      ];

      const text = formatTraceTree(3000, ancestry);
      expect(text).toContain(":3000");
      expect(text).toContain("PID 9214");
      expect(text).toContain("cwd:");
      expect(text).toContain("PID 9191");
      expect(text).toContain("PID 9177");
      expect(text).toContain("PID 8120");
    });
  });

  describe("runTraceCommand execution", () => {
    it("throws EXIT_NOT_FOUND when port is empty", async () => {
      const printer = new Printer();
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };
      await expect(
        runTraceCommand("3000", provider, printer),
      ).rejects.toThrow();
    });

    it("prints tree and supervisor hint in non-json mode", async () => {
      const lines: string[] = [];
      const printer = new Printer({ writer: (s) => lines.push(s) });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 9214,
              port: 3000,
              process: "node",
              user: "user",
              command: "node server.js",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };

      const mockRunner = vi.fn((cmd: string, args: readonly string[]) => {
        if (cmd === "ps" && args.includes("-axo")) {
          return Promise.resolve(
            [
              "  9177   8120 user     npm        npm run dev",
              "  9191   9177 user     next       next dev",
              "  9214   9191 user     node       node server.js",
            ].join("\n"),
          );
        }
        if (cmd === "lsof") {
          return Promise.resolve("p9214\nfcwd\nn/Users/user/code/app\n");
        }
        return Promise.resolve("");
      });

      await runTraceCommand("3000", provider, printer, mockRunner);

      const text = lines.join("\n");
      expect(text).toContain(":3000");
      expect(text).toContain("PID 9214");
      expect(text).toContain("Supervisor detected: npm (PID 9177)");
      expect(text).toContain("killx 3000 --tree");
    });

    it("outputs complete JSON object in json mode", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        json: true,
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 9214,
              port: 3000,
              process: "node",
              user: "user",
              command: "node server.js",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };

      const mockRunner = vi.fn((cmd: string) => {
        if (cmd === "ps") {
          return Promise.resolve(
            "  9214      1 user     node       node server.js\n",
          );
        }
        return Promise.resolve("");
      });

      await runTraceCommand("3000", provider, printer, mockRunner);

      const parsed = JSON.parse(lines.join("")) as {
        port: number;
        found: boolean;
        listener: { pid: number };
        tree: ProcessTreeNode[];
      };
      expect(parsed.port).toBe(3000);
      expect(parsed.found).toBe(true);
      expect(parsed.listener.pid).toBe(9214);
      expect(Array.isArray(parsed.tree)).toBe(true);
    });
  });
});
