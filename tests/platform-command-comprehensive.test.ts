import { describe, expect, it } from "vitest";
import { defaultCommandRunner } from "../src/platform/command";
import {
  DarwinProvider,
  LinuxProvider,
  WindowsProvider,
  createPlatformProvider,
} from "../src/platform";

describe("createPlatformProvider", () => {
  it("returns DarwinProvider when platform is darwin", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });
    try {
      const provider = createPlatformProvider();
      expect(provider).toBeInstanceOf(DarwinProvider);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("returns WindowsProvider when platform is win32", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
      const provider = createPlatformProvider();
      expect(provider).toBeInstanceOf(WindowsProvider);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("returns LinuxProvider when platform is linux", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });
    try {
      const provider = createPlatformProvider();
      expect(provider).toBeInstanceOf(LinuxProvider);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });

  it("returns LinuxProvider as fallback for unknown platform (e.g. freebsd)", () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "freebsd" });
    try {
      const provider = createPlatformProvider();
      expect(provider).toBeInstanceOf(LinuxProvider);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    }
  });
});

describe("defaultCommandRunner", () => {
  it("runs echo command and captures stdout", async () => {
    const out = await defaultCommandRunner("echo", ["hello-killx"]);
    expect(out.trim()).toBe("hello-killx");
  });

  it("handles empty argument list", async () => {
    const out = await defaultCommandRunner("echo", []);
    expect(out).toBe("\n");
  });

  it("throws error for nonexistent binary", async () => {
    await expect(
      defaultCommandRunner("nonexistent-command-12345", []),
    ).rejects.toThrow();
  });

  it("respects timeout option", async () => {
    await expect(
      defaultCommandRunner("sleep", ["2"], { timeout: 50 }),
    ).rejects.toThrow();
  });
});
