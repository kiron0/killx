import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli/args";
import { invalid } from "../src/errors";

describe("cli-args branches", () => {
  it("parses single flag options", () => {
    const res = parseCliArgs([
      "--verbose",
      "-v",
      "--yes",
      "-y",
      "--occupied",
      "--kill",
    ]);
    expect(res.flags.verbose).toBe(true);
    expect(res.flags.yes).toBe(true);
    expect(res.flags.occupied).toBe(true);
    expect(res.flags.kill).toBe(true);
  });

  it("handles invalid --timeout and --interval values", () => {
    expect(() => parseCliArgs(["--timeout"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--timeout", "abc"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--timeout=abc"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--timeout="])).toThrow(/numeric value/);

    expect(() => parseCliArgs(["--interval"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--interval", "abc"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--interval=abc"])).toThrow(/numeric value/);
    expect(() => parseCliArgs(["--interval="])).toThrow(/numeric value/);
  });

  it("invalid helper returns CliError", () => {
    const err = invalid(new Error("custom err"));
    expect(err.code).toBe(2);
    expect(err.message).toBe("✗ custom err");
  });
});
