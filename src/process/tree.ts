import { homedir } from "node:os";
import { defaultCommandRunner, type CommandRunner } from "../platform/command";
import {
  isProcessAlive,
  sendSignal,
  sendSignalWindows,
  waitUntilGone,
} from "./kill";
import type { ProcessTreeNode, SignalName, TerminateOptions } from "../types";

export interface ProcessRawInfo {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  user?: string | undefined;
}

export const TERMINAL_OR_INIT_NAMES = new Set([
  "launchd",
  "systemd",
  "init",
  "login",
  "sshd",
  "tmux",
  "screen",
  "iterm2",
  "alacritty",
  "kitty",
  "terminal",
  "gnome-terminal",
  "code",
  "explorer",
  "explorer.exe",
  "system",
  "wt",
  "wt.exe",
]);

export const SHELL_NAMES = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "csh",
  "tcsh",
  "dash",
  "ksh",
  "ion",
  "nu",
  "xonsh",
  "cmd",
  "cmd.exe",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
]);

const SHELL_OR_ROOT_NAMES = new Set([
  ...TERMINAL_OR_INIT_NAMES,
  ...SHELL_NAMES,
]);

export function isTerminalOrInit(name: string): boolean {
  const base = name
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/\.exe$/, "");
  return TERMINAL_OR_INIT_NAMES.has(base);
}

export function isShell(name: string): boolean {
  const base = name
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/\.exe$/, "");
  return SHELL_NAMES.has(base);
}

