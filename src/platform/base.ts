import type { PlatformProvider, ProcessInfo } from "../types";

export abstract class BasePlatformProvider implements PlatformProvider {
  abstract list(): Promise<ProcessInfo[]>;

  async find(port: number): Promise<ProcessInfo[]> {
    const all = await this.list();
    return all.filter((item) => item.port === port);
  }
}
