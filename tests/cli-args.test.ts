import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli/args";

describe("parseCliArgs", () => {
  it("converts port list shorthand to kill command", () => {
    const res = parseCliArgs(["3000", "5173", "--force"]);
    expect(res.command).toBe("kill");
    expect(res.positionals).toEqual(["3000", "5173"]);
    expect(res.flags.force).toBe(true);
  });

  it("preserves explicit commands", () => {
    const res = parseCliArgs(["info", "3000", "--json"]);
    expect(res.command).toBe("info");
    expect(res.positionals).toEqual(["3000"]);
    expect(res.flags.json).toBe(true);
  });

  it("handles aliases like 'ls' and 'ps'", () => {
    expect(parseCliArgs(["ls"]).command).toBe("list");
    expect(parseCliArgs(["c", "8080"]).command).toBe("check");
    expect(parseCliArgs(["i", "8080"]).command).toBe("info");
    expect(parseCliArgs(["ps", "node"]).command).toBe("process");
  });

  it("parses options with values like --timeout and --interval", () => {
    const res = parseCliArgs(["3000", "--timeout", "5", "--interval=200"]);
    expect(res.flags.timeout).toBe(5);
    expect(res.flags.interval).toBe(200);
  });

  it("throws on unknown option", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(/unknown option/);
  });
});
