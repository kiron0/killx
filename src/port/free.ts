import { createServer } from "node:net";
import { MAX_PORT, MIN_PORT } from "./parser";

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

export async function findFreePort(startPort = 3000): Promise<number> {
  const normalizedStart = Math.max(MIN_PORT, startPort);
  for (let candidate = normalizedStart; candidate <= MAX_PORT; candidate++) {
    const available = await isPortAvailable(candidate);
    if (available) {
      return candidate;
    }
  }
  throw new Error("no available port found");
}