export function isShellOrRoot(name: string): boolean {
  const base = name
    .toLowerCase()
    .replace(/^.*\//, "")
    .replace(/\.exe$/, "");
  return SHELL_OR_ROOT_NAMES.has(base);
}

export async function getCwdForPid(
  pid: number,
  runner: CommandRunner = defaultCommandRunner,
): Promise<string> {
  if (pid <= 1) return "";
  if (process.platform === "win32") {
    return "";
  }
  try {
    const stdout = await runner("lsof", [
      "-a",
      "-p",
      String(pid),
      "-d",
      "cwd",
      "-Fn",
    ]);
    for (const line of stdout.split("\n")) {
      if (line.startsWith("n/")) {
        return line.slice(1).trim();
      }
    }
  } catch {}

  if (process.platform === "linux") {
    try {
      const stdout = await runner("readlink", [`/proc/${pid}/cwd`]);
      const res = stdout.trim();
      if (res) return res;
    } catch {}
  }

  return "";
}

export async function getStartTimeForPid(
  pid: number,
  runner: CommandRunner = defaultCommandRunner,
): Promise<string> {
  if (pid <= 1) return "";
  if (process.platform === "win32") {
    return "";
  }
  try {
    const stdout = await runner("ps", ["-p", String(pid), "-o", "lstart="]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getAllProcesses(
  runner: CommandRunner = defaultCommandRunner,
): Promise<Map<number, ProcessRawInfo>> {
  const map = new Map<number, ProcessRawInfo>();

  if (process.platform === "win32") {
    const script = `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
    try {
      const stdout = await runner("powershell", [
        "-NoProfile",
        "-Command",
        script,
      ]);
      const raw = JSON.parse(stdout.trim() || "[]") as Array<{
        ProcessId?: number;
        ParentProcessId?: number;
        Name?: string;
        CommandLine?: string;
      }>;
      const list = Array.isArray(raw) ? raw : [raw];
      for (const item of list) {
        const pid = item.ProcessId ?? 0;
        if (!pid) continue;
        map.set(pid, {
          pid,
          ppid: item.ParentProcessId ?? 0,
          name: (item.Name ?? "unknown").replace(/\.exe$/i, ""),
          command: item.CommandLine ?? item.Name ?? "",
        });
      }
    } catch {}
    return map;
  }

  try {
    const stdout = await runner("ps", [
      "-axo",
      "pid=,ppid=,user=,comm=,command=",
    ]);
    const lines = stdout.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const fields = line.split(/\s+/);
      if (fields.length < 5) continue;
      const pid = Number(fields[0]);
      const ppid = Number(fields[1]);
      const user = fields[2] ?? "";
      const comm = fields[3] ?? "";
      const command = fields.slice(4).join(" ");
      if (pid) {
        const name = comm.replace(/^.*\//, "");
        map.set(pid, {
          pid,
          ppid,
          user,
          name,
          command,
        });
      }
    }
  } catch {}

  return map;
}

export interface GetProcessAncestryOptions {
  fullInfo?: boolean | undefined;
}

export async function getProcessAncestry(
  listenerPid: number,
  runner: CommandRunner = defaultCommandRunner,
  procMap?: Map<number, ProcessRawInfo>,
  options?: GetProcessAncestryOptions,
): Promise<ProcessTreeNode[]> {
  const processMap = procMap ?? (await getAllProcesses(runner));
  const ancestry: ProcessTreeNode[] = [];
  const seen = new Set<number>();

  let curr: number | undefined = listenerPid;
  while (curr && curr > 1 && !seen.has(curr)) {
    seen.add(curr);
    const raw = processMap.get(curr);
    if (!raw) break;

    const isListener = curr === listenerPid;
    const node: ProcessTreeNode = {
      pid: raw.pid,
      ppid: raw.ppid,
      name: raw.name,
      command: raw.command,
      user: raw.user,
      isListener,
    };

    ancestry.push(node);

    if (isTerminalOrInit(raw.name) || raw.ppid <= 1) {
      break;
    }

    if (isShell(raw.name)) {
      const parent = processMap.get(raw.ppid);
      if (!parent || parent.pid <= 1 || isTerminalOrInit(parent.name)) {
        break;
      }
    }

    curr = raw.ppid;
  }

  if (options?.fullInfo) {
    for (const node of ancestry) {
      node.cwd = await getCwdForPid(node.pid, runner);
      node.startTime = await getStartTimeForPid(node.pid, runner);
    }
  } else if (ancestry.length > 0) {
    const listenerNode = ancestry[0]!;
    listenerNode.cwd = await getCwdForPid(listenerNode.pid, runner);
    listenerNode.startTime = await getStartTimeForPid(listenerNode.pid, runner);
  }

  return ancestry;
}

export function getSupervisorRoot(
  ancestry: readonly ProcessTreeNode[],
): ProcessTreeNode | null {
  if (ancestry.length === 0) return null;
  for (let i = ancestry.length - 1; i >= 0; i--) {
    const node = ancestry[i]!;
    if (!isShell(node.name) && !isTerminalOrInit(node.name) && node.pid > 1) {
      return node;
    }
  }
  for (let i = ancestry.length - 1; i >= 0; i--) {
    const node = ancestry[i]!;
    if (!isTerminalOrInit(node.name) && node.pid > 1) {
      return node;
    }
  }
  return ancestry[0] ?? null;
}

export function getAllDescendantPids(
  rootPid: number,
  processMap: Map<number, ProcessRawInfo>,
): number[] {
  const pids: number[] = [];
  const queue = [rootPid];
  const seen = new Set<number>([rootPid]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [pid, proc] of processMap.entries()) {
      if (proc.ppid === current && !seen.has(pid)) {
        seen.add(pid);
        pids.push(pid);
        queue.push(pid);
      }
    }
  }

  return pids;
}

export function formatTreePreview(
  ancestry: readonly ProcessTreeNode[],
  listenerPid: number,
): string {
  if (ancestry.length === 0) return "";
  const supervisor = getSupervisorRoot(ancestry);
  const supervisorIndex = supervisor
    ? ancestry.findIndex((n) => n.pid === supervisor.pid)
    : -1;

  const relevant =
    supervisorIndex !== -1
      ? ancestry.slice(0, supervisorIndex + 1)
      : ancestry.filter((n) => !isShellOrRoot(n.name) || n.pid === listenerPid);

  const rawChain = [...relevant].reverse();
  const chain = rawChain.filter((node, idx) => {
    if (node.pid === listenerPid) return true;
    if (supervisor && node.pid === supervisor.pid) return true;
    if (isShell(node.name)) {
      const prev = rawChain[idx - 1];
      const next = rawChain[idx + 1];
      if (prev && next && !isShell(prev.name) && !isShell(next.name)) {
        return false;
      }
    }
    return true;
  });

  const lines: string[] = [];
  const targetCol = 11;
  chain.forEach((node, index) => {
    const isListener = node.pid === listenerPid;
    const pidStr = String(node.pid);
    const listenerTag = isListener ? "  ← listener" : "";

    const prefix =
      index === 0 ? node.name : `${"   ".repeat(index - 1)}└─ ${node.name}`;

    const padLen = Math.max(targetCol, prefix.length + 1);
    lines.push(`${prefix.padEnd(padLen)}${pidStr}${listenerTag}`);
  });

  return lines.join("\n");
}

export function formatTraceTree(
  port: number,
  ancestry: readonly ProcessTreeNode[],
): string {
  if (ancestry.length === 0) return `:${port}\n(no process tree found)`;
  const lines: string[] = [`:${port}`];

  const chain = ancestry.filter((node, idx) => {
    if (node.isListener) return true;
    if (isShell(node.name)) {
      const prev = ancestry[idx - 1];
      const next = ancestry[idx + 1];
      if (prev && next && !isShell(prev.name) && !isShell(next.name)) {
        return false;
      }
    }
    return true;
  });

  chain.forEach((node, index) => {
    const indent = "   ".repeat(index);
    const displayCmd = node.command
      ? node.command.slice(0, 32).trim()
      : node.name;
    const namePadded = displayCmd.padEnd(20);
    const ppidPart = node.ppid > 0 ? `  PPID ${node.ppid}` : "";
    lines.push(`${indent}└─ ${namePadded} PID ${node.pid}${ppidPart}`);
    if (node.cwd) {
      const displayCwd = node.cwd.replace(homedir(), "~");
      lines.push(`${indent}   cwd: ${displayCwd}`);
    }
    if (node.startTime) {
      lines.push(`${indent}   started: ${node.startTime}`);
    }
  });

  return lines.join("\n");
}

export async function terminateProcessTree(
  rootPid: number,
  options: TerminateOptions = {},
  runner: CommandRunner = defaultCommandRunner,
): Promise<SignalName> {
  if (rootPid <= 1 || rootPid === process.pid) {
    throw new Error(`refusing to terminate protected PID ${rootPid}`);
  }

  const force = Boolean(options.force);
  const timeoutMs = options.timeoutMs ?? 0;

  if (process.platform === "win32") {
    try {
      await sendSignalWindows(rootPid, force, runner);
      const gone = await waitUntilGone(rootPid, 2000);
      if (!gone) throw new Error("process tree is still running");
      return force ? "SIGKILL" : "SIGTERM";
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message === "process tree is still running"
      ) {
        throw err;
      }
      sendSignal(rootPid, force);
      const gone = await waitUntilGone(rootPid, 2000);
      if (!gone)
        throw new Error("process tree is still running", { cause: err });
      return force ? "SIGKILL" : "SIGTERM";
    }
  }

  const processMap = await getAllProcesses(runner);
  const descendantPids = getAllDescendantPids(rootPid, processMap);
  const allPids = [rootPid, ...descendantPids].filter(
    (pid) => pid > 1 && pid !== process.pid,
  );

  const killAll = (isForce: boolean) => {
    const reversed = [...allPids].reverse();
    for (const pid of reversed) {
      try {
        sendSignal(pid, isForce);
      } catch {}
    }
  };

  const forceKillAll = async (): Promise<SignalName> => {
    killAll(true);
    let allGone = true;
    for (const pid of allPids) {
      const gone = await waitUntilGone(pid, 2000);
      if (!gone) allGone = false;
    }
    if (!allGone) {
      throw new Error("one or more processes in tree did not exit");
    }
    return "SIGKILL";
  };

  if (force) {
    return await forceKillAll();
  }

  killAll(false);
  const waitTime = timeoutMs > 0 ? timeoutMs : 800;
  let anyAlive = false;
  for (const pid of allPids) {
    if (isProcessAlive(pid)) {
      const gone = await waitUntilGone(pid, waitTime);
      if (!gone) anyAlive = true;
    }
  }

  if (!anyAlive) {
    return "SIGTERM";
  }

  if (timeoutMs <= 0) {
    throw new Error("process tree is still running");
  }

  return await forceKillAll();
}
