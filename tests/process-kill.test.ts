import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runProcessCommand } from "../src/commands/process";
import { Printer } from "../src/output";

describe("process kill matches", () => {
  it("kills matching process when --kill and --yes are provided", async () => {
    const token = `token_process_kill_${Date.now()}`;
    spawn(process.execPath, ["-e", `// ${token}\nsetInterval(() => {}, 1000)`]);

    let out = "";
    const printer = new Printer({ writer: (t) => (out += t) });

    await runProcessCommand(
      {
        query: token,
        kill: true,
        yes: true,
      },
      printer,
    );

    expect(out).toContain("Killed");
  });
});
