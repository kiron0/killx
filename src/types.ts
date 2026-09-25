export type Protocol = "tcp" | "udp";

export interface ProcessInfo {
  pid: number;
  port: number;
  process: string;
  user: string;
  command: string;
  protocol: Protocol;
  state: string;
}

export interface ProcessUsage {
  pid: number;
  user: string;
  cpu: number;
  memory: number;
  command: string;
}

export type SignalName = "SIGTERM" | "SIGKILL";

export interface KillResult {
  success: boolean;
  port: number;
  pid?: number | undefined;
  process?: string | undefined;
  signal?: SignalName | undefined;
  error?: string | undefined;
}

export interface PlatformProvider {
  list(): Promise<ProcessInfo[]>;
  find(port: number): Promise<ProcessInfo[]>;
}

export interface ProcessSearchOptions {
  query?: string | undefined;
}

export interface TerminateOptions {
  force?: boolean | undefined;
  timeoutMs?: number | undefined;
}

export interface CliOptions {
  json?: boolean | undefined;
  quiet?: boolean | undefined;
  verbose?: boolean | undefined;
  force?: boolean | undefined;
  yes?: boolean | undefined;
  timeout?: number | undefined;
  occupied?: boolean | undefined;
  interval?: number | undefined;
  kill?: boolean | undefined;
  startPort?: number | undefined;
}
