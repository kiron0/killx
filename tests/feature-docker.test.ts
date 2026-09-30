import { describe, expect, it, vi } from "vitest";
import {
  findDockerContainerForPort,
  isDockerProcess,
  matchPublishedPort,
  stopDockerContainer,
} from "../src/platform/docker";
import { detectSpecialSource, runInfoCommand } from "../src/commands/inspect";
import { runKill } from "../src/commands/kill";
import { Printer } from "../src/output";
import type { PlatformProvider, ProcessInfo } from "../src/types";

describe("Docker-aware port killing and inspection", () => {
  describe("matchPublishedPort", () => {
    it("matches standard IPv4 port mapping", () => {
      expect(matchPublishedPort("0.0.0.0:5432->5432/tcp", 5432)).toBe(true);
      expect(matchPublishedPort("0.0.0.0:5432->5432/tcp", 5433)).toBe(false);
    });

    it("matches IPv6 port mapping", () => {
      expect(matchPublishedPort(":::5432->5432/tcp", 5432)).toBe(true);
      expect(matchPublishedPort(":::8080->80/tcp", 8080)).toBe(true);
    });

    it("matches multi-port mappings", () => {
      const mapping =
        "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp, 127.0.0.1:3306->3306/tcp";
      expect(matchPublishedPort(mapping, 5432)).toBe(true);
      expect(matchPublishedPort(mapping, 3306)).toBe(true);
      expect(matchPublishedPort(mapping, 6379)).toBe(false);
    });

    it("matches port ranges", () => {
      expect(matchPublishedPort("0.0.0.0:8000-8005->8000-8005/tcp", 8003)).toBe(
        true,
      );
      expect(matchPublishedPort("0.0.0.0:8000-8005->8000-8005/tcp", 8006)).toBe(
        false,
      );
    });

    it("ignores unexposed internal container ports", () => {
      expect(matchPublishedPort("5432/tcp", 5432)).toBe(false);
    });
  });

  describe("isDockerProcess", () => {
    it("identifies docker processes", () => {
      expect(isDockerProcess("com.docker.backend", "")).toBe(true);
      expect(isDockerProcess("docker-proxy", "")).toBe(true);
      expect(isDockerProcess("vpnkit", "")).toBe(true);
      expect(isDockerProcess("node", "docker-proxy -proto tcp")).toBe(true);
      expect(isDockerProcess("node", "node server.js")).toBe(false);
    });
  });

  describe("findDockerContainerForPort", () => {
    it("parses json format from docker ps", async () => {
      const mockRunner = vi.fn().mockResolvedValue(
        JSON.stringify({
          ID: "abc12345",
          Names: "postgres-dev",
          Image: "postgres:17",
          Ports: "0.0.0.0:5432->5432/tcp, :::5432->5432/tcp",
        }) + "\n",
      );

      const info = await findDockerContainerForPort(5432, mockRunner);
      expect(info).not.toBeNull();
      expect(info?.name).toBe("postgres-dev");
      expect(info?.image).toBe("postgres:17");
      expect(info?.publishedPort).toBe(5432);
    });

    it("parses tab-separated fallback format from docker ps", async () => {
      const mockRunner = vi
        .fn()
        .mockRejectedValueOnce(new Error("json not supported"))
        .mockResolvedValueOnce(
          "c1\tredis-cache\tredis:7\t0.0.0.0:6379->6379/tcp\n",
        );

      const info = await findDockerContainerForPort(6379, mockRunner);
      expect(info).not.toBeNull();
      expect(info?.name).toBe("redis-cache");
      expect(info?.image).toBe("redis:7");
    });

    it("returns null when no container matches port", async () => {
      const mockRunner = vi.fn().mockResolvedValue(
        JSON.stringify({
          ID: "abc12345",
          Names: "postgres-dev",
          Image: "postgres:17",
          Ports: "0.0.0.0:5432->5432/tcp",
        }) + "\n",
      );

      const info = await findDockerContainerForPort(3000, mockRunner);
      expect(info).toBeNull();
    });

    it("returns null when docker is not installed or daemon is down", async () => {
      const mockRunner = vi
        .fn()
        .mockRejectedValue(new Error("docker: command not found"));
      const info = await findDockerContainerForPort(5432, mockRunner);
      expect(info).toBeNull();
    });
  });

  describe("stopDockerContainer", () => {
    it("calls docker stop by default", async () => {
      const mockRunner = vi.fn().mockResolvedValue("");
      await stopDockerContainer("my-container", false, mockRunner);
      expect(mockRunner).toHaveBeenCalledWith("docker", [
        "stop",
        "my-container",
      ]);
    });

    it("calls docker kill with force=true", async () => {
      const mockRunner = vi.fn().mockResolvedValue("");
      await stopDockerContainer("my-container", true, mockRunner);
      expect(mockRunner).toHaveBeenCalledWith("docker", [
        "kill",
        "my-container",
      ]);
    });
  });

  describe("source detection and info command", () => {
    it("detects Docker source in detectSpecialSource", () => {
      const proc: ProcessInfo = {
        pid: 1234,
        port: 5432,
        process: "com.docker.backend",
        user: "root",
        command: "com.docker.backend",
        protocol: "tcp",
        state: "listen",
      };
      const dockerInfo = {
        containerId: "c1",
        name: "postgres-dev",
        image: "postgres:17",
        ports: "0.0.0.0:5432->5432/tcp",
        publishedPort: 5432,
      };

      const res = detectSpecialSource(proc, dockerInfo);
      expect(res.source).toBe("Docker");
      expect(res.details?.Container).toBe("postgres-dev");
      expect(res.details?.Image).toBe("postgres:17");
    });

    it("detects kubectl port-forward", () => {
      const proc: ProcessInfo = {
        pid: 5678,
        port: 8080,
        process: "kubectl",
        user: "user",
        command: "kubectl port-forward pod/my-pod 8080:80",
        protocol: "tcp",
        state: "listen",
      };
      const res = detectSpecialSource(proc, null);
      expect(res.source).toBe("kubectl port-forward");
    });

    it("detects SSH tunnel", () => {
      const proc: ProcessInfo = {
        pid: 7890,
        port: 3306,
        process: "ssh",
        user: "user",
        command: "ssh -L 3306:localhost:3306 remote-server",
        protocol: "tcp",
        state: "listen",
      };
      const res = detectSpecialSource(proc, null);
      expect(res.source).toBe("ssh -L");
    });

    it("formats table with Docker source in runInfoCommand", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 999,
              port: 5432,
              process: "com.docker.backend",
              user: "user",
              command: "com.docker.backend",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };

      const mockRunner = vi.fn().mockResolvedValue(
        JSON.stringify({
          ID: "abc12345",
          Names: "postgres-dev",
          Image: "postgres:17",
          Ports: "0.0.0.0:5432->5432/tcp",
        }) + "\n",
      );

      await runInfoCommand("5432", provider, printer, mockRunner);
      const text = lines.join("\n");
      expect(text).toContain("Source");
      expect(text).toContain("Docker");
      expect(text).toContain("Container");
      expect(text).toContain("postgres-dev");
      expect(text).toContain("Image");
      expect(text).toContain("postgres:17");
    });
  });

  describe("runKill with Docker container", () => {
    it("stops Docker container instead of killing host docker process", async () => {
      const lines: string[] = [];
      const printer = new Printer({
        writer: (s) => lines.push(s),
      });

      const provider: PlatformProvider = {
        list: () => Promise.resolve([]),
        find: () =>
          Promise.resolve([
            {
              pid: 999,
              port: 5432,
              process: "com.docker.backend",
              user: "root",
              command: "com.docker.backend",
              protocol: "tcp",
              state: "listen",
            },
          ]),
      };

      const mockRunner = vi.fn((cmd: string, args: readonly string[]) => {
        if (cmd === "docker" && args[0] === "ps") {
          return Promise.resolve(
            JSON.stringify({
              ID: "c1",
              Names: "postgres-dev",
              Image: "postgres:17",
              Ports: "0.0.0.0:5432->5432/tcp",
            }),
          );
        }
        if (cmd === "docker" && args[0] === "stop") {
          return Promise.resolve("");
        }
        return Promise.resolve("");
      });

      await runKill({
        ports: [5432],
        yes: true,
        provider,
        printer,
        runner: mockRunner,
      });

      expect(mockRunner).toHaveBeenCalledWith("docker", [
        "stop",
        "postgres-dev",
      ]);
      const text = lines.join("\n");
      expect(text).toContain(
        'Stopped Docker container "postgres-dev" on :5432',
      );
    });
  });
});
