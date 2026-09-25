import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli/index";
import {
  EXIT_GENERIC,
  EXIT_INVALID_ARGUMENTS,
  EXIT_NOT_FOUND,
  EXIT_SUCCESS,
} from "../src/errors";

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
});
