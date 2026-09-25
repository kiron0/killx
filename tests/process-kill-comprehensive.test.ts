import { describe, expect, it, vi } from "vitest";
import {
  isProcessAlive,
  sendSignal,
  sendSignalWindows,
  terminateProcess,
  waitUntilGone,
} from "../src/process/kill";
import type { CommandRunner } from "../src/platform/command";

describe("isProcessAlive", () => {
  it("returns false for pid 0", () => {
    expect(isProcessAlive(0)).toBe(false);
  });

  it("returns false for negative pids", () => {
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(-100)).toBe(false);
  });

  it("returns true for current node process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for nonexistent pid", () => {
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it("returns true if process.kill throws EPERM (process exists but unprivileged)", () => {
    const spy = vi.spyOn(process, "kill").mockImplementationOnce(() => {
      const err = new Error("kill EPERM") as Error & { code: string };
      err.code = "EPERM";
      throw err;
    });
    expect(isProcessAlive(12345)).toBe(true);
    spy.mockRestore();
  });

  it("returns false if process.kill throws ESRCH (no such process)", () => {
    const spy = vi.spyOn(process, "kill").mockImplementationOnce(() => {
      const err = new Error("kill ESRCH") as Error & { code: string };
      err.code = "ESRCH";
      throw err;
    });
    expect(isProcessAlive(12345)).toBe(false);
    spy.mockRestore();
  });
});

describe("sendSignal", () => {
  it("calls process.kill with SIGTERM when force=false", () => {
    const spy = vi.spyOn(process, "kill").mockImplementation(() => true);
    sendSignal(99999, false);
    expect(spy).toHaveBeenCalledWith(99999, "SIGTERM");
    spy.mockRestore();
  });

  it("calls process.kill with SIGKILL when force=true", () => {
    const spy = vi.spyOn(process, "kill").mockImplementation(() => true);
    sendSignal(99999, true);
    expect(spy).toHaveBeenCalledWith(99999, "SIGKILL");
    spy.mockRestore();
  });
});

describe("sendSignalWindows", () => {
  it("executes taskkill with /PID and /T without /F when force is false", async () => {
    let capturedCmd = "";
    let capturedArgs: readonly string[] = [];
    const mockRunner: CommandRunner = async (cmd, args) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return "";
    };

    await sendSignalWindows(5432, false, mockRunner);
    expect(capturedCmd).toBe("taskkill");
    expect(capturedArgs).toEqual(["/PID", "5432", "/T"]);
  });

  it("executes taskkill with /PID, /T and /F when force is true", async () => {
    let capturedCmd = "";
    let capturedArgs: readonly string[] = [];
    const mockRunner: CommandRunner = async (cmd, args) => {
      capturedCmd = cmd;
      capturedArgs = args;
      return "";
    };

    await sendSignalWindows(5432, true, mockRunner);
    expect(capturedCmd).toBe("taskkill");
    expect(capturedArgs).toEqual(["/PID", "5432", "/T", "/F"]);
  });
});

describe("waitUntilGone", () => {
  it("returns true immediately when process is already gone", async () => {
    const gone = await waitUntilGone(99999999, 500);
    expect(gone).toBe(true);
  });

  it("returns false if process remains alive past timeout", async () => {
    const gone = await waitUntilGone(process.pid, 100);
    expect(gone).toBe(false);
  });
});

describe("terminateProcess", () => {
  it("refuses to terminate PID 0", async () => {
    await expect(terminateProcess(0)).rejects.toThrow(
      "refusing to terminate protected PID 0",
    );
  });

  it("refuses to terminate PID 1 (init / launchd)", async () => {
    await expect(terminateProcess(1)).rejects.toThrow(
      "refusing to terminate protected PID 1",
    );
  });

  it("refuses to terminate negative PID", async () => {
    await expect(terminateProcess(-5)).rejects.toThrow(
      "refusing to terminate protected PID -5",
    );
  });

  it("terminates with SIGTERM when process exits gracefully", async () => {
    let alive = true;
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === "SIGTERM") {
        alive = false;
        return true;
      }
      if (sig === 0) {
        if (!alive) {
          throw new Error("ESRCH");
        }
        return true;
      }
      return true;
    });

    try {
      const sig = await terminateProcess(50000, { timeoutMs: 0 });
      expect(sig).toBe("SIGTERM");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("terminates with SIGKILL directly when force=true", async () => {
    let alive = true;
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === "SIGKILL") {
        alive = false;
        return true;
      }
      if (sig === 0) {
        if (!alive) {
          throw new Error("ESRCH");
        }
        return true;
      }
      return true;
    });

    try {
      const sig = await terminateProcess(50001, { force: true });
      expect(sig).toBe("SIGKILL");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("throws if force=true but process is still running after timeout", async () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === 0) return true; // stays alive forever
      return true;
    });

    try {
      await expect(terminateProcess(50002, { force: true })).rejects.toThrow(
        "process is still running",
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it("throws if graceful kill fails when timeoutMs is 0", async () => {
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === 0) return true; // stays alive
      return true;
    });

    try {
      await expect(terminateProcess(50003, { timeoutMs: 0 })).rejects.toThrow(
        "process is still running",
      );
    } finally {
      killSpy.mockRestore();
    }
  });

  it("escalates to SIGKILL if timeoutMs > 0 and process ignores SIGTERM", async () => {
    let termReceived = false;
    let killReceived = false;
    let alive = true;

    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === "SIGTERM") {
        termReceived = true;
        // ignore SIGTERM, keep alive
        return true;
      }
      if (sig === "SIGKILL") {
        killReceived = true;
        alive = false;
        return true;
      }
      if (sig === 0) {
        if (!alive) throw new Error("ESRCH");
        return true;
      }
      return true;
    });

    try {
      const sig = await terminateProcess(50004, { timeoutMs: 100 });
      expect(termReceived).toBe(true);
      expect(killReceived).toBe(true);
      expect(sig).toBe("SIGKILL");
    } finally {
      killSpy.mockRestore();
    }
  });

  it("supports windows platform path with fallback", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32" });

    let nodeKillCalled = false;
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid, sig) => {
      if (sig === "SIGTERM") {
        nodeKillCalled = true;
        return true;
      }
      if (sig === 0) throw new Error("ESRCH");
      return true;
    });

    const mockRunner: CommandRunner = async () => {
      throw new Error("taskkill not accessible");
    };

    try {
      const sig = await terminateProcess(50005, { timeoutMs: 0 }, mockRunner);
      expect(sig).toBe("SIGTERM");
      expect(nodeKillCalled).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform });
      killSpy.mockRestore();
    }
  });
});
