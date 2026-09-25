export const MIN_PORT = 1;
export const MAX_PORT = 65535;
export const MAX_RANGE_SIZE = 10001;

export function parsePort(value: string | number): number {
  const str = String(value).trim();
  if (!str || str !== String(value)) {
    throw new Error(`invalid port "${value}"`);
  }
  const port = Number(str);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `invalid port "${value}": expected ${MIN_PORT}-${MAX_PORT}`,
    );
  }
  return port;
}

export interface ExpandedPorts {
  ports: number[];
  hasRange: boolean;
}

export function expandPorts(values: readonly string[]): ExpandedPorts {
  const ports: number[] = [];
  const seen = new Set<number>();
  let hasRange = false;

  for (const raw of values) {
    const value = raw.trim();
    if (!value.includes("-")) {
      const port = parsePort(value);
      if (!seen.has(port)) {
        ports.push(port);
        seen.add(port);
      }
      continue;
    }

    const parts = value.split("-");
    if (parts.length !== 2) {
      throw new Error(`invalid port range "${value}"`);
    }

    const start = parsePort(parts[0]!);
    const end = parsePort(parts[1]!);

    if (start > end) {
      throw new Error(`invalid port range "${value}": start exceeds end`);
    }

    if (end - start + 1 > MAX_RANGE_SIZE) {
      throw new Error(`port range "${value}" exceeds ${MAX_RANGE_SIZE} ports`);
    }

    hasRange = true;
    for (let current = start; current <= end; current++) {
      if (!seen.has(current)) {
        ports.push(current);
        seen.add(current);
      }
    }
  }

  return { ports, hasRange };
}
