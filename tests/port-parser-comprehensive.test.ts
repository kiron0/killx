import { describe, expect, it } from "vitest";
import {
  MAX_PORT,
  MAX_RANGE_SIZE,
  MIN_PORT,
  expandPorts,
  parsePort,
} from "../src/port/parser";

describe("port/parser constants", () => {
  it("has correct MIN_PORT", () => {
    expect(MIN_PORT).toBe(1);
  });

  it("has correct MAX_PORT", () => {
    expect(MAX_PORT).toBe(65535);
  });

  it("has correct MAX_RANGE_SIZE", () => {
    expect(MAX_RANGE_SIZE).toBe(10001);
  });
});

describe("parsePort - valid numbers and numeric strings", () => {
  const validCases: Array<[string | number, number]> = [
    [1, 1],
    ["1", 1],
    [2, 2],
    ["2", 2],
    [21, 21],
    ["21", 21],
    [22, 22],
    ["22", 22],
    [80, 80],
    ["80", 80],
    [443, 443],
    ["443", 443],
    [1024, 1024],
    ["1024", 1024],
    [3000, 3000],
    ["3000", 3000],
    [3306, 3306],
    ["3306", 3306],
    [5000, 5000],
    ["5000", 5000],
    [5173, 5173],
    ["5173", 5173],
    [5432, 5432],
    ["5432", 5432],
    [6379, 6379],
    ["6379", 6379],
    [8000, 8000],
    ["8000", 8000],
    [8080, 8080],
    ["8080", 8080],
    [8443, 8443],
    ["8443", 8443],
    [9000, 9000],
    ["9000", 9000],
    [27017, 27017],
    ["27017", 27017],
    [65534, 65534],
    ["65534", 65534],
    [65535, 65535],
    ["65535", 65535],
  ];

  for (const [input, expected] of validCases) {
    it(`parses valid port ${typeof input === "string" ? `"${input}"` : input}`, () => {
      expect(parsePort(input)).toBe(expected);
    });
  }
});

describe("parsePort - out of range boundary numbers", () => {
  const invalidRangeCases = [
    0,
    "0",
    -1,
    "-1",
    -80,
    "-80",
    -3000,
    "-3000",
    65536,
    "65536",
    65537,
    "65537",
    100000,
    "100000",
    999999,
    "999999",
  ];

  for (const input of invalidRangeCases) {
    it(`throws expected 1-65535 error for ${typeof input === "string" ? `"${input}"` : input}`, () => {
      expect(() => parsePort(input)).toThrow(
        `invalid port "${input}": expected 1-65535`,
      );
    });
  }
});

describe("parsePort - non-integers, floats and decimals", () => {
  const floatCases = [
    1.1,
    "1.1",
    80.5,
    "80.5",
    3000.99,
    "3000.99",
    NaN,
    "NaN",
    Infinity,
    "Infinity",
    -Infinity,
    "-Infinity",
  ];

  for (const input of floatCases) {
    it(`throws for float or non-integer ${String(input)}`, () => {
      expect(() => parsePort(input as unknown as number)).toThrow();
    });
  }

  it("parses string decimals that evaluate to integers", () => {
    expect(parsePort("1.0")).toBe(1);
    expect(parsePort("80.00")).toBe(80);
  });
});

describe("parsePort - hex and binary representations", () => {
  it("parses hex numeric string", () => {
    expect(parsePort("0x10")).toBe(16);
  });

  it("parses binary numeric string", () => {
    expect(parsePort("0b10")).toBe(2);
  });

  it("parses octal numeric string", () => {
    expect(parsePort("0o10")).toBe(8);
  });
});

describe("parsePort - invalid strings and whitespace issues", () => {
  const invalidStrings = [
    "",
    " ",
    "   ",
    "\t",
    "\n",
    " 3000",
    "3000 ",
    " 3000 ",
    "port3000",
    "3000port",
    "p3000",
    "3000p",
    "3000 80",
    "3000,80",
    "http",
    "https",
    "null",
    "undefined",
    "true",
    "false",
    "{}",
    "[]",
    "3000\0",
  ];

  for (const str of invalidStrings) {
    it(`throws for invalid string representation "${str}"`, () => {
      expect(() => parsePort(str)).toThrow();
    });
  }
});

