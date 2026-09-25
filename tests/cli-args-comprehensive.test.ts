import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli/args";

describe("parseCliArgs - boolean flags", () => {
  const booleanFlags = [
    { flag: "--json", prop: "json" },
    { flag: "-j", prop: "json" },
    { flag: "--quiet", prop: "quiet" },
    { flag: "-q", prop: "quiet" },
    { flag: "--verbose", prop: "verbose" },
    { flag: "-v", prop: "verbose" },
    { flag: "--force", prop: "force" },
    { flag: "-f", prop: "force" },
    { flag: "--yes", prop: "yes" },
    { flag: "-y", prop: "yes" },
    { flag: "--help", prop: "help" },
    { flag: "-h", prop: "help" },
    { flag: "--version", prop: "version" },
    { flag: "--check-update", prop: "checkUpdate" },
    { flag: "--no-update-check", prop: "noUpdateCheck" },
    { flag: "--occupied", prop: "occupied" },
    { flag: "--kill", prop: "kill" },
  ] as const;

  for (const { flag, prop } of booleanFlags) {
    it(`sets flags.${prop} = true for ${flag}`, () => {
      const res = parseCliArgs([flag]);
      expect(res.flags[prop]).toBe(true);
    });
  }

  it("sets multiple flags simultaneously", () => {
    const res = parseCliArgs(["-f", "-y", "-q", "-j"]);
    expect(res.flags.force).toBe(true);
    expect(res.flags.yes).toBe(true);
    expect(res.flags.quiet).toBe(true);
    expect(res.flags.json).toBe(true);
  });
});

describe("parseCliArgs - timeout flag", () => {
  it("parses --timeout with space separation", () => {
    const res = parseCliArgs(["--timeout", "10"]);
    expect(res.flags.timeout).toBe(10);
  });

  it("parses --timeout with equals separation", () => {
    const res = parseCliArgs(["--timeout=15"]);
    expect(res.flags.timeout).toBe(15);
  });

  it("parses --timeout 0", () => {
    const res = parseCliArgs(["--timeout", "0"]);
    expect(res.flags.timeout).toBe(0);
  });

  it("throws when --timeout has no argument following", () => {
    expect(() => parseCliArgs(["--timeout"])).toThrow(
      "option '--timeout' requires a numeric value",
    );
  });

  it("throws when --timeout has non-numeric value", () => {
    expect(() => parseCliArgs(["--timeout", "abc"])).toThrow(
      "option '--timeout' requires a numeric value",
    );
  });

  it("throws when --timeout= has non-numeric value", () => {
    expect(() => parseCliArgs(["--timeout=xyz"])).toThrow(
      "option '--timeout' requires a numeric value",
    );
  });

  it("throws when --timeout= is empty", () => {
    expect(() => parseCliArgs(["--timeout="])).toThrow(
      "option '--timeout' requires a numeric value",
    );
  });
});

describe("parseCliArgs - interval flag", () => {
  it("parses --interval with space separation", () => {
    const res = parseCliArgs(["--interval", "500"]);
    expect(res.flags.interval).toBe(500);
  });

  it("parses --interval with equals separation", () => {
    const res = parseCliArgs(["--interval=1500"]);
    expect(res.flags.interval).toBe(1500);
  });

  it("throws when --interval has no argument following", () => {
    expect(() => parseCliArgs(["--interval"])).toThrow(
      "option '--interval' requires a numeric value",
    );
  });

  it("throws when --interval has non-numeric value", () => {
    expect(() => parseCliArgs(["--interval", "fast"])).toThrow(
      "option '--interval' requires a numeric value",
    );
  });

  it("throws when --interval= has non-numeric value", () => {
    expect(() => parseCliArgs(["--interval=fast"])).toThrow(
      "option '--interval' requires a numeric value",
    );
  });

  it("throws when --interval= is empty", () => {
    expect(() => parseCliArgs(["--interval="])).toThrow(
      "option '--interval' requires a numeric value",
    );
  });
});

describe("parseCliArgs - unknown options", () => {
  const unknownOptions = [
    "--bad",
    "--unknown-flag",
    "--all",
    "-x",
    "-z",
    "-9",
    "--foo=bar",
  ];

  for (const opt of unknownOptions) {
    it(`throws for unknown option "${opt}"`, () => {
      expect(() => parseCliArgs([opt])).toThrow(`unknown option "${opt}"`);
    });
  }
});

