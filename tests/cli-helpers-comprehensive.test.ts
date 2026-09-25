import { describe, expect, it } from "vitest";
import { getPackageVersion, printHelp } from "../src/cli";
import { Printer } from "../src/output";

describe("getPackageVersion", () => {
  it("returns current package version string", async () => {
    const version = await getPackageVersion();
    expect(typeof version).toBe("string");
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("printHelp", () => {
  it("outputs complete usage and options to printer", () => {
    const lines: string[] = [];
    const printer = new Printer({ writer: (s) => lines.push(s) });

    printHelp(printer);
    const text = lines.join("");

    expect(text).toContain("killx - Find and kill processes by port");
    expect(text).toContain("Usage:");
    expect(text).toContain("killx <port...>");
    expect(text).toContain("killx kill <port...>");
    expect(text).toContain("killx info <port>");
    expect(text).toContain("killx check <port>");
    expect(text).toContain("killx list [range]");
    expect(text).toContain("killx free [port]");
    expect(text).toContain("killx ps [query]");
    expect(text).toContain("killx dev");
    expect(text).toContain("killx wait <port>");
    expect(text).toContain("killx watch <port>");
    expect(text).toContain("Options:");
    expect(text).toContain("-f, --force");
    expect(text).toContain("-y, --yes");
    expect(text).toContain("-q, --quiet");
    expect(text).toContain("-j, --json");
    expect(text).toContain("-v, --verbose");
    expect(text).toContain("--timeout");
    expect(text).toContain("--occupied");
    expect(text).toContain("--interval");
    expect(text).toContain("--kill");
    expect(text).toContain("-h, --help");
    expect(text).toContain("--version");
  });
});
