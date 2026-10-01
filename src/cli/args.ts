import { parsePort } from "../port/parser";

export type CliCommand =
  | "kill"
  | "info"
  | "check"
  | "list"
  | "free"
  | "process"
  | "dev"
  | "wait"
  | "watch"
  | "check-update"
  | "update"
  | "run"
  | "trace";

export interface ParsedArgs {
  command?: CliCommand | undefined;
  positionals: string[];
  runCommand?: string[] | undefined;
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
    process?: string | undefined;
    port?: number | undefined;
    noColor?: boolean | undefined;
    interactive?: boolean | undefined;
    checkUpdate?: boolean | undefined;
    noUpdateCheck?: boolean | undefined;
    tree?: boolean | undefined;
    cwd?: string | undefined;
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
  "check-update": "check-update",
  update: "update",
  run: "run",
  r: "run",
  trace: "trace",
};

type BooleanFlagKey =
  | "json"
  | "quiet"
  | "verbose"
  | "force"
  | "yes"
  | "help"
  | "version"
  | "checkUpdate"
  | "noUpdateCheck"
  | "occupied"
  | "kill"
  | "noColor"
  | "interactive"
  | "tree";

const BOOLEAN_FLAGS: Record<string, BooleanFlagKey> = {
  "--json": "json",
  "-j": "json",
  "--quiet": "quiet",
  "-q": "quiet",
  "--verbose": "verbose",
  "-v": "verbose",
  "--force": "force",
  "-f": "force",
  "--yes": "yes",
  "-y": "yes",
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "--check-update": "checkUpdate",
  "--no-update-check": "noUpdateCheck",
  "--occupied": "occupied",
  "--kill": "kill",
  "--no-color": "noColor",
  "--interactive": "interactive",
  "-i": "interactive",
  "-I": "interactive",
  "--tree": "tree",
  "-t": "tree",
};

function readOptionValue(
  name: string,
  arg: string,
  argv: readonly string[],
  cursor: { index: number },
): string | undefined {
  if (arg === `--${name}`) {
    const next = argv[++cursor.index];
    if (!next) {
      throw new Error(`option '--${name}' requires a value`);
    }
    return next;
  }
  if (arg.startsWith(`--${name}=`)) {
    const val = arg.slice(`--${name}=`.length);
    if (!val) {
      throw new Error(`option '--${name}' requires a value`);
    }
    return val;
  }
  return undefined;
}

function readNumericOption(
  name: string,
  arg: string,
  argv: readonly string[],
  cursor: { index: number },
): number | undefined {
  const isMatch = arg === `--${name}` || arg.startsWith(`--${name}=`);
  if (!isMatch) return undefined;

  let raw: string | undefined;
  if (arg === `--${name}`) {
    raw = argv[++cursor.index];
  } else {
    raw = arg.slice(`--${name}=`.length);
  }

  if (!raw || isNaN(Number(raw))) {
    throw new Error(`option '--${name}' requires a numeric value`);
  }
  return Number(raw);
}

export function parseCliArgs(argv: readonly string[]): ParsedArgs {
  const flags: ParsedArgs["flags"] = {};
  const rawPositionals: string[] = [];
  let runCommand: string[] | undefined;
  const cursor = { index: 0 };

  for (; cursor.index < argv.length; cursor.index++) {
    const arg = argv[cursor.index]!;

    if (arg === "--") {
      runCommand = argv.slice(cursor.index + 1);
      break;
    }

    const boolFlag = BOOLEAN_FLAGS[arg];
    if (boolFlag) {
      flags[boolFlag] = true;
      continue;
    }

    const timeout = readNumericOption("timeout", arg, argv, cursor);
    if (timeout !== undefined) {
      flags.timeout = timeout;
      continue;
    }

    const interval = readNumericOption("interval", arg, argv, cursor);
    if (interval !== undefined) {
      flags.interval = interval;
      continue;
    }

    const processVal = readOptionValue("process", arg, argv, cursor);
    if (processVal !== undefined) {
      flags.process = processVal;
      continue;
    }

    const portVal = readNumericOption("port", arg, argv, cursor);
    if (portVal !== undefined) {
      flags.port = parsePort(portVal);
      continue;
    }

    const cwdVal = readOptionValue("cwd", arg, argv, cursor);
    if (cwdVal !== undefined) {
      flags.cwd = cwdVal;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`unknown option "${arg}"`);
    }

    rawPositionals.push(arg);
  }

  if (rawPositionals.length === 0) {
    return { positionals: [], flags, runCommand };
  }

  const first = rawPositionals[0]!;
  if (first in COMMAND_ALIASES) {
    const cmd = COMMAND_ALIASES[first];
    let positionals = rawPositionals.slice(1);

    if (cmd === "run" && !runCommand && positionals.length > 0) {
      const portPos: string[] = [];
      const cmdPos: string[] = [];
      let foundCommand = false;
      for (const p of positionals) {
        if (!foundCommand && (/^\d+(?:-\d+)?$/.test(p) || p.includes(","))) {
          portPos.push(p);
        } else {
          foundCommand = true;
          cmdPos.push(p);
        }
      }
      if (cmdPos.length > 0) {
        positionals = portPos;
        runCommand = cmdPos;
      }
    }

    return {
      command: cmd,
      positionals,
      runCommand,
      flags,
    };
  }

  return {
    command: "kill",
    positionals: rawPositionals,
    runCommand,
    flags,
  };
}
