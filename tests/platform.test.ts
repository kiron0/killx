import { describe, expect, it } from "vitest";
import { LinuxProvider } from "../src/platform/linux";
import { WindowsProvider } from "../src/platform/windows";
import { DarwinProvider } from "../src/platform/darwin";

describe("LinuxProvider", () => {
  it("parses ss -H -lptn fallback output", async () => {
    const mockRunner = (cmd: string): Promise<string> => {
      if (cmd === "lsof") return Promise.reject(new Error("not found"));
      if (cmd === "ss") {
        return Promise.resolve(
          `LISTEN 0 128 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=18342,fd=19))\n`,
        );
      }
      return Promise.resolve("");
    };
    const provider = new LinuxProvider(mockRunner);
    const list = await provider.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.port).toBe(3000);
    expect(list[0]?.pid).toBe(18342);
    expect(list[0]?.process).toBe("node");
  });
});

describe("WindowsProvider", () => {
  it("parses netstat -ano output", async () => {
    const mockRunner = (cmd: string): Promise<string> => {
      if (cmd === "netstat") {
        return Promise.resolve(
          `  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       18342\n`,
        );
      }
      if (cmd === "powershell") {
        return Promise.resolve(`node.exe\nnode server.js`);
      }
      return Promise.resolve("");
    };
    const provider = new WindowsProvider(mockRunner);
    const list = await provider.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.port).toBe(3000);
    expect(list[0]?.pid).toBe(18342);
    expect(list[0]?.process).toBe("node");
    expect(list[0]?.command).toBe("node server.js");
  });
});

describe("DarwinProvider", () => {
  it("handles exit code 1 as empty list", async () => {
    const mockRunner = (): Promise<string> => {
      const err = new Error("exit 1");
      Object.assign(err, { code: 1 });
      return Promise.reject(err);
    };
    const provider = new DarwinProvider(mockRunner);
    const list = await provider.list();
    expect(list).toEqual([]);
  });
});
