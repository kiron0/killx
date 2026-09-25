import {
  cancel,
  confirm,
  intro,
  isCancel,
  multiselect,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_INVALID_ARGUMENTS,
  EXIT_SUCCESS,
  invalid,
} from "../errors";
import { Printer, printThanks } from "../output";
import { createPlatformProvider } from "../platform";
import { expandPorts } from "../port/parser";
import { parseCliArgs, type ParsedArgs } from "./args";
import {
  runCheckCommand,
  runDevCommand,
  runFreeCommand,
  runInfoCommand,
  runKill,
  runListCommand,
  runProcessCommand,
  runWaitCommand,
  runWatchCommand,
} from "../commands";
import {
  checkForUpdate,
  checkUpdateManually,
  ignoreUpdateVersion,
  installUpdate,
  type UpdateInfo,
} from "../update";
import type { PlatformProvider, ProcessInfo } from "../types";

export async function getPackageVersion(): Promise<string> {
  for (const dir of [
    join(import.meta.dirname, ".."),
    join(import.meta.dirname, "../.."),
  ]) {
    try {
      const pkgPath = join(dir, "package.json");
      const content = await readFile(pkgPath, "utf8");
      const parsed = JSON.parse(content) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // try next
    }
  }
  return "0.1.0";
}

export function printHelp(printer: Printer): void {
  printer.line(`killx - Find and kill processes by port

Usage:
  killx                       Interactive Clack UI (inspect/kill listening ports)
  killx <port...>             Kill listeners on specified ports
  killx kill <port...>        Kill listeners on specified ports
  killx info <port>           Show listener details (alias: i)
  killx check <port>          Check port availability (alias: c)
  killx check-update          Check npm registry for updates
  killx update                Update killx to latest version
  killx list [range]          List listening ports (alias: ls)
  killx free [port]           Find a free port
  killx ps [query]            Search processes (alias: process)
  killx dev                   Stop common development servers
  killx wait <port>           Wait for port state
  killx watch <port>          Watch port changes

Options:
  -f, --force                 Send SIGKILL immediately
  -y, --yes                   Skip safety confirmation
  -q, --quiet                 Suppress successful output
  -j, --json                  Write JSON output
  -v, --verbose               Show extra error detail
      --timeout <seconds>     Seconds before escalating SIGTERM to SIGKILL
      --occupied              Wait until port becomes occupied (for wait)
      --interval <ms>         Poll interval in ms (for watch)
      --kill                  Terminate matching processes (for ps)
      --check-update          Check for package updates
      --no-update-check       Disable automated update check
  -h, --help                  Show help
      --version               Show version
`);
}

async function handleUpdateCheck(
  currentVersion: string,
  args: ParsedArgs,
): Promise<void> {
  const update = await checkForUpdate(currentVersion);
  if (!update) return;

  if (
    args.flags.json ||
    args.flags.yes ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  ) {
    process.stderr.write(updateNotice(update) + "\n");
    return;
  }

  console.log(
    `Update available · ${update.currentVersion} → ${update.latestVersion}\nRelease notes: ${update.releaseUrl}`,
  );
  const action = await select({
    message: "Update killx?",
    options: [
      { value: "update", label: "Update now", hint: "npm install --global" },
      { value: "skip", label: "Skip" },
      {
        value: "ignore",
        label: "Skip this version",
        hint: `hide ${update.latestVersion}`,
      },
    ],
    initialValue: "update",
  });
  if (isCancel(action)) {
    cancel("Cancelled.");
    printThanks();
    return;
  }
  if (action === "skip") return;
  if (action === "ignore") {
    await ignoreUpdateVersion(update.latestVersion);
    return;
  }

  console.log(`Updating to ${update.latestVersion}...`);
  await installUpdate(update.latestVersion);
  outro(`Updated to ${update.latestVersion}. Restart killx to use it.`);
}

