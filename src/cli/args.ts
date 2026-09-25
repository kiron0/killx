export type CliCommand =
  | "kill"
  | "info"
  | "check"
  | "list"
  | "free"
  | "process"
  | "dev"
  | "wait"
  | "watch";

export interface ParsedArgs {
  command?: CliCommand | undefined;
  positionals: string[];
  flags: {
    json?: boolean | undefined;
    quiet?: boolean | undefined;
    verbose?: boolean | undefined;
    force?: boolean | undefined;
    yes?: boolean | undefined;
    timeout?: number | undefined;
    occupied?: boolean | undefined;
    interval?: number | undefined;
    kill?: boolean | undefined;
    help?: boolean | undefined;
    version?: boolean | undefined;
  };
}

const COMMAND_ALIASES: Record<string, CliCommand> = {
  kill: "kill",
  info: "info",
  i: "info",
  check: "check",
  c: "check",
  list: "list",
  ls: "list",
  free: "free",
  process: "process",
  ps: "process",
  dev: "dev",
  wait: "wait",
  watch: "watch",
};

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const flags: ParsedArgs["flags"] = {};
  const rawPositionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--json" || arg === "-j") {
      flags.json = true;
    } else if (arg === "--quiet" || arg === "-q") {
      flags.quiet = true;
    } else if (arg === "--verbose" || arg === "-v") {
      flags.verbose = true;
    } else if (arg === "--force" || arg === "-f") {
      flags.force = true;
    } else if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version") {
      flags.version = true;
    } else if (arg === "--occupied") {
      flags.occupied = true;
    } else if (arg === "--kill") {
      flags.kill = true;
    } else if (arg === "--timeout") {
      const next = argv[++i];
      if (!next || isNaN(Number(next))) {
        throw new Error("option '--timeout' requires a numeric value");
      }
      flags.timeout = Number(next);
    } else if (arg.startsWith("--timeout=")) {
      const val = arg.slice("--timeout=".length);
      if (!val || isNaN(Number(val))) {
        throw new Error("option '--timeout' requires a numeric value");
      }
      flags.timeout = Number(val);
    } else if (arg === "--interval") {
      const next = argv[++i];
      if (!next || isNaN(Number(next))) {
        throw new Error("option '--interval' requires a numeric value");
      }
      flags.interval = Number(next);
    } else if (arg.startsWith("--interval=")) {
      const val = arg.slice("--interval=".length);
      if (!val || isNaN(Number(val))) {
        throw new Error("option '--interval' requires a numeric value");
      }
      flags.interval = Number(val);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option "${arg}"`);
    } else {
      rawPositionals.push(arg);
    }
  }

  if (rawPositionals.length === 0) {
    return { positionals: [], flags };
  }

  const first = rawPositionals[0]!;
  if (first in COMMAND_ALIASES) {
    return {
      command: COMMAND_ALIASES[first],
      positionals: rawPositionals.slice(1),
      flags,
    };
  }

  // Shorthand: numeric or port range positionals default to "kill"
  // e.g. killx 3000 -> kill 3000
  return {
    command: "kill",
    positionals: rawPositionals,
    flags,
  };
}
