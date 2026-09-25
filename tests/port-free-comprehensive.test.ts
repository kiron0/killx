import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { findFreePort, isPortAvailable } from "../src/port/free";

describe("isPortAvailable with actual sockets", () => {
  it("returns true for a dynamically allocated available port", async () => {
    const port = await findFreePort(35000);
    const available = await isPortAvailable(port);
    expect(available).toBe(true);
  });

  it("returns false when a port is currently listening", async () => {
    const port = await findFreePort(36000);
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    try {
      const available = await isPortAvailable(port);
      expect(available).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns true again once the server is closed", async () => {
    const port = await findFreePort(37000);
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", () => resolve());
    });

    await new Promise<void>((resolve) => server.close(() => resolve()));
    const available = await isPortAvailable(port);
    expect(available).toBe(true);
  });

  const checkPorts = [38001, 38002, 38003, 38004, 38005];
  for (const p of checkPorts) {
    it(`checks availability for port ${p}`, async () => {
      const res = await isPortAvailable(p);
      expect(typeof res).toBe("boolean");
    });
  }
});

describe("findFreePort with various starting ports", () => {
  it("finds a free port with default startPort (3000)", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("finds a free port starting at 8000", async () => {
    const port = await findFreePort(8000);
    expect(port).toBeGreaterThanOrEqual(8000);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("finds a free port starting at 40000", async () => {
    const port = await findFreePort(40000);
    expect(port).toBeGreaterThanOrEqual(40000);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("clamps startPort below 1 to MIN_PORT (1)", async () => {
    const port = await findFreePort(0);
    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("clamps negative startPort to MIN_PORT (1)", async () => {
    const port = await findFreePort(-500);
    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it("skips occupied port and returns next available candidate", async () => {
    const basePort = await findFreePort(45000);
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(basePort, "127.0.0.1", () => resolve());
    });

    try {
      const nextPort = await findFreePort(basePort);
      expect(nextPort).toBeGreaterThan(basePort);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const rangeStarts = [
    10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000,
    21000, 22000, 23000, 24000, 25000, 26000, 27000, 28000, 29000,
  ];

  for (const start of rangeStarts) {
    it(`finds available port starting from ${start}`, async () => {
      const p = await findFreePort(start);
      expect(p).toBeGreaterThanOrEqual(start);
    });
  }
});