async function handleManualUpdateCheck(
  version: string,
  args: ParsedArgs,
): Promise<void> {
  const isInteractive =
    !args.flags.json && Boolean(process.stdout.isTTY && process.stdin.isTTY);

  if (args.flags.json) {
    const result = await checkUpdateManually(version, {
      force: args.flags.force,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (isInteractive) {
    intro("killx update check");
    const checkSpinner = spinner();
    checkSpinner.start("Checking npm registry for updates");
    const result = await checkUpdateManually(version, {
      force: args.flags.force,
    });
    if (result.rateLimited) {
      checkSpinner.stop(
        `Checked recently (rate limited, 60s cooldown). Latest: v${result.latestVersion}`,
      );
    } else if (result.updateAvailable) {
      checkSpinner.stop(
        `Update available: ${result.currentVersion} → ${result.latestVersion}`,
      );
    } else {
      checkSpinner.stop(`Up to date (v${result.currentVersion})`);
    }

    if (result.updateAvailable) {
      const answer = await select({
        message: `Install v${result.latestVersion} now?`,
        options: [
          {
            value: "install",
            label: "Install update now",
            hint: "npm install --global",
          },
          { value: "skip", label: "Skip for now" },
        ],
        initialValue: "install",
      });
      if (isCancel(answer)) {
        cancel("Cancelled.");
        printThanks();
        return;
      }
      if (answer === "install") {
        console.log(`Updating to ${result.latestVersion}...`);
        await installUpdate(result.latestVersion);
        outro(`Updated to ${result.latestVersion}. Restart killx to use it.`);
      }
    }
    printThanks();
    return;
  }

  const result = await checkUpdateManually(version, {
    force: args.flags.force,
  });
  if (result.updateAvailable) {
    console.log(
      `Update available: ${result.currentVersion} → ${result.latestVersion}`,
    );
    console.log("Run: npm install --global killx@latest");
  } else {
    console.log(`killx is up to date (${result.currentVersion})`);
  }
  if (result.rateLimited) {
    console.log(
      "(Checked recently with 60s rate limit; use --force to bypass)",
    );
  }
  printThanks();
}

function updateNotice(update: UpdateInfo): string {
  return `Update available: ${update.currentVersion} → ${update.latestVersion}. Run: npm install --global killx@latest`;
}

async function runInteractiveMenu(
  provider: PlatformProvider,
  printer: Printer,
  flags: ParsedArgs["flags"],
): Promise<number> {
  intro("killx");
  const scanSpinner = spinner();
  scanSpinner.start("Scanning listening ports");
  const listeners = await provider.list();
  scanSpinner.stop(`Found ${listeners.length} listening process(es)`);

  if (listeners.length === 0) {
    printer.line("No listening ports found.");
    printThanks();
    return EXIT_SUCCESS;
  }

  // Deduplicate and group by port
  const portMap = new Map<number, ProcessInfo[]>();
  for (const proc of listeners) {
    const list = portMap.get(proc.port) ?? [];
    list.push(proc);
    portMap.set(proc.port, list);
  }

  const sortedPorts = Array.from(portMap.keys()).sort((a, b) => a - b);

  const selectedPorts = await multiselect({
    message: "Select ports (Space to toggle, Enter to proceed)",
    options: sortedPorts.map((port) => {
      const procs = portMap.get(port)!;
      const desc = procs
        .map((p) => `${p.process} (PID ${p.pid}${p.user ? `, ${p.user}` : ""})`)
        .join(" | ");
      return {
        value: port,
        label: `:${port}`,
        hint: desc,
      };
    }),
    required: false,
  });

  if (isCancel(selectedPorts)) {
    cancel("Cancelled.");
    printThanks();
    return EXIT_SUCCESS;
  }

  if (selectedPorts.length === 0) {
    printer.line("No ports selected.");
    printThanks();
    return EXIT_SUCCESS;
  }

  const action = await select({
    message: `Action for selected port(s): ${selectedPorts.join(", ")}`,
    options: [
      { value: "kill", label: "Kill processes", hint: "SIGTERM / graceful" },
      {
        value: "force",
        label: "Force kill processes",
        hint: "SIGKILL immediately",
      },
      { value: "info", label: "Inspect listener details" },
      { value: "check", label: "Check availability" },
    ],
    initialValue: "kill",
  });

  if (isCancel(action)) {
    cancel("Cancelled.");
    printThanks();
    return EXIT_SUCCESS;
  }

  if (action === "kill" || action === "force") {
    const isForce = action === "force" || Boolean(flags.force);
    const confirmed = flags.yes
      ? true
      : await confirm({
          message: `${isForce ? "Force kill" : "Kill"} selected ${selectedPorts.length} port(s)?`,
          initialValue: true,
        });

    if (isCancel(confirmed) || !confirmed) {
      cancel("Cancelled.");
      printThanks();
      return EXIT_SUCCESS;
    }

    await runKill({
      ports: selectedPorts,
      force: isForce,
      yes: true,
      timeoutMs: (flags.timeout ?? 0) * 1000,
      provider,
      printer,
    });
    printThanks();
    return EXIT_SUCCESS;
  }

  if (action === "info") {
    for (const port of selectedPorts) {
      await runInfoCommand(String(port), provider, printer);
    }
    printThanks();
    return EXIT_SUCCESS;
  }

  if (action === "check") {
    for (const port of selectedPorts) {
      await runCheckCommand(String(port), provider, printer);
    }
    printThanks();
    return EXIT_SUCCESS;
  }

  printThanks();
  return EXIT_SUCCESS;
}

export async function runCli(argv: readonly string[]): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`✗ ${message}\n`);
    return EXIT_INVALID_ARGUMENTS;
  }

  const printer = new Printer({
    json: parsed.flags.json,
    quiet: parsed.flags.quiet,
  });

  if (parsed.flags.help) {
    printHelp(printer);
    if (!parsed.flags.json) printThanks();
    return EXIT_SUCCESS;
  }

  if (parsed.flags.version) {
    const version = await getPackageVersion();
    printer.line(`killx ${version}`);
    if (!parsed.flags.json) printThanks();
    return EXIT_SUCCESS;
  }

  const version = await getPackageVersion();

  if (parsed.command === "check-update" || parsed.flags.checkUpdate) {
    await handleManualUpdateCheck(version, parsed);
    return EXIT_SUCCESS;
  }

  if (parsed.command === "update") {
    await handleManualUpdateCheck(version, {
      ...parsed,
      flags: { ...parsed.flags, force: true },
    });
    return EXIT_SUCCESS;
  }

  if (
    !parsed.flags.noUpdateCheck &&
    process.env.KILLX_NO_UPDATE_CHECK !== "1" &&
    !parsed.flags.json
  ) {
    await handleUpdateCheck(version, parsed);
  }

  const provider = createPlatformProvider();

  // If no command and no positionals: launch Clack UI if interactive TTY
  if (!parsed.command) {
    if (process.stdin.isTTY && process.stdout.isTTY && !parsed.flags.json) {
      return await runInteractiveMenu(provider, printer, parsed.flags);
    }
    printHelp(printer);
    printThanks();
    return EXIT_SUCCESS;
  }

  try {
    switch (parsed.command) {
      case "kill": {
        if (parsed.positionals.length === 0) {
          if (
            process.stdin.isTTY &&
            process.stdout.isTTY &&
            !parsed.flags.json
          ) {
            return await runInteractiveMenu(provider, printer, parsed.flags);
          }
          throw invalid("provide at least one port");
        }
        const { ports, hasRange } = expandPorts(parsed.positionals);
        const timeoutSeconds = parsed.flags.timeout ?? 0;
        if (timeoutSeconds < 0) {
          throw invalid("timeout cannot be negative");
        }
        await runKill({
          ports,
          hasRange,
          force: parsed.flags.force,
          yes: parsed.flags.yes,
          timeoutMs: timeoutSeconds * 1000,
          provider,
          printer,
        });
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "info": {
        if (parsed.positionals.length !== 1) {
          throw invalid("info requires one port");
        }
        await runInfoCommand(parsed.positionals[0]!, provider, printer);
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "check": {
        if (parsed.positionals.length !== 1) {
          throw invalid("check requires one port");
        }
        await runCheckCommand(parsed.positionals[0]!, provider, printer);
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "list": {
        if (parsed.positionals.length > 1) {
          throw invalid("list accepts at most one port or range");
        }
        await runListCommand(parsed.positionals[0], provider, printer);
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "free": {
        if (parsed.positionals.length > 1) {
          throw invalid("free accepts at most one starting port");
        }
        await runFreeCommand(parsed.positionals[0], printer);
        return EXIT_SUCCESS;
      }

      case "process": {
        if (parsed.positionals.length > 1) {
          throw invalid("process accepts one search query");
        }
        await runProcessCommand(
          {
            query: parsed.positionals[0],
            kill: parsed.flags.kill,
            force: parsed.flags.force,
            yes: parsed.flags.yes,
          },
          printer,
        );
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "dev": {
        if (parsed.positionals.length !== 0) {
          throw invalid("dev accepts no arguments");
        }
        await runDevCommand({
          force: parsed.flags.force,
          yes: parsed.flags.yes,
          provider,
          printer,
        });
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "wait": {
        if (parsed.positionals.length !== 1) {
          throw invalid("wait requires one port");
        }
        await runWaitCommand({
          portArg: parsed.positionals[0]!,
          timeoutSeconds: parsed.flags.timeout,
          occupied: parsed.flags.occupied,
          provider,
          printer,
        });
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      case "watch": {
        if (parsed.positionals.length !== 1) {
          throw invalid("watch requires one port");
        }
        await runWatchCommand({
          portArg: parsed.positionals[0]!,
          intervalMs: parsed.flags.interval,
          provider,
          printer,
        });
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
      }

      default:
        printHelp(printer);
        if (!parsed.flags.json) printThanks();
        return EXIT_SUCCESS;
    }
  } catch (error: unknown) {
    if (error instanceof CliError) {
      if (error.message) {
        process.stderr.write(`${error.message}\n`);
      }
      return error.code;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`✗ ${message}\n`);
    return EXIT_GENERIC;
  }
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    process.once("SIGINT", () => {
      printThanks();
      process.exit(130);
    });
  }
  const code = await runCli(process.argv.slice(2));
  if (code !== EXIT_SUCCESS) {
    process.exit(code);
  }
}

// Only auto-execute if called directly as entry point
const scriptPath = process.argv[1] ?? "";
const isDirectCli =
  Boolean(scriptPath) &&
  (scriptPath.endsWith("cli.js") || scriptPath.endsWith("cli.ts"));

if (isDirectCli) {
  void main();
}
