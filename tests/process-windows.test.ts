import { describe, expect, it } from "vitest";
import { searchProcesses } from "../src/process/search";

describe("searchProcesses windows branch", () => {
  it("parses powershell json output on windows simulation", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });

    try {
      const mockRunner = (): Promise<string> =>
        Promise.resolve(
          JSON.stringify([
            {
              ProcessId: 101,
              CommandLine: "C:\\Program Files\\Node\\node.exe server.js",
            },
            { ProcessId: 102, CommandLine: "C:\\Tools\\git.exe" },
          ]),
        );

      const res = await searchProcesses("node", mockRunner);
      expect(res).toHaveLength(1);
      expect(res[0]?.pid).toBe(101);
      expect(res[0]?.command).toContain("node.exe");
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("handles empty / error powershell output gracefully", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "win32",
      configurable: true,
    });

    try {
      const mockRunner = (): Promise<string> =>
        Promise.reject(new Error("powershell failed"));

      const res = await searchProcesses("node", mockRunner);
      expect(res).toEqual([]);
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });
});