describe("expandPorts - single ports list", () => {
  it("handles empty array", () => {
    const result = expandPorts([]);
    expect(result).toEqual({ ports: [], hasRange: false });
  });

  it("handles single port argument", () => {
    const result = expandPorts(["3000"]);
    expect(result).toEqual({ ports: [3000], hasRange: false });
  });

  it("handles multiple single port arguments", () => {
    const result = expandPorts(["80", "443", "8080"]);
    expect(result).toEqual({ ports: [80, 443, 8080], hasRange: false });
  });

  it("preserves insertion order of single ports", () => {
    const result = expandPorts(["8080", "3000", "80"]);
    expect(result).toEqual({ ports: [8080, 3000, 80], hasRange: false });
  });

  it("deduplicates identical port arguments", () => {
    const result = expandPorts(["3000", "3000", "3000"]);
    expect(result).toEqual({ ports: [3000], hasRange: false });
  });

  it("deduplicates interleaved duplicate port arguments", () => {
    const result = expandPorts(["80", "443", "80", "8080", "443"]);
    expect(result).toEqual({ ports: [80, 443, 8080], hasRange: false });
  });
});

describe("expandPorts - range syntax", () => {
  it("expands a small valid range", () => {
    const result = expandPorts(["3000-3003"]);
    expect(result).toEqual({
      ports: [3000, 3001, 3002, 3003],
      hasRange: true,
    });
  });

  it("expands a single port range (same start and end)", () => {
    const result = expandPorts(["5000-5000"]);
    expect(result).toEqual({
      ports: [5000],
      hasRange: true,
    });
  });

  it("expands two consecutive ports", () => {
    const result = expandPorts(["8080-8081"]);
    expect(result).toEqual({
      ports: [8080, 8081],
      hasRange: true,
    });
  });

  it("expands boundary range at MIN_PORT", () => {
    const result = expandPorts(["1-3"]);
    expect(result).toEqual({
      ports: [1, 2, 3],
      hasRange: true,
    });
  });

  it("expands boundary range at MAX_PORT", () => {
    const result = expandPorts(["65533-65535"]);
    expect(result).toEqual({
      ports: [65533, 65534, 65535],
      hasRange: true,
    });
  });

  it("mixes single ports and ranges", () => {
    const result = expandPorts(["80", "3000-3002", "443"]);
    expect(result).toEqual({
      ports: [80, 3000, 3001, 3002, 443],
      hasRange: true,
    });
  });

  it("deduplicates overlap between single port and range", () => {
    const result = expandPorts(["3001", "3000-3003"]);
    expect(result).toEqual({
      ports: [3001, 3000, 3002, 3003],
      hasRange: true,
    });
  });

  it("deduplicates overlap between two overlapping ranges", () => {
    const result = expandPorts(["3000-3003", "3002-3005"]);
    expect(result).toEqual({
      ports: [3000, 3001, 3002, 3003, 3004, 3005],
      hasRange: true,
    });
  });

  it("expands range up to MAX_RANGE_SIZE exactly", () => {
    const result = expandPorts(["1000-11000"]);
    expect(result.ports.length).toBe(10001);
    expect(result.ports[0]).toBe(1000);
    expect(result.ports[10000]).toBe(11000);
    expect(result.hasRange).toBe(true);
  });
});

describe("expandPorts - invalid range errors", () => {
  it("throws when range start exceeds end", () => {
    expect(() => expandPorts(["3005-3000"])).toThrow(
      'invalid port range "3005-3000": start exceeds end',
    );
  });

  it("throws when range start exceeds end at boundary", () => {
    expect(() => expandPorts(["2-1"])).toThrow(
      'invalid port range "2-1": start exceeds end',
    );
  });

  it("throws when range exceeds MAX_RANGE_SIZE", () => {
    expect(() => expandPorts(["1-10003"])).toThrow(
      'port range "1-10003" exceeds 10001 ports',
    );
  });

  it("throws when range has more than one hyphen", () => {
    expect(() => expandPorts(["3000-3002-3004"])).toThrow(
      'invalid port range "3000-3002-3004"',
    );
  });

  it("throws when range has empty start", () => {
    expect(() => expandPorts(["-3000"])).toThrow();
  });

  it("throws when range has empty end", () => {
    expect(() => expandPorts(["3000-"])).toThrow();
  });

  it("throws when range start is non-numeric", () => {
    expect(() => expandPorts(["abc-3000"])).toThrow();
  });

  it("throws when range end is non-numeric", () => {
    expect(() => expandPorts(["3000-def"])).toThrow();
  });

  it("throws when range start is 0", () => {
    expect(() => expandPorts(["0-100"])).toThrow();
  });

  it("throws when range end exceeds MAX_PORT", () => {
    expect(() => expandPorts(["65000-70000"])).toThrow();
  });
});
