import { describe, expect, it } from "vitest";
import { WindowsProvider } from "../src/platform/windows";
import type { CommandRunner } from "../src/platform/command";

describe("WindowsProvider.list", () => {
  const sampleNetstat = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234",
    "  TCP    127.0.0.1:8080         0.0.0.0:0              LISTENING       5678",
    "  TCP    [::]:5173              [::]:0                 LISTENING       9012",
    "  TCP    192.168.1.10:49152     142.250.190.46:443     ESTABLISHED     1234",
    "  UDP    0.0.0.0:5353           *:*                                    555",
  ].join("\n");

  const runner: CommandRunner = (cmd, args) => {
    if (cmd === "netstat") return Promise.resolve(sampleNetstat);
    if (cmd === "powershell") {
      const script = args[2] ?? "";
      if (script.includes("1234")) {
        return Promise.resolve("node.exe\nnode server.js\n");
      }
      if (script.includes("5678")) {
        return Promise.resolve("java.exe\njava -jar app.jar\n");
      }
      if (script.includes("9012")) {
        return Promise.resolve("vite.exe\nvite\n");
      }
      return Promise.resolve("");
    }
    return Promise.resolve("");
  };

  it("filters LISTENING tcp ports and parses netstat correctly", async () => {
    const provider = new WindowsProvider(runner);
    const results = await provider.list();
    expect(results).toHaveLength(3);

    // Sorted by port: 3000, 5173, 8080
    expect(results[0]!.port).toBe(3000);
    expect(results[0]!.pid).toBe(1234);
    expect(results[0]!.process).toBe("node");
    expect(results[0]!.command).toBe("node server.js");

    expect(results[1]!.port).toBe(5173);
    expect(results[1]!.pid).toBe(9012);
    expect(results[1]!.process).toBe("vite");
    expect(results[1]!.command).toBe("vite");

    expect(results[2]!.port).toBe(8080);
    expect(results[2]!.pid).toBe(5678);
    expect(results[2]!.process).toBe("java");
    expect(results[2]!.command).toBe("java -jar app.jar");
  });

  it("strips .exe extension from process name", async () => {
    const mockNetstat = "  TCP    0.0.0.0:4000  0.0.0.0:0  LISTENING  4444\n";
    const customRunner: CommandRunner = (cmd) => {
      if (cmd === "netstat") return Promise.resolve(mockNetstat);
      if (cmd === "powershell")
        return Promise.resolve("python.exe\npython main.py");
      return Promise.resolve("");
    };
    const provider = new WindowsProvider(customRunner);
    const results = await provider.list();
    expect(results[0]!.process).toBe("python");
  });

  it("keeps process name intact if not ending with .exe", async () => {
    const mockNetstat = "  TCP    0.0.0.0:4000  0.0.0.0:0  LISTENING  4444\n";
    const customRunner: CommandRunner = (cmd) => {
      if (cmd === "netstat") return Promise.resolve(mockNetstat);
      if (cmd === "powershell")
        return Promise.resolve("custom_daemon\ncustom_daemon --arg");
      return Promise.resolve("");
    };
    const provider = new WindowsProvider(customRunner);
    const results = await provider.list();
    expect(results[0]!.process).toBe("custom_daemon");
  });

  it("handles powershell metadata failure gracefully", async () => {
    const mockNetstat = "  TCP    0.0.0.0:4000  0.0.0.0:0  LISTENING  4444\n";
    const brokenRunner: CommandRunner = (cmd) => {
      if (cmd === "netstat") return Promise.resolve(mockNetstat);
      if (cmd === "powershell")
        return Promise.reject(new Error("powershell execution disabled"));
      return Promise.resolve("");
    };
    const provider = new WindowsProvider(brokenRunner);
    const results = await provider.list();
    expect(results).toHaveLength(1);
    expect(results[0]!.process).toBe("unknown");
    expect(results[0]!.command).toBe("");
  });

  it("deduplicates identical pid and port pairs", async () => {
    const duplicateNetstat = [
      "  TCP    0.0.0.0:3000  0.0.0.0:0  LISTENING  100",
      "  TCP    127.0.0.1:3000  0.0.0.0:0  LISTENING  100",
    ].join("\n");
    const customRunner: CommandRunner = (cmd) => {
      if (cmd === "netstat") return Promise.resolve(duplicateNetstat);
      return Promise.resolve("node\n");
    };
    const provider = new WindowsProvider(customRunner);
    const results = await provider.list();
    expect(results).toHaveLength(1);
  });

  it("throws wrapped error if netstat fails", async () => {
    const failingRunner: CommandRunner = () =>
      Promise.reject(new Error("netstat not recognized"));
    const provider = new WindowsProvider(failingRunner);
    await expect(provider.list()).rejects.toThrow(
      "inspect listening ports: Error: netstat not recognized",
    );
  });
});

describe("WindowsProvider.find", () => {
  const netstatData = [
    "  TCP    0.0.0.0:3000  0.0.0.0:0  LISTENING  101",
    "  TCP    0.0.0.0:3000  0.0.0.0:0  LISTENING  102",
    "  TCP    0.0.0.0:8000  0.0.0.0:0  LISTENING  201",
  ].join("\n");

  const runner: CommandRunner = (cmd) => {
    if (cmd === "netstat") return Promise.resolve(netstatData);
    return Promise.resolve("app.exe\napp");
  };

  it("finds multiple processes on the same port", async () => {
    const provider = new WindowsProvider(runner);
    const results = await provider.find(3000);
    expect(results).toHaveLength(2);
    expect(results[0]!.pid).toBe(101);
    expect(results[1]!.pid).toBe(102);
  });

  it("returns empty array for port without listeners", async () => {
    const provider = new WindowsProvider(runner);
    const results = await provider.find(9999);
    expect(results).toEqual([]);
  });

  const ports = [80, 443, 3000, 5000, 8000, 8080, 9000];
  for (const p of ports) {
    it(`runs find(${p}) on windows provider`, async () => {
      const provider = new WindowsProvider(runner);
      const res = await provider.find(p);
      expect(Array.isArray(res)).toBe(true);
    });
  }
});
