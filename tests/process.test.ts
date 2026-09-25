import { describe, expect, it } from "vitest";
import { searchProcesses } from "../src/process/search";
import { isProcessAlive, waitUntilGone } from "../src/process/kill";

describe("process utilities", () => {
  it("checks if current process is alive", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it("waitUntilGone returns true for non-existent pid", async () => {
    const gone = await waitUntilGone(99999999, 100);
    expect(gone).toBe(true);
  });

  it("searchProcesses parses ps output", async () => {
    const mockRunner = (): Promise<string> =>
      Promise.resolve(`
18342 toufiq 0.2 1.1 node server.js
19201 toufiq 0.1 0.8 /usr/local/bin/vite
`);
    const results = await searchProcesses("node", mockRunner);
    expect(results).toHaveLength(1);
    expect(results[0]?.pid).toBe(18342);
    expect(results[0]?.command).toBe("node server.js");
  });
});
