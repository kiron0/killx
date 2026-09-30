import { defaultCommandRunner, type CommandRunner } from "./command";
import type { DockerContainerInfo } from "../types";

export function isDockerProcess(processName: string, command = ""): boolean {
  const name = processName.toLowerCase();
  const cmd = command.toLowerCase();
  return (
    name.includes("docker") ||
    name.includes("vpnkit") ||
    cmd.includes("docker-proxy") ||
    cmd.includes("com.docker.backend")
  );
}

export function matchPublishedPort(
  portsStr: string,
  targetPort: number,
): boolean {
  if (!portsStr) return false;
  const mappings = portsStr.split(",").map((s) => s.trim());
  for (const mapping of mappings) {
    const arrowIndex = mapping.indexOf("->");
    if (arrowIndex === -1) continue;
    const hostPart = mapping.slice(0, arrowIndex);
    const lastColon = hostPart.lastIndexOf(":");
    const portSpec =
      lastColon !== -1 ? hostPart.slice(lastColon + 1) : hostPart;

    if (portSpec.includes("-")) {
      const [startStr, endStr] = portSpec.split("-");
      const start = Number(startStr);
      const end = Number(endStr);
      if (
        Number.isInteger(start) &&
        Number.isInteger(end) &&
        targetPort >= start &&
        targetPort <= end
      ) {
        return true;
      }
    } else {
      const portNum = Number(portSpec);
      if (portNum === targetPort) {
        return true;
      }
    }
  }
  return false;
}

export async function findDockerContainerForPort(
  port: number,
  runner: CommandRunner = defaultCommandRunner,
): Promise<DockerContainerInfo | null> {
  try {
    const stdout = await runner("docker", ["ps", "--format", "{{json .}}"], {
      timeout: 1000,
    });
    const lines = stdout.trim().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const item = JSON.parse(line) as {
          ID?: string;
          Id?: string;
          Names?: string;
          Image?: string;
          Ports?: string;
        };
        const portsStr = item.Ports ?? "";
        if (matchPublishedPort(portsStr, port)) {
          return {
            containerId: item.ID || item.Id || "",
            name: item.Names || item.ID || "docker-container",
            image: item.Image || "unknown",
            ports: portsStr,
            publishedPort: port,
          };
        }
      } catch {}
    }
  } catch {}

  try {
    const stdout = await runner(
      "docker",
      ["ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Ports}}"],
      { timeout: 1000 },
    );
    const lines = stdout.trim().split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split("\t");
      if (parts.length >= 4) {
        const [id, names, image, portsStr] = parts;
        if (matchPublishedPort(portsStr ?? "", port)) {
          return {
            containerId: id ?? "",
            name: names || id || "docker-container",
            image: image || "unknown",
            ports: portsStr ?? "",
            publishedPort: port,
          };
        }
      }
    }
  } catch {}

  return null;
}

export async function stopDockerContainer(
  container: string,
  force = false,
  runner: CommandRunner = defaultCommandRunner,
): Promise<void> {
  const cmd = force ? "kill" : "stop";
  await runner("docker", [cmd, container]);
}
