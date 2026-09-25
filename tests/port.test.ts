import { describe, expect, it } from "vitest";
import { expandPorts, parsePort } from "../src/port/parser";

describe("parsePort", () => {
  it("parses valid port numbers", () => {
    expect(parsePort("1")).toBe(1);
    expect(parsePort("3000")).toBe(3000);
    expect(parsePort("65535")).toBe(65535);
    expect(parsePort(8080)).toBe(8080);
  });

  it("throws on invalid ports", () => {
    expect(() => parsePort("0")).toThrow(/invalid port/);
    expect(() => parsePort("-1")).toThrow(/invalid port/);
    expect(() => parsePort("65536")).toThrow(/invalid port/);
    expect(() => parsePort("3000 ")).toThrow(/invalid port/);
    expect(() => parsePort("http")).toThrow(/invalid port/);
    expect(() => parsePort("")).toThrow(/invalid port/);
  });
});

describe("expandPorts", () => {
  it("expands single ports and ranges while de-duplicating", () => {
    const { ports, hasRange } = expandPorts(["3000-3002", "3001", "8080"]);
    expect(hasRange).toBe(true);
    expect(ports).toEqual([3000, 3001, 3002, 8080]);
  });

  it("rejects descending ranges", () => {
    expect(() => expandPorts(["3010-3000"])).toThrow(/start exceeds end/);
  });

  it("rejects oversized ranges", () => {
    expect(() => expandPorts(["1-20000"])).toThrow(/exceeds/);
  });

  it("handles non-range lists", () => {
    const { ports, hasRange } = expandPorts(["3000", "4000"]);
    expect(hasRange).toBe(false);
    expect(ports).toEqual([3000, 4000]);
  });
});
