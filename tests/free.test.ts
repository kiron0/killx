import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { findFreePort, isPortAvailable } from "../src/port/free";

describe("findFreePort", () => {
  it("skips currently occupied ports", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      return;
    }

    const occupiedPort = addr.port;
    const availableBefore = await isPortAvailable(occupiedPort);
    expect(availableBefore).toBe(false);

    const free = await findFreePort(occupiedPort);
    expect(free).not.toBe(occupiedPort);
    expect(free).toBeGreaterThan(occupiedPort);

    await new Promise<void>((resolve) => server.close(() => resolve()));
    const availableAfter = await isPortAvailable(occupiedPort);
    expect(availableAfter).toBe(true);
  });
});
