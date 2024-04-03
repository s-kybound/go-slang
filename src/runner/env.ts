// an environment is a mapping from variable names to values
// they are nested, so that each environment has a parent environment
// the root environment is the global environment
// the global environment has no parent
// the global environment is created when the program starts

export class Environment {
  private parent: Environment | null = null;
  private bindings: Map<string, any> = new Map();

  constructor(parent: Environment | null = null) {
    this.parent = parent;
  }

  getParent(): Environment {
    const parent = this.parent;
    if (parent === null) {
      throw new Error("No parent environment");
    }
    return parent;
  }

  // get the value of a variable
  get(name: string): any {
    if (this.bindings.has(name)) {
      return this.bindings.get(name);
    } else if (this.parent !== null) {
      return this.parent.get(name);
    } else {
      throw new Error(`Variable ${name} not found`);
    }
  }

  // set the value of a variable
  set(name: string, value: any): void {
    this.bindings.set(name, value);
  }

  // create a new environment with this environment as the parent
  extend(): Environment {
    return new Environment(this);
  }
}

export const globalEnvironment = new Environment();