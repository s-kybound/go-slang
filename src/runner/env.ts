// an environment is a mapping from variable names to values
// they are nested, so that each environment has a parent environment
// the root environment is the global environment
// the global environment has no parent
// the global environment is created when the program starts

export class Environment {
  private parent: Environment | null = null;
  private bindings: Map<string, any> = new Map();

  constructor(parent: Environment | null = null, names: string[] = [], values: any[] = []) {
    this.parent = parent;
    for (let i = 0; i < names.length; i++) {
      this.bindings.set(names[i], values[i]);
    }
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
    let e: Environment | null = this;
    while (e !== null) {
      if (e.bindings.has(name)) {
        return e.bindings.get(name);
      }
      e = e.parent;
    }
    throw new Error(`Variable ${name} not found`);
  }

  // set the value of a variable
  set(name: string, value: any): void {
    this.bindings.set(name, value);
  }

  // create a new environment with this environment as the parent
  extend(names: string[] = [], values: any[] = []): Environment {
    console.log("Extending environment with", names, values);
    return new Environment(this, names, values);
  }
}

export const globalEnvironment = new Environment(null, ["display"], [x => console.log(x)]);