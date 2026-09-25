import { describe, expect, it } from "vitest";
import { compareVersions } from "../src/update";

describe("compareVersions - equal versions", () => {
  const equalCases: Array<[string, string]> = [
    ["1.0.0", "1.0.0"],
    ["0.1.0", "0.1.0"],
    ["0.0.1", "0.0.1"],
    ["2.15.8", "2.15.8"],
    ["v1.0.0", "1.0.0"],
    ["1.0.0", "v1.0.0"],
    ["v2.3.4", "v2.3.4"],
    ["1.0.0-alpha", "1.0.0-alpha"],
    ["1.0.0-beta.1", "1.0.0-beta.1"],
    ["1.0.0-rc.2", "1.0.0-rc.2"],
  ];

  for (const [v1, v2] of equalCases) {
    it(`identifies "${v1}" == "${v2}"`, () => {
      expect(compareVersions(v1, v2)).toBe(0);
    });
  }
});

describe("compareVersions - major, minor, patch differences", () => {
  const greaterCases: Array<[string, string]> = [
    ["2.0.0", "1.9.9"],
    ["1.1.0", "1.0.9"],
    ["1.0.1", "1.0.0"],
    ["10.0.0", "9.9.9"],
    ["1.10.0", "1.9.0"],
    ["1.0.10", "1.0.9"],
    ["v2.0.0", "1.0.0"],
    ["1.0.0", "0.9.9"],
  ];

  for (const [v1, v2] of greaterCases) {
    it(`identifies "${v1}" > "${v2}"`, () => {
      expect(compareVersions(v1, v2)).toBe(1);
    });

    it(`identifies "${v2}" < "${v1}"`, () => {
      expect(compareVersions(v2, v1)).toBe(-1);
    });
  }
});

describe("compareVersions - pre-releases", () => {
  it("ranks normal release higher than pre-release of same numbers", () => {
    expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);
  });

  it("ranks beta higher than alpha", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
  });

  it("ranks rc higher than beta", () => {
    expect(compareVersions("1.0.0-rc", "1.0.0-beta")).toBe(1);
  });

  it("compares numeric pre-release identifiers numerically", () => {
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.1")).toBe(1);
    expect(compareVersions("1.0.0-alpha.10", "1.0.0-alpha.2")).toBe(1);
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
  });

  it("ranks longer pre-release parts higher when prefixes match", () => {
    expect(compareVersions("1.0.0-alpha.1.1", "1.0.0-alpha.1")).toBe(1);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.1.1")).toBe(-1);
  });
});

describe("compareVersions - invalid versions fallback", () => {
  it("returns 0 when left version is invalid", () => {
    expect(compareVersions("invalid", "1.0.0")).toBe(0);
  });

  it("returns 0 when right version is invalid", () => {
    expect(compareVersions("1.0.0", "not-a-version")).toBe(0);
  });

  it("returns 0 when both versions are invalid", () => {
    expect(compareVersions("foo", "bar")).toBe(0);
  });
});
