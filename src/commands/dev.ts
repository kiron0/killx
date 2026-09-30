import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { runKill } from "./kill";
import { CliError, EXIT_NOT_FOUND } from "../errors";
import { getCwdForPid, getProcessAncestry } from "../process/tree";
import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import type { PlatformProvider, ProcessInfo } from "../types";
import type { Printer } from "../output";

export const DEV_PROCESS_NAMES = new Set([
  "node",
  "bun",
  "deno",
  "npm",
  "yarn",
  "pnpm",
  "vite",
  "next",
  "next-server",
  "python",
  "python3",
  "django",
  "rails",
  "ruby",
  "php",
  "java",
  "cargo",
  "go",
  "air",
  "nodemon",
  "webpack",
  "esbuild",
  "turbo",
  "nuxt",
  "astro",
  "remix",
  "svelte",
  "nest",
  "flask",
  "uvicorn",
  "gunicorn",
  "fastapi",
]);

export interface DevCommandOptions {
  cwd?: string | undefined;
  force?: boolean | undefined;
  yes?: boolean | undefined;
  provider: PlatformProvider;
  printer: Printer;
  runner?: CommandRunner | undefined;
}

export interface DevProcessMatch {
  port: number;
  process: string;
  pid: number;
  cwd: string;
  displayPath: string;
  command: string;
}

export function findProjectRoot(startDir: string): string {
  let curr = resolve(startDir);
  const rootIndicators = [
    ".git",
    "package.json",
    "go.mod",
    "Cargo.toml",
    "pyproject.toml",
    "pom.xml",
    "build.gradle",
  ];

  while (true) {
    for (const indicator of rootIndicators) {
      if (existsSync(join(curr, indicator))) {
        return curr;
      }
    }
    const parent = dirname(curr);
    if (!parent || parent === curr) {
      break;
    }
    curr = parent;
  }
  return resolve(startDir);
}

export function isDevProcess(name: string, command = ""): boolean {
  const lowerName = name.toLowerCase().replace(/\.exe$/, "");
  if (DEV_PROCESS_NAMES.has(lowerName)) return true;
  const lowerCmd = command.toLowerCase();
  for (const devName of DEV_PROCESS_NAMES) {
    if (lowerCmd.includes(devName)) return true;
  }
  return false;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

export async function processBelongsToProject(
  proc: ProcessInfo,
  procCwd: string,
  projectRoot: string,
  runner: CommandRunner,
): Promise<boolean> {
  const normRoot = normalizePath(projectRoot);
  const projectName = basename(projectRoot).toLowerCase();

  if (procCwd) {
    const normCwd = normalizePath(procCwd);
    if (normCwd === normRoot || normCwd.startsWith(`${normRoot}/`)) {
      return true;
    }
  }

  if (proc.command) {
    const normCmd = normalizePath(proc.command);
    if (
      normCmd.includes(normRoot) ||
      normCmd.includes(`/${projectName}/`) ||
      normCmd.includes(`./${projectName}`)
    ) {
      return true;
    }
  }

  try {
    const ancestry = await getProcessAncestry(proc.pid, runner);
    for (const ancestor of ancestry) {
      if (ancestor.pid === proc.pid) continue;
      if (ancestor.cwd) {
        const normAncCwd = normalizePath(ancestor.cwd);
        if (normAncCwd === normRoot || normAncCwd.startsWith(`${normRoot}/`)) {
          return true;
        }
      }
      if (ancestor.command) {
        const normAncCmd = normalizePath(ancestor.command);
        if (
          normAncCmd.includes(normRoot) ||
          normAncCmd.includes(`/${projectName}/`)
        ) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }

  return false;
}

export async function runDevCommand(options: DevCommandOptions): Promise<void> {
  const {
    cwd,
    force = false,
    yes = false,
    provider,
    printer,
    runner = defaultCommandRunner,
  } = options;
  const listeners = await provider.list();

  const candidateListeners: ProcessInfo[] = [];
  const seenPort = new Set<number>();
  for (const item of listeners) {
    if (isDevProcess(item.process, item.command) && !seenPort.has(item.port)) {
      candidateListeners.push(item);
      seenPort.add(item.port);
    }
  }

  if (candidateListeners.length === 0) {
    throw new CliError(EXIT_NOT_FOUND, "• No development servers found");
  }

  if (!cwd) {
    const ports = candidateListeners.map((l) => l.port);
    await runKill({
      ports,
      hasRange: true,
      force,
      yes,
      timeoutMs: 0,
      provider,
      printer,
    });
    return;
  }

  const projectRoot = findProjectRoot(cwd);
  const projectName = basename(projectRoot);

  const found: DevProcessMatch[] = [];
  const ignored: DevProcessMatch[] = [];

  for (const proc of candidateListeners) {
    const procCwd = await getCwdForPid(proc.pid, runner);
    const belongs = await processBelongsToProject(
      proc,
      procCwd,
      projectRoot,
      runner,
    );

    const rel = procCwd ? relative(process.cwd(), procCwd) : "";
    const displayPath = procCwd
      ? rel.startsWith(".")
        ? rel
        : `./${rel}`
      : `./${projectName}`;

    const matchInfo: DevProcessMatch = {
      port: proc.port,
      process: proc.process,
      pid: proc.pid,
      cwd: procCwd,
      displayPath,
      command: proc.command,
    };

    if (belongs) {
      found.push(matchInfo);
    } else {
      ignored.push(matchInfo);
    }
  }

  if (found.length === 0) {
    if (!printer.json) {
      if (ignored.length > 0) {
        printer.line("Ignored:");
        for (const item of ignored) {
          printer.line(
            `:${item.port}  ${item.process.padEnd(8)}  ${item.displayPath}`,
          );
        }
        printer.line("");
      }
    }
    throw new CliError(
      EXIT_NOT_FOUND,
      `• No development servers found for project "${projectName}"`,
    );
  }

  if (!printer.quiet && !printer.json) {
    printer.line("Found:");
    for (const item of found) {
      printer.line(
        `:${item.port}  ${item.process.padEnd(8)}  ${item.displayPath}`,
      );
    }
    if (ignored.length > 0) {
      printer.line("");
      printer.line("Ignored:");
      for (const item of ignored) {
        printer.line(
          `:${item.port}  ${item.process.padEnd(8)}  ${item.displayPath}`,
        );
      }
    }
    printer.line("");
  }

  const portsToKill = found.map((f) => f.port);
  await runKill({
    ports: portsToKill,
    hasRange: portsToKill.length > 1,
    force,
    yes,
    timeoutMs: 0,
    provider,
    printer,
  });
}