describe("parseCliArgs - commands and aliases", () => {
  const commands = [
    { input: "kill", expected: "kill" },
    { input: "info", expected: "info" },
    { input: "i", expected: "info" },
    { input: "check", expected: "check" },
    { input: "c", expected: "check" },
    { input: "list", expected: "list" },
    { input: "ls", expected: "list" },
    { input: "free", expected: "free" },
    { input: "process", expected: "process" },
    { input: "ps", expected: "process" },
    { input: "dev", expected: "dev" },
    { input: "wait", expected: "wait" },
    { input: "watch", expected: "watch" },
    { input: "check-update", expected: "check-update" },
    { input: "update", expected: "update" },
  ] as const;

  for (const { input, expected } of commands) {
    it(`parses command "${input}" as "${expected}"`, () => {
      const res = parseCliArgs([input]);
      expect(res.command).toBe(expected);
      expect(res.positionals).toEqual([]);
    });
  }
});

describe("parseCliArgs - commands with positionals", () => {
  it("parses kill with multiple port positionals", () => {
    const res = parseCliArgs(["kill", "3000", "5173", "8080"]);
    expect(res.command).toBe("kill");
    expect(res.positionals).toEqual(["3000", "5173", "8080"]);
  });

  it("parses info with single port", () => {
    const res = parseCliArgs(["info", "3000"]);
    expect(res.command).toBe("info");
    expect(res.positionals).toEqual(["3000"]);
  });

  it("parses check with single port", () => {
    const res = parseCliArgs(["check", "8080"]);
    expect(res.command).toBe("check");
    expect(res.positionals).toEqual(["8080"]);
  });

  it("parses list with range positional", () => {
    const res = parseCliArgs(["list", "3000-4000"]);
    expect(res.command).toBe("list");
    expect(res.positionals).toEqual(["3000-4000"]);
  });

  it("parses free with starting port", () => {
    const res = parseCliArgs(["free", "5000"]);
    expect(res.command).toBe("free");
    expect(res.positionals).toEqual(["5000"]);
  });

  it("parses ps with process name query", () => {
    const res = parseCliArgs(["ps", "node"]);
    expect(res.command).toBe("process");
    expect(res.positionals).toEqual(["node"]);
  });

  it("parses wait with port", () => {
    const res = parseCliArgs(["wait", "3000"]);
    expect(res.command).toBe("wait");
    expect(res.positionals).toEqual(["3000"]);
  });

  it("parses watch with port", () => {
    const res = parseCliArgs(["watch", "3000"]);
    expect(res.command).toBe("watch");
    expect(res.positionals).toEqual(["3000"]);
  });
});

describe("parseCliArgs - default command shorthand", () => {
  it("defaults to kill command when single numeric positional given", () => {
    const res = parseCliArgs(["3000"]);
    expect(res.command).toBe("kill");
    expect(res.positionals).toEqual(["3000"]);
  });

  it("defaults to kill command when multiple numeric positionals given", () => {
    const res = parseCliArgs(["3000", "8080", "9000"]);
    expect(res.command).toBe("kill");
    expect(res.positionals).toEqual(["3000", "8080", "9000"]);
  });

  it("defaults to kill command when port range given", () => {
    const res = parseCliArgs(["3000-3005"]);
    expect(res.command).toBe("kill");
    expect(res.positionals).toEqual(["3000-3005"]);
  });
});

describe("parseCliArgs - flags and positionals interleaving", () => {
  it("handles flags before command", () => {
    const res = parseCliArgs(["--json", "list"]);
    expect(res.command).toBe("list");
    expect(res.flags.json).toBe(true);
  });

  it("handles flags between command and positional", () => {
    const res = parseCliArgs(["kill", "-f", "3000"]);
    expect(res.command).toBe("kill");
    expect(res.flags.force).toBe(true);
    expect(res.positionals).toEqual(["3000"]);
  });

  it("handles flags after positionals", () => {
    const res = parseCliArgs(["kill", "3000", "--force", "--yes"]);
    expect(res.command).toBe("kill");
    expect(res.flags.force).toBe(true);
    expect(res.flags.yes).toBe(true);
    expect(res.positionals).toEqual(["3000"]);
  });

  it("handles ps query with --kill and --yes", () => {
    const res = parseCliArgs(["ps", "vite", "--kill", "-y"]);
    expect(res.command).toBe("process");
    expect(res.positionals).toEqual(["vite"]);
    expect(res.flags.kill).toBe(true);
    expect(res.flags.yes).toBe(true);
  });

  it("handles empty argv", () => {
    const res = parseCliArgs([]);
    expect(res.command).toBeUndefined();
    expect(res.positionals).toEqual([]);
    expect(res.flags).toEqual({});
  });
});
