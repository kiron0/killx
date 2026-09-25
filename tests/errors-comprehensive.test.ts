import { describe, expect, it } from "vitest";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_INVALID_ARGUMENTS,
  EXIT_NOT_FOUND,
  EXIT_PERMISSION,
  EXIT_SUCCESS,
  EXIT_TERMINATION,
  invalid,
} from "../src/errors";

describe("exit codes", () => {
  it("defines EXIT_SUCCESS as 0", () => {
    expect(EXIT_SUCCESS).toBe(0);
  });

  it("defines EXIT_GENERIC as 1", () => {
    expect(EXIT_GENERIC).toBe(1);
  });

  it("defines EXIT_INVALID_ARGUMENTS as 2", () => {
    expect(EXIT_INVALID_ARGUMENTS).toBe(2);
  });

  it("defines EXIT_NOT_FOUND as 3", () => {
    expect(EXIT_NOT_FOUND).toBe(3);
  });

  it("defines EXIT_PERMISSION as 4", () => {
    expect(EXIT_PERMISSION).toBe(4);
  });

  it("defines EXIT_TERMINATION as 5", () => {
    expect(EXIT_TERMINATION).toBe(5);
  });

  it("has distinct codes for each error exit", () => {
    const codes = [
      EXIT_SUCCESS,
      EXIT_GENERIC,
      EXIT_INVALID_ARGUMENTS,
      EXIT_NOT_FOUND,
      EXIT_PERMISSION,
      EXIT_TERMINATION,
    ];
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
});

describe("CliError class", () => {
  it("instantiates with code only", () => {
    const err = new CliError(EXIT_GENERIC);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(1);
    expect(err.message).toBe("");
    expect(err.name).toBe("CliError");
    expect(err.causeError).toBeUndefined();
  });

  it("instantiates with code and message", () => {
    const err = new CliError(EXIT_NOT_FOUND, "port not found");
    expect(err.code).toBe(EXIT_NOT_FOUND);
    expect(err.message).toBe("port not found");
    expect(err.causeError).toBeUndefined();
  });

  it("instantiates with code, message, and causeError as Error", () => {
    const cause = new Error("inner failure");
    const err = new CliError(EXIT_TERMINATION, "failed", cause);
    expect(err.code).toBe(EXIT_TERMINATION);
    expect(err.message).toBe("failed");
    expect(err.causeError).toBe(cause);
  });

  it("instantiates with causeError as string", () => {
    const err = new CliError(EXIT_PERMISSION, "denied", "EACCES");
    expect(err.causeError).toBe("EACCES");
  });

  it("instantiates with causeError as object", () => {
    const obj = { code: "EADDRINUSE", errno: -48 };
    const err = new CliError(EXIT_GENERIC, "in use", obj);
    expect(err.causeError).toBe(obj);
  });

  it("maintains stack trace", () => {
    const err = new CliError(EXIT_INVALID_ARGUMENTS, "invalid args");
    expect(err.stack).toBeDefined();
    expect(typeof err.stack).toBe("string");
  });
});

describe("invalid helper function", () => {
  it("creates CliError from a string message", () => {
    const err = invalid("missing port argument");
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(EXIT_INVALID_ARGUMENTS);
    expect(err.message).toBe("✗ missing port argument");
    expect(err.causeError).toBe("missing port argument");
  });

  it("creates CliError from an Error instance", () => {
    const original = new Error("cannot parse range");
    const err = invalid(original);
    expect(err).toBeInstanceOf(CliError);
    expect(err.code).toBe(EXIT_INVALID_ARGUMENTS);
    expect(err.message).toBe("✗ cannot parse range");
    expect(err.causeError).toBe(original);
  });

  it("handles empty string message in invalid helper", () => {
    const err = invalid("");
    expect(err.code).toBe(EXIT_INVALID_ARGUMENTS);
    expect(err.message).toBe("✗ ");
  });

  const messageScenarios = [
    "invalid port 'abc'",
    "range start exceeds end",
    "timeout cannot be negative",
    "interval must be at least 100ms",
    "process accepts one search query",
    "free accepts at most one starting port",
    "list accepts at most one port or range",
    "info requires one port",
    "check requires one port",
    "dev accepts no arguments",
  ];

  for (const msg of messageScenarios) {
    it(`formats message "${msg}" with leading check-cross symbol`, () => {
      const err = invalid(msg);
      expect(err.code).toBe(EXIT_INVALID_ARGUMENTS);
      expect(err.message).toBe(`✗ ${msg}`);
    });
  }
});
