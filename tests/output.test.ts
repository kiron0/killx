import { describe, expect, it } from "vitest";
import { Printer } from "../src/output";

describe("Printer", () => {
  it("formats lines, errors, and empty notices", () => {
    let out = "";
    let err = "";
    const p = new Printer({
      writer: (t) => (out += t),
      errorWriter: (t) => (err += t),
    });

    p.line("hello");
    p.error("fail");
    p.empty("nothing");
    p.success("done");
    p.processes([
      {
        pid: 1,
        port: 80,
        process: "app",
        user: "u",
        command: "c",
        protocol: "tcp",
        state: "listen",
      },
    ]);

    expect(out).toContain("hello");
    expect(err).toContain("fail");
    expect(out).toContain("nothing");
    expect(out).toContain("done");
    expect(out).toContain("app");
  });

  it("respects quiet mode", () => {
    let out = "";
    const p = new Printer({
      quiet: true,
      writer: (t) => (out += t),
    });
    p.line("hi");
    p.success("hi");
    p.empty("hi");
    p.processes([]);
    expect(out).toBe("");
  });
});
