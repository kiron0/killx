import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  runRunCommand,
  waitForPortsFree,
  type SpawnRunner,
} from "../src/commands/run";
import { Printer } from "../src/output";
import type { PlatformProvider } from "../src/types";

describe("killx run workflow", () => {
  describe("waitForPortsFree", () => {
    it("returns true immediately if ports are already free", async () => {
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };
      const res = await waitForPortsFree([3000, 3001], provider, 500);
      expect(res).toBe(true);
    });

    it("returns false if port stays occupied until timeout", async () => {
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 111,
              port: 3000,
              process: "node",
              user: "user",
              command: "node",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };
      const res = await waitForPortsFree([3000], provider, 200);
      expect(res).toBe(false);
    });
  });

  describe("runRunCommand execution", () => {
    it("validates missing ports or commands", async () => {
      const printer = new Printer();
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };

      await expect(
        runRunCommand({
          ports: [],
          command: ["npm", "test"],
          provider,
          printer,
        }),
      ).rejects.toThrow("run requires at least one port");

      await expect(
        runRunCommand({ ports: [3000], command: [], provider, printer }),
      ).rejects.toThrow("run requires a command to execute");
    });

    it("spawns command when port is already free and returns exit code", async () => {
      const lines: string[] = [];
      const printer = new Printer({ writer: (s) => lines.push(s) });
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };

      const mockChild = Object.assign(new EventEmitter(), {
        kill: vi.fn(),
      });

      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("exit", 0), 10);
        return mockChild;
      });

      const code = await runRunCommand({
        ports: [3000],
        command: ["npm", "run", "dev"],
        provider,
        printer,
        spawnRunner: mockSpawn as SpawnRunner,
      });

      expect(code).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith("npm", ["run", "dev"], {
        stdio: "inherit",
        shell: true,
      });
      const output = lines.join("\n");
      expect(output).toContain("Port :3000 free. Running: npm run dev");
    });

    it("kills existing listener before executing command if port is occupied", async () => {
      const lines: string[] = [];
      const printer = new Printer({ writer: (s) => lines.push(s) });

      let portOccupied = true;
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: (p) => {
          if (p === 3000 && portOccupied) {
            return Promise.resolve([
              {
                pid: 5555,
                port: 3000,
                process: "node",
                user: "user",
                command: "node server.js",
                protocol: "tcp",
                state: "listen",
              },
            ]);
          }
          return Promise.resolve([]);
        },
      };

      let killed = false;
      const killSpy = vi
        .spyOn(process, "kill")
        .mockImplementation((_pid, sig) => {
          if (sig === 0 && killed) {
            throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
          }
          if (sig !== 0) {
            killed = true;
            portOccupied = false;
          }
          return true;
        });

      const mockChild = Object.assign(new EventEmitter(), { kill: vi.fn() });
      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("exit", 42), 10);
        return mockChild;
      });

      const code = await runRunCommand({
        ports: [3000],
        command: ["next", "dev"],
        provider,
        printer,
        spawnRunner: mockSpawn as SpawnRunner,
      });

      killSpy.mockRestore();

      expect(code).toBe(42);
      const output = lines.join("\n");
      expect(output).toContain("Port :3000 occupied. Freeing listener(s)...");
      expect(output).toContain("Running: next dev");
    });

    it("returns 130 when child process exits with SIGINT", async () => {
      const printer = new Printer();
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };

      const mockChild = Object.assign(new EventEmitter(), { kill: vi.fn() });
      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("exit", null, "SIGINT"), 10);
        return mockChild;
      });

      const code = await runRunCommand({
        ports: [3000],
        command: ["npm", "run", "dev"],
        provider,
        printer,
        spawnRunner: mockSpawn as SpawnRunner,
      });

      expect(code).toBe(130);
    });

    it("returns 143 when child process exits with SIGTERM", async () => {
      const printer = new Printer();
      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () => Promise.resolve([]),
      };

      const mockChild = Object.assign(new EventEmitter(), { kill: vi.fn() });
      const mockSpawn = vi.fn().mockImplementation(() => {
        setTimeout(() => mockChild.emit("exit", null, "SIGTERM"), 10);
        return mockChild;
      });

      const code = await runRunCommand({
        ports: [3000],
        command: ["npm", "run", "dev"],
        provider,
        printer,
        spawnRunner: mockSpawn as SpawnRunner,
      });

      expect(code).toBe(143);
    });
  });
});
