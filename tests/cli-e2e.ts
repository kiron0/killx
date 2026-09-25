import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cli = join(process.cwd(), "dist", "cli.js");

async function runCliE2E() {
  // Test --version
  const version = await execFileAsync(process.execPath, [cli, "--version"]);
  assert.ok(version.stdout.includes("killx"));

  // Test --help
  const help = await execFileAsync(process.execPath, [cli, "--help"]);
  assert.ok(help.stdout.includes("killx <port...>"));

  // Test free
  const free = await execFileAsync(process.execPath, [cli, "free", "49152"]);
  const freePort = Number(free.stdout.trim());
  assert.ok(freePort >= 49152);

  // Test check with server
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(freePort, "127.0.0.1", () => resolve()),
  );

  try {
    const checkOccupied = await execFileAsync(process.execPath, [
      cli,
      "check",
      String(freePort),
      "--json",
    ]).catch((err: { stdout: string; code: number }) => err);
    assert.ok(checkOccupied.stdout.includes('"available": false'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // After close, check available
  const checkFree = await execFileAsync(process.execPath, [
    cli,
    "check",
    String(freePort),
    "--json",
  ]);
  assert.ok(checkFree.stdout.includes('"available": true'));
}

void runCliE2E().then(() => {
  console.log("✓ E2E CLI tests passed");
});
