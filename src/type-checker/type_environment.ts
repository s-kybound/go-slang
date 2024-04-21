// a type environment is a mapping from variable names to types within a given scope.
// this is used to keep track of the types of variables in the current scope.
// it is also used to keep track of the types of function arguments and return types.

import * as ast_nodes from "../go-slang-parser/src/parser_mapper/ast_types";
import { stdlib, constants, Stdlib } from "../stdlib";

function isCustomType(type: ast_nodes.Type): type is ast_nodes.CustomType {
  return type instanceof ast_nodes.CustomType;
}

export class TypeEnvironment {
  // names encompass ALL declarations in the current scope,
  // be it types or variables.
  // we use this to prevent shadowing of variables within
  // the same scope.
  private nameMap = new Map<string, null>();

  // we will also use the following map to prevent reassignment of
  // constant variables.
  private constantMap = new Map<string, boolean>();

  // identifierMap is used to keep track of the types of variables.
  private identifierMap = new Map<string, ast_nodes.Type>();

  // customTypeMap is used to keep track of the types of custom types.
  private customTypeMap = new Map<string, ast_nodes.Type>();

  private parent: TypeEnvironment | null = null;

  private constructor(parent: TypeEnvironment | null = null) {
    this.parent = parent;
  }

  // Creates a new type environment for the base scope.
  public static createBaseTypeEnvironment(): TypeEnvironment {
    const env = new TypeEnvironment();
    for (const key in stdlib) {
      const val = stdlib[key as keyof Stdlib];
      const valType = val[2];
      env.nameMap.set(key, null);
      env.identifierMap.set(key, valType);
    }
    for (const key in stdlib) {
      env.nameMap.set(key, null);
      env.identifierMap.set(key, new ast_nodes.AnyType());
    }
    return env;
  }

  // Creates a new type environment for a child scope.
  public extendTypeEnvironment(): TypeEnvironment {
    return new TypeEnvironment(this);
  }

  // Attempts to add a name to the current type environment.
  public try_addName(
    name: ast_nodes.Identifier,
    goType: ast_nodes.Type,
    constantDec = false,
  ): boolean {
    if (this.nameMap.has(name.name)) {
      return false;
    }
    this.nameMap.set(name.name, null);
    this.identifierMap.set(name.name, goType);
    this.constantMap.set(name.name, constantDec);
    return true;
  }

  // Attempts to add a custom type to the current type environment.
  public try_addCustomType(
    name: ast_nodes.CustomType,
    goType: ast_nodes.Type,
  ): boolean {
    if (this.nameMap.has(name.type_name)) {
      return false;
    }
    this.nameMap.set(name.type_name, null);
    this.customTypeMap.set(name.type_name, goType);
    // we will treat custom types as constants, though we may
    // change this later.
    // custom types can't even be reassigned anyway.
    this.constantMap.set(name.type_name, true);
    return true;
  }

  // Looks up the type of a name within the environment.
  // If the name is not found, it will return null.
  public lookupVariableType(name: ast_nodes.Identifier): ast_nodes.Type | null {
    if (this.identifierMap.has(name.name)) {
      return this.identifierMap.get(name.name) as ast_nodes.Type;
    }
    if (this.parent) {
      return this.parent.lookupVariableType(name);
    }
    return null;
  }

  // check if a variable is supposed to be constant
  public isConstant(name: ast_nodes.Identifier): boolean {
    if (this.constantMap.has(name.name)) {
      return this.constantMap.get(name.name) as boolean;
    }
    if (this.parent) {
      return this.parent.isConstant(name);
    }
    return false;
  }

  // Looks up the type of a custom type within the environment.
  // If the custom type is not found, it will return null.
  public lookupCustomType(name: ast_nodes.CustomType): ast_nodes.Type | null {
    if (this.customTypeMap.has(name.type_name)) {
      return this.customTypeMap.get(name.type_name) as ast_nodes.Type;
    }
    if (this.parent) {
      return this.parent.lookupCustomType(name);
    }
    return null;
  }
}
