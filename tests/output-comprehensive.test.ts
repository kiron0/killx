import { describe, expect, it, vi } from "vitest";
import { Printer, THANKS_MESSAGE, printThanks } from "../src/output";
import type { ProcessInfo } from "../src/types";

describe("THANKS_MESSAGE and printThanks", () => {
  it("contains killx.js.org in THANKS_MESSAGE", () => {
    expect(THANKS_MESSAGE).toContain("killx.js.org");
    expect(THANKS_MESSAGE).toContain("Thanks for using killx..!");
  });

  it("calls console.log with THANKS_MESSAGE when printThanks is called", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printThanks();
    expect(spy).toHaveBeenCalledWith(THANKS_MESSAGE);
    spy.mockRestore();
  });
});

describe("Printer initialization options", () => {
  it("defaults to json=false and quiet=false", () => {
    const p = new Printer();
    expect(p.json).toBe(false);
    expect(p.quiet).toBe(false);
  });

  it("sets json=true when passed", () => {
    const p = new Printer({ json: true });
    expect(p.json).toBe(true);
    expect(p.quiet).toBe(false);
  });

  it("sets quiet=true when passed", () => {
    const p = new Printer({ quiet: true });
    expect(p.json).toBe(false);
    expect(p.quiet).toBe(true);
  });

  it("sets both json=true and quiet=true", () => {
    const p = new Printer({ json: true, quiet: true });
    expect(p.json).toBe(true);
    expect(p.quiet).toBe(true);
  });
});

describe("Printer custom writers", () => {
  it("routes line() to custom writer with newline", () => {
    const lines: string[] = [];
    const p = new Printer({ writer: (s) => lines.push(s) });
    p.line("hello world");
    expect(lines).toEqual(["hello world\n"]);
  });

  it("routes error() to custom errorWriter with newline", () => {
    const errors: string[] = [];
    const p = new Printer({ errorWriter: (s) => errors.push(s) });
    p.error("error message");
    expect(errors).toEqual(["error message\n"]);
  });

  it("does not suppress error() in quiet mode", () => {
    const errors: string[] = [];
    const p = new Printer({ quiet: true, errorWriter: (s) => errors.push(s) });
    p.error("critical error");
    expect(errors).toEqual(["critical error\n"]);
  });

  it("suppresses line() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.line("suppressed");
    expect(lines.length).toBe(0);
  });

  it("suppresses encode() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.encode({ foo: "bar" });
    expect(lines.length).toBe(0);
  });

  it("suppresses success() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.success("done");
    expect(lines.length).toBe(0);
  });

  it("suppresses empty() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.empty("no items");
    expect(lines.length).toBe(0);
  });

  it("suppresses table() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.table(["H1"], [["V1"]]);
    expect(lines.length).toBe(0);
  });

  it("suppresses processes() in quiet mode", () => {
    const lines: string[] = [];
    const p = new Printer({ quiet: true, writer: (s) => lines.push(s) });
    p.processes([
      {
        pid: 1,
        port: 80,
        process: "p",
        user: "u",
        command: "c",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    expect(lines.length).toBe(0);
  });
});

describe("Printer output formatting", () => {
  it("encodes objects as formatted JSON", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.encode({ key: "value", num: 42 });
    expect(output.join("")).toBe(
      JSON.stringify({ key: "value", num: 42 }, null, 2) + "\n",
    );
  });

  it("formats success message with checkmark", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.success("Killed node (PID 123) on :3000");
    expect(output.join("")).toContain("✓ Killed node (PID 123) on :3000");
  });

  it("formats empty message with bullet", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.empty("Nothing listening on :3000");
    expect(output.join("")).toContain("• Nothing listening on :3000");
  });

  it("renders a 2x2 table correctly with padding", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.table(
      ["NAME", "STATUS"],
      [
        ["node", "active"],
        ["python", "idle"],
      ],
    );
    const text = output.join("");
    expect(text).toContain("NAME");
    expect(text).toContain("STATUS");
    expect(text).toContain("node");
    expect(text).toContain("active");
    expect(text).toContain("python");
    expect(text).toContain("idle");
  });

  it("renders a table with empty rows", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.table(["COL1", "COL2"], []);
    const text = output.join("");
    expect(text).toBe("COL1  COL2\n");
  });

  it("renders a table with cell longer than header", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.table(["PID"], [["123456789"]]);
    const text = output.join("");
    expect(text).toContain("123456789");
  });

  it("processes() outputs json when json=true", () => {
    const output: string[] = [];
    const p = new Printer({ json: true, writer: (s) => output.push(s) });
    const proc: ProcessInfo = {
      pid: 100,
      port: 3000,
      process: "node",
      user: "dev",
      command: "node server.js",
      protocol: "tcp",
      state: "listen",
    };
    p.processes([proc]);
    expect(JSON.parse(output.join(""))).toEqual([proc]);
  });

  it("processes() outputs table when json=false", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    const proc: ProcessInfo = {
      pid: 100,
      port: 3000,
      process: "node",
      user: "dev",
      command: "node server.js",
      protocol: "tcp",
      state: "listen",
    };
    p.processes([proc]);
    const text = output.join("");
    expect(text).toContain("PORT");
    expect(text).toContain("PID");
    expect(text).toContain("PROCESS");
    expect(text).toContain("USER");
    expect(text).toContain("3000");
    expect(text).toContain("100");
    expect(text).toContain("node");
    expect(text).toContain("dev");
  });

  it("processes() handles multiple processes in table mode", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.processes([
      {
        pid: 101,
        port: 3000,
        process: "node",
        user: "alice",
        command: "node app.js",
        protocol: "tcp",
        state: "listen",
      },
      {
        pid: 102,
        port: 8080,
        process: "java",
        user: "bob",
        command: "java -jar app.jar",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const text = output.join("");
    expect(text).toContain("3000");
    expect(text).toContain("8080");
    expect(text).toContain("alice");
    expect(text).toContain("bob");
  });

  it("processes() handles process with empty user", () => {
    const output: string[] = [];
    const p = new Printer({ writer: (s) => output.push(s) });
    p.processes([
      {
        pid: 200,
        port: 5000,
        process: "flask",
        user: "",
        command: "flask run",
        protocol: "tcp",
        state: "listen",
      },
    ]);
    const text = output.join("");
    expect(text).toContain("5000");
    expect(text).toContain("flask");
  });

  const messageTests = [
    "Operation completed successfully",
    "Port 80 is listening",
    "Terminated 1 process",
    "Nothing listening on selected ports",
    "Killed 5 processes",
  ];

  for (const msg of messageTests) {
    it(`prints line: "${msg}"`, () => {
      const out: string[] = [];
      const p = new Printer({ writer: (s) => out.push(s) });
      p.line(msg);
      expect(out[0]).toBe(`${msg}\n`);
    });

    it(`prints error: "${msg}"`, () => {
      const errOut: string[] = [];
      const p = new Printer({ errorWriter: (s) => errOut.push(s) });
      p.error(msg);
      expect(errOut[0]).toBe(`${msg}\n`);
    });

    it(`prints success: "${msg}"`, () => {
      const out: string[] = [];
      const p = new Printer({ writer: (s) => out.push(s) });
      p.success(msg);
      expect(out[0]).toContain(msg);
    });

    it(`prints empty: "${msg}"`, () => {
      const out: string[] = [];
      const p = new Printer({ writer: (s) => out.push(s) });
      p.empty(msg);
      expect(out[0]).toContain(msg);
    });
  }
});
