import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CliError,
  EXIT_GENERIC,
  EXIT_INVALID_ARGUMENTS,
  EXIT_SUCCESS,
  invalid,
} from "../errors";
import { Printer } from "../output";
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

export async function getPackageVersion(): Promise<string> {
  try {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const content = await readFile(pkgPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export function printHelp(printer: Printer): void {
  printer.line(`killx - Find and kill processes by port

Usage:
  killx <port...>             Kill listeners on specified ports
  killx kill <port...>        Kill listeners on specified ports
  killx info <port>           Show listener details (alias: i)
  killx check <port>          Check port availability (alias: c)
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
  -h, --help                  Show help
      --version               Show version
`);
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
    return EXIT_SUCCESS;
  }

  if (parsed.flags.version) {
    const version = await getPackageVersion();
    printer.line(`killx ${version}`);
    return EXIT_SUCCESS;
  }

  if (!parsed.command) {
    printHelp(printer);
    return EXIT_SUCCESS;
  }

  const provider = createPlatformProvider();

  try {
    switch (parsed.command) {
      case "kill": {
        if (parsed.positionals.length === 0) {
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
        return EXIT_SUCCESS;
      }

      case "info": {
        if (parsed.positionals.length !== 1) {
          throw invalid("info requires one port");
        }
        await runInfoCommand(parsed.positionals[0]!, provider, printer);
        return EXIT_SUCCESS;
      }

      case "check": {
        if (parsed.positionals.length !== 1) {
          throw invalid("check requires one port");
        }
        await runCheckCommand(parsed.positionals[0]!, provider, printer);
        return EXIT_SUCCESS;
      }

      case "list": {
        if (parsed.positionals.length > 1) {
          throw invalid("list accepts at most one port or range");
        }
        await runListCommand(parsed.positionals[0], provider, printer);
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
        return EXIT_SUCCESS;
      }

      default:
        printHelp(printer);
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
