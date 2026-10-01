import { describe, expect, it, vi } from "vitest";
import {
  formatTreePreview,
  getAllDescendantPids,
  getSupervisorRoot,
  isShellOrRoot,
  terminateProcessTree,
  type ProcessRawInfo,
} from "../src/process/tree";
import { runKill } from "../src/commands/kill";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessTreeNode } from "../src/types";
import type { CommandRunner } from "../src/platform/command";

describe("Process tree inspection and killing", () => {
  describe("isShellOrRoot", () => {
    it("recognizes interactive shells", () => {
      expect(isShellOrRoot("zsh")).toBe(true);
      expect(isShellOrRoot("bash")).toBe(true);
      expect(isShellOrRoot("/bin/sh")).toBe(true);
      expect(isShellOrRoot("fish")).toBe(true);
    });

    it("recognizes system roots and terminals", () => {
      expect(isShellOrRoot("launchd")).toBe(true);
      expect(isShellOrRoot("systemd")).toBe(true);
      expect(isShellOrRoot("iterm2")).toBe(true);
    });

    it("does not classify dev supervisors or node as shell", () => {
      expect(isShellOrRoot("node")).toBe(false);
      expect(isShellOrRoot("npm")).toBe(false);
      expect(isShellOrRoot("vite")).toBe(false);
      expect(isShellOrRoot("next")).toBe(false);
      expect(isShellOrRoot("python3")).toBe(false);
    });
  });

  describe("getSupervisorRoot", () => {
    it("finds top-most non-shell supervisor in chain", () => {
      const ancestry: ProcessTreeNode[] = [
        {
          pid: 1264,
          ppid: 1251,
          name: "node",
          command: "node server.js",
          isListener: true,
        },
        { pid: 1251, ppid: 1240, name: "next", command: "next dev" },
        { pid: 1240, ppid: 1100, name: "npm", command: "npm run dev" },
        { pid: 1100, ppid: 1, name: "zsh", command: "-zsh" },
      ];

      const supervisor = getSupervisorRoot(ancestry);
      expect(supervisor).not.toBeNull();
      expect(supervisor?.pid).toBe(1240);
      expect(supervisor?.name).toBe("npm");
    });

    it("identifies listener itself as supervisor if run directly from shell", () => {
      const ancestry: ProcessTreeNode[] = [
        {
          pid: 5000,
          ppid: 1100,
          name: "node",
          command: "node index.js",
          isListener: true,
        },
        { pid: 1100, ppid: 1, name: "bash", command: "/bin/bash" },
      ];

      const supervisor = getSupervisorRoot(ancestry);
      expect(supervisor?.pid).toBe(5000);
      expect(supervisor?.name).toBe("node");
    });
  });

  describe("getAllDescendantPids", () => {
    it("recursively gathers all descendant processes", () => {
      const map = new Map<number, ProcessRawInfo>([
        [100, { pid: 100, ppid: 1, name: "npm", command: "npm" }],
        [101, { pid: 101, ppid: 100, name: "sh", command: "sh" }],
        [102, { pid: 102, ppid: 101, name: "node", command: "node" }],
        [103, { pid: 103, ppid: 100, name: "tsc", command: "tsc" }],
        [200, { pid: 200, ppid: 1, name: "other", command: "other" }],
      ]);

      const descendants = getAllDescendantPids(100, map);
      expect(descendants.sort()).toEqual([101, 102, 103]);
    });
  });

  describe("formatTreePreview", () => {
    it("formats tree preview matching spec layout", () => {
      const ancestry: ProcessTreeNode[] = [
        {
          pid: 1264,
          ppid: 1251,
          name: "node",
          command: "node",
          isListener: true,
        },
        { pid: 1251, ppid: 1240, name: "next", command: "next" },
        { pid: 1240, ppid: 1100, name: "npm", command: "npm" },
        { pid: 1100, ppid: 1, name: "zsh", command: "zsh" },
      ];

      const preview = formatTreePreview(ancestry, 1264);
      expect(preview).toContain("npm        1240");
      expect(preview).toContain("└─ next    1251");
      expect(preview).toContain("   └─ node 1264  ← listener");
    });
  });

  describe("terminateProcessTree", () => {
    it("refuses to terminate protected PID 1 or self", async () => {
      await expect(terminateProcessTree(1)).rejects.toThrow(
        "refusing to terminate protected PID",
      );
      await expect(terminateProcessTree(process.pid)).rejects.toThrow(
        "refusing to terminate protected PID",
      );
    });

    it("terminates tree on win32 via taskkill /T", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      try {
        const mockRunner: CommandRunner = vi.fn().mockResolvedValue("");
        const killSpy = vi
          .spyOn(process, "kill")
          .mockImplementation((_pid, sig) => {
            if (sig === 0)
              throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
            return true;
          });

        const sig = await terminateProcessTree(
          9876,
          { force: true },
          mockRunner,
        );
        expect(mockRunner).toHaveBeenCalledWith("taskkill", [
          "/PID",
          "9876",
          "/T",
          "/F",
        ]);
        expect(sig).toBe("SIGKILL");
        killSpy.mockRestore();
      } finally {
        Object.defineProperty(process, "platform", {
          value: originalPlatform,
          configurable: true,
        });
      }
    });
  });

  describe("runKill with --tree option", () => {
    it("renders tree preview and kills root supervisor when tree=true", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 1264,
              port: 3000,
              process: "node",
              user: "kiron",
              command: "node server.js",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };

      const mockRunner: CommandRunner = vi
        .fn()
        .mockImplementation((cmd: string, args: readonly string[]) => {
          if (cmd === "ps" && args.includes("-axo")) {
            return Promise.resolve(
              [
                "  1240      1 kiron    npm        npm run dev",
                "  1251   1240 kiron    next       next dev",
                "  1264   1251 kiron    node       node server.js",
              ].join("\n"),
            );
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

      await runKill({
        ports: [3000],
        tree: true,
        yes: true,
        provider,
        printer,
        runner: mockRunner,
      });

      killSpy.mockRestore();

      const text = lines.join("\n");
      expect(text).toContain(
        "Killed process tree for :3000 (root npm PID 1240)",
      );
    });

    it("traverses through intermediate sh subshell to discover npm supervisor", async () => {
      const { getProcessAncestry } = await import("../src/process/tree");
      const mockRunner: CommandRunner = vi
        .fn()
        .mockImplementation((cmd: string) => {
          if (cmd === "ps") {
            return Promise.resolve(
              [
                "   800      1 kiron    iterm2     /Applications/iTerm.app",
                "  1100    800 kiron    zsh        -zsh",
                "  1240   1100 kiron    npm        npm run dev",
                "  1245   1240 kiron    sh         sh -c next dev",
                "  1251   1245 kiron    next       next dev",
                "  1264   1251 kiron    node       node server.js",
              ].join("\n"),
            );
          }
          return Promise.resolve("");
        });

      const ancestry = await getProcessAncestry(1264, mockRunner);
      const supervisor = getSupervisorRoot(ancestry);

      expect(supervisor).not.toBeNull();
      expect(supervisor?.name).toBe("npm");
      expect(supervisor?.pid).toBe(1240);
      expect(ancestry.map((n) => n.name)).toEqual([
        "node",
        "next",
        "sh",
        "npm",
        "zsh",
      ]);
    });

    it("deduplicates supervisor tree termination across multiple ports", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: (p) => {
          if (p === 3000) {
            return Promise.resolve([
              {
                pid: 1264,
                port: 3000,
                process: "node",
                user: "kiron",
                command: "node server.js",
                protocol: "tcp",
                state: "listen",
              },
            ]);
          }
          if (p === 3001) {
            return Promise.resolve([
              {
                pid: 1265,
                port: 3001,
                process: "node",
                user: "kiron",
                command: "node worker.js",
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
        .mockImplementation((cmd: string) => {
          if (cmd === "ps") {
            return Promise.resolve(
              [
                "  1240      1 kiron    npm        npm run dev",
                "  1251   1240 kiron    next       next dev",
                "  1264   1251 kiron    node       node server.js",
                "  1265   1251 kiron    node       node worker.js",
              ].join("\n"),
            );
          }
          return Promise.resolve("");
        });

      let killCount = 0;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((pid, sig) => {
          if (sig === 0 && killCount > 0) {
            throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
          }
          if (sig !== 0) {
            killCount++;
          }
          return true;
        });

      await runKill({
        ports: [3000, 3001],
        tree: true,
        yes: true,
        provider,
        printer,
        runner: mockRunner,
      });

      killSpy.mockRestore();

      const text = lines.join("\n");
      expect(text).toContain(
        "Killed process tree for :3000 (root npm PID 1240)",
      );
      expect(text).toContain("Killed 2 processes");
    });
  });
});
