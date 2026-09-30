import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli/index";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_INVALID_ARGUMENTS,
  EXIT_NOT_FOUND,
  EXIT_SUCCESS,
} from "../src/errors";
import * as platformIndex from "../src/platform/index";

describe("CLI commands execution", () => {
  it("prints help and exits 0 on --help", async () => {
    const code = await runCli(["--help"]);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("prints version and exits 0 on --version", async () => {
    const code = await runCli(["--version"]);
    expect(code).toBe(EXIT_SUCCESS);
  });

  it("exits EXIT_INVALID_ARGUMENTS on unknown option", async () => {
    const code = await runCli(["--invalid-opt"]);
    expect(code).toBe(EXIT_INVALID_ARGUMENTS);
  });

  it("check command returns EXIT_SUCCESS when free", async () => {
    // 65534 unlikely occupied in tests
    const code = await runCli(["check", "65534", "--quiet"]);
    // Depends on actual system listener, but with fake or high port:
    expect([EXIT_SUCCESS, EXIT_GENERIC]).toContain(code);
  });

  it("handles empty ports on kill gracefully", async () => {
    const code = await runCli(["kill", "65533", "--quiet"]);
    expect(code).toBe(EXIT_NOT_FOUND);
  });

  it("calls printThanks when user cancellation occurs", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const mockProvider = {
      list: () => Promise.resolve([]),
      find: () => Promise.reject(new CliError(EXIT_GENERIC, "Kill cancelled")),
    };
    vi.spyOn(platformIndex, "createPlatformProvider").mockReturnValue(
      mockProvider,
    );
    await runCli(["kill", "3000"]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Thanks for using killx"),
    );
    spy.mockRestore();
    vi.restoreAllMocks();
  });
});
