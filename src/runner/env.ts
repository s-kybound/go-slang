// an environment is a mapping from variable names to values
// they are nested, so that each environment has a parent environment
// the root environment is the global environment
// the global environment has no parent
// the global environment is created when the program starts

import { Context, CustomBuiltIns, Value } from "../types";
import { Builtin } from "./values/builtin";

// from js-slang/src/types.ts
// export interface Environment {
//   readonly id: string
//   name: string
//   tail: Environment | null
//   callExpression?: es.CallExpression
//   head: Frame
//   heap: Heap
//   thisContext?: Value
// }
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
	set(name: string, value: Value): void {
		this.bindings.set(name, value);
	}

	// create a new environment with this environment as the parent
	extend(names: string[] = [], values: any[] = []): Environment {
		return new Environment(this, names, values);
	}
}

export const globalEnvironment = new Environment(null, ["display"], [new Builtin((x: any) => console.log(x))]);

const createEmptyRuntime = () => {
	return {
		break: false,
		debuggerOn: true,
		isRunning: false,
		environments: [],
		value: undefined,
		nodes: [],
		objectCount: 0,
		envSteps: -1,
		envStepsTotal: 0,
		breakpointSteps: [],
		changepointSteps: []
	}
};

// add externalSymbols to context
export const createEmptyContext = <T>(externalSymbols: string[], externalContext?: T | undefined) :Context<T> => {
	return {
		externalSymbols,
		errors: [],
		externalContext: externalContext,
		runtime: createEmptyRuntime(),
		numberOfOuterEnvironments: 1,
		prelude: null
	}
}

export const ensureGlobalEnvironmentExist = (context: Context) => {
	if (!context.runtime) {
        context.runtime = createEmptyRuntime();
    }
    if (!context.runtime.environments) {
        context.runtime.environments = [];
    }
    if (context.runtime.environments.length === 0) {
        context.runtime.environments.push(globalEnvironment);
    }
};

// defines external symbols in context runtime envrionment
export const defineSymbol = (context: Context, name: string, value: Value) => {
	const globalEnvironment = context.runtime.environments[0];
	globalEnvironment.set(name, value);
};

export function defineBuiltin(context: Context, name: string, value: Value, minArgsNeeded?: number): void {
	defineSymbol(context, name, value);
}

export const importExternalSymbols = (context: Context, externalSymbols: string[]) => {
	ensureGlobalEnvironmentExist(context);
	externalSymbols.forEach(symbol => {
		defineSymbol(context, symbol, globalEnvironment)
	});
}

export const importBuiltins = (context: Context, externalBuiltIns: CustomBuiltIns) => {
	ensureGlobalEnvironmentExist(context);
	// TODO: add builtins

};


const defaultBuiltIns = {
	// TODO: replace misc.rawDisplay from js-slang
    rawDisplay: (values, str, externalContext) => { return 'string'},
    // See issue #5
    prompt: (values, str, externalContext) => { return 'string'},
    // See issue #11
    alert: (values, str, externalContext) => { },
    visualiseList: (_v) => {
        throw new Error('List visualizer is not enabled');
    }
};

export const createSlangContext = <T>(externalSymbols: string[] = [], externalContext?: T | undefined, externalBuiltIns: CustomBuiltIns = defaultBuiltIns) => {
	const context = createEmptyContext(externalSymbols, externalContext);
	importBuiltins(context, externalBuiltIns);
	importExternalSymbols(context, externalSymbols);
}
exports.default = createSlangContext;