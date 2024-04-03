import { Environment } from "../env";

export class Closure {
  private readonly pc: number;
  private readonly params: string[];
  private readonly env: Environment;

  constructor(pc: number, env: Environment, params: string[]) {
    this.pc = pc;
    this.env = env;
    this.params = params;
  }

  getPC() {
    return this.pc;
  }

  getEnv() {
    return this.env;
  }

  getParams() {
    return this.params;
  }
}
