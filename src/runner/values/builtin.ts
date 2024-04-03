export class Builtin {
  private val: Function;

  constructor(val: Function) {
    this.val = val;
  }

  apply(args: any[]): any {
    return this.val(...args);
  }
}

export function isBuiltin(val: any): val is Builtin {
  return val instanceof Builtin;
}