import { describe, expect, it } from "vitest";
import { parseLsof, portFromAddress } from "../src/platform/lsof";

describe("portFromAddress", () => {
  it("extracts port numbers from various socket strings", () => {
    expect(portFromAddress("*:3000")).toBe(3000);
    expect(portFromAddress("127.0.0.1:5173")).toBe(5173);
    expect(portFromAddress("[::1]:8080")).toBe(8080);
    expect(portFromAddress("*:3000 (LISTEN)")).toBe(3000);
    expect(portFromAddress("invalid")).toBe(0);
  });
});

describe("parseLsof", () => {
  it("parses structured lsof -F output correctly", () => {
    const raw = `p18342
cnode
Ltoufiq
n*:3000
TST=LISTEN
p19201
cvite
Ltoufiq
n127.0.0.1:5173
TST=LISTEN
`;
    const parsed = parseLsof(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      pid: 18342,
      port: 3000,
      process: "node",
      user: "toufiq",
      protocol: "tcp",
      state: "listen",
    });
    expect(parsed[1]).toEqual({
      pid: 19201,
      port: 5173,
      process: "vite",
      user: "toufiq",
      protocol: "tcp",
      state: "listen",
    });
  });

  it("returns empty array for empty lsof output", () => {
    expect(parseLsof("")).toEqual([]);
  });
});
