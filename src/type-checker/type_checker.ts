// a type_checker that takes in a parsed AST and checks the types of the nodes.

import * as ast_nodes from "../go-slang-parser/src/parser_mapper/ast_types";
import { TypeEnvironment } from "./type_environment";

interface TypeCheckFuncs {
  [key: string]: (node: any, te: TypeEnvironment) => ast_nodes.Type;
}

export class GoTypeChecker {
  private typeEnvironment: TypeEnvironment =
    TypeEnvironment.createBaseTypeEnvironment();
  private ast: ast_nodes.Program;
  private errors: string[] = [];
  private executed: boolean = false;

  constructor(ast: ast_nodes.Program) {
    this.ast = ast;
    // TODO: add built-in types to the type environment
  }

  public typeCheck(): void {
    if (this.executed) {
      return;
    }
    this.typeCheckProgram();
    this.executed = true;
    if (this.errors.length > 0) {
      throw new Error(`Type errors found: ${this.errors.join("\n")}`);
    }
  }

  public isVerified(): boolean {
    if (!this.executed) {
      return false;
    }
    return this.errors.length === 0;
  }

  public getErrors(): string[] {
    return this.errors;
  }

  private typeCheckProgram(): void {
    this.typeCheckFuncs[this.ast.type](this.ast, this.typeEnvironment);
  }

  private checkForIdentifierInScope(
    node: ast_nodes.Identifier,
    te: TypeEnvironment,
  ): ast_nodes.Type {
    const type = te.lookupVariableType(node);
    if (type === null) {
      this.errors.push(`Variable ${node.name} not found in scope`);
      this.errors.push(`Variable ${node.name} not found in scope`);
      return new ast_nodes.VoidType();
    }
    return type as ast_nodes.Type;
  }

  private setIdentifierInScope(
    node: ast_nodes.Identifier,
    te: TypeEnvironment,
    type: ast_nodes.Type,
  ): void {
    const res = te.try_addName(node, type);
    if (!res) {
      this.errors.push(`Variable ${node.name} already declared in scope`);
      this.errors.push(`Variable ${node.name} already declared in scope`);
    }
  }

  typeCheckFuncs: TypeCheckFuncs = {
    program: (node: ast_nodes.Program, te: TypeEnvironment) => {
      node.top_declarations.forEach((decl) =>
        this.typeCheckFuncs[decl.type](decl, te),
      );
      // type checking the program returns undefined
      return new ast_nodes.VoidType();
    },

    literal: (node: ast_nodes.Literal, te: TypeEnvironment) => {
      // literals are always well-typed
      return node.val_type;
    },

    identifier: (node: ast_nodes.Identifier, te: TypeEnvironment) => {
      return this.checkForIdentifierInScope(node, te);
    },

    application: (node: ast_nodes.Application, te: TypeEnvironment) => {
      const operatorType = this.typeCheckFuncs[node.operator.type](
        node.operator,
        te,
      );

      if (operatorType instanceof ast_nodes.AnyType) {
        return operatorType;
      }

      if (operatorType instanceof ast_nodes.FunctionType) {
        const funcType = operatorType as ast_nodes.FunctionType;
        // the formals value might be null, a single type or a tuple type.
        // act accordingly.
        const formals =
          funcType.formal_value === null
            ? []
            : funcType.formal_value instanceof ast_nodes.TupleType
              ? funcType.formal_value.type_values
              : [funcType.formal_value];

        if (formals.length !== node.operands.length) {
          this.errors.push(`Function call has incorrect number of arguments`);
          return new ast_nodes.VoidType();
        }

        for (let i = 0; i < formals.length; i++) {
          // check the type of the operand
          const operandType = this.typeCheckFuncs[node.operands[i].type](
            node.operands[i],
            te,
          );

          if (!formals[i].equals(operandType)) {
            this.errors.push(
              `Function call has incorrect type of argument ${i}`,
            );
            return new ast_nodes.VoidType();
          }
        }

        return funcType.return_value;
      } else {
        this.errors.push(`Application operator is not a function`);
        return new ast_nodes.VoidType();
      }
    },

    declaration: (node: ast_nodes.Declaration, te: TypeEnvironment) => {
      // get the types of the values
      let valueTypes = node.vals.map((val) =>
        this.typeCheckFuncs[val.type](val, te),
      );
      // get the types of the identifiers
      const idTypes = node.ids.map((id) => id.val_type);

      // firstly, check if any values are tuple types - if so, they
      // should be the 1. the only element in the list and 2. they should be unwrapped
      for (const valType of valueTypes) {
        if (valType instanceof ast_nodes.TupleType) {
          if (valueTypes.length !== 1) {
            this.errors.push(
              `Tuple type must be the only value in a declaration`,
            );
            return new ast_nodes.VoidType();
          }
          valueTypes = (valType as ast_nodes.TupleType).type_values;
        }
      }

      // now we can check that the number of values and identifiers match
      if (valueTypes.length !== idTypes.length) {
        this.errors.push(`Declaration has incorrect number of values`);
        return new ast_nodes.VoidType();
      }

      // now, we iterate through the identifiers and values:
      // if the identifiers have a type, check that the value matches.
      // if not, assign the value type to the identifier.
      for (let i = 0; i < idTypes.length; i++) {
        if (idTypes[i] !== null) {
          if (!idTypes[i]!.equals(valueTypes[i])) {
            this.errors.push(`Declaration has incorrect type for value ${i}`);
          }
          this.setIdentifierInScope(node.ids[i], te, valueTypes[i]);
        } else {
          node.ids[i].val_type = valueTypes[i];
          this.setIdentifierInScope(node.ids[i], te, valueTypes[i]);
        }
      }
      return new ast_nodes.VoidType();
    },

    unop: (node: ast_nodes.UnOp, te: TypeEnvironment) => {
      // get the proper type of the operator
      const operatorType = this.getUnopOperatorType(node.opcode);

      // we need to check that the operand is of the correct type.
      const operandType = this.typeCheckFuncs[node.expr.type](node.expr, te);
      if (!operandType.equals(operatorType)) {
        this.errors.push(
          `Unary operator ${node.opcode} has incorrect type of operand`,
        );
        return new ast_nodes.VoidType();
      }
      return operatorType;
    },

    binop: (node: ast_nodes.BinOp, te: TypeEnvironment) => {
      // get the proper type of the operator
      const operatorType = this.getBinopOperatorType(node.opcode);

      // we need to check that the operands are of the correct type.
      const leftType = this.typeCheckFuncs[node.left.type](node.left, te);
      const rightType = this.typeCheckFuncs[node.right.type](node.right, te);

      if (!leftType.equals(operatorType) || !rightType.equals(operatorType)) {
        this.errors.push(
          `Binary operator ${node.opcode} has incorrect type of operands`,
        );
        return new ast_nodes.VoidType();
      }
      return operatorType;
    },

    expressionStatement: (
      node: ast_nodes.ExpressionStatement,
      te: TypeEnvironment,
    ) => {
      this.typeCheckFuncs[node.expression.type](node.expression, te);
      return new ast_nodes.VoidType();
    },

    returnStatement: (node: ast_nodes.ReturnStatement, te: TypeEnvironment) => {
      // get the return values of the statement
      const returnTypes = node.expressions.map((val) =>
        this.typeCheckFuncs[val.type](val, te),
      );
      // if there are no return values, we can just return void.
      // if there is one return value, we can just return that.
      // if there are multiple return values, we can return a tuple.
      if (returnTypes.length === 0) {
        return new ast_nodes.VoidType();
      }
      if (returnTypes.length === 1) {
        return returnTypes[0];
      }
      return new ast_nodes.TupleType(returnTypes);
    },

    assignmentStatement: (
      node: ast_nodes.AssignmentStatement,
      te: TypeEnvironment,
    ) => {
      // get the types of all identifiers or index accesses
      const idTypes = node.ids.map((id) => {
        if (id instanceof ast_nodes.Identifier) {
          return this.checkForIdentifierInScope(id, te);
        } else if (id instanceof ast_nodes.IndexAccess) {
          // get the type of the array/slice used
          const arrOrSlc = id.accessed;

          const arrOrSlcType = this.typeCheckFuncs[arrOrSlc.type](arrOrSlc, te);

          // the type must be an array or slice
          if (arrOrSlcType instanceof ast_nodes.ArrayType) {
            return arrOrSlcType.arr_type;
          }

          if (arrOrSlcType instanceof ast_nodes.SliceType) {
            return arrOrSlcType.slice_type;
          }

          // if we reach this point this is bad news
          this.errors.push(`Cannot index into non-array or non-slice type`);
          return new ast_nodes.VoidType();
        } else if ((id as any) instanceof ast_nodes.StructAccess) {
          // get the type of the struct used
          const struct = (id as any).accessed;
          return new ast_nodes.VoidType();
        } else {
          this.errors.push(`Cannot assign to non-identifier`);
          return new ast_nodes.VoidType();
        }
      });

      // check if any identifiers are listed as constants - in this case we
      // should throw an error
      for (let i = 0; i < node.ids.length; i++) {
        if (node.ids[i] instanceof ast_nodes.IndexAccess) {
          // allowed to reassign arrays and slices
          continue;
        }
        if (node.ids[i] instanceof ast_nodes.StructAccess) {
          // allowed to reassign struct fields
          continue;
        }
        // by this point we know that thing is an identifier
        if (te.isConstant(node.ids[i] as ast_nodes.Identifier)) {
          this.errors.push(
            `Cannot reassign constant ${(node.ids[i] as any).name}`,
          );
          return new ast_nodes.VoidType();
        }
      }

      // get the types of all values
      let valTypes = node.vals.map((val) =>
        this.typeCheckFuncs[val.type](val, te),
      );

      // firstly, check if any values are tuple types - if so, they
      // should be the 1. the only element in the list and 2. they should be unwrapped
      for (const valType of valTypes) {
        if (valType instanceof ast_nodes.TupleType) {
          if (valTypes.length !== 1) {
            this.errors.push(
              `Tuple type must be the only value in a declaration`,
            );
            return new ast_nodes.VoidType();
          }
          valTypes = (valType as ast_nodes.TupleType).type_values;
        }
      }

      // now we can check that the number of values and identifiers match
      if (valTypes.length !== idTypes.length) {
        this.errors.push(`Declaration has incorrect number of values`);
        return new ast_nodes.VoidType();
      }

      // now we can compare the types of the values and identifiers
      for (let i = 0; i < idTypes.length; i++) {
        if (!idTypes[i].equals(valTypes[i])) {
          this.errors.push(`Assignment has incorrect type for value ${i}`);
        }
      }

      // ultimately, a reassingment statement returns void.
      return new ast_nodes.VoidType();
    },

    ifStatement: (node: ast_nodes.IfStatement, te: TypeEnvironment) => {
      const ifEnv = te.extendTypeEnvironment();
      // typecheck the short
      if (node.short) {
        this.typeCheckFuncs[node.short.type](node.short, ifEnv);
      }

      // typecheck the condition
      const condType = this.typeCheckFuncs[node.cond.type](node.cond, ifEnv);

      if (
        !(
          condType instanceof ast_nodes.BasicTypeClass &&
          (condType as ast_nodes.BasicTypeClass).type_value === "bool"
        )
      ) {
        this.errors.push(`If statement condition must be of type bool`);
        return new ast_nodes.VoidType();
      }

      // check the type of the cons
      node.cons.forEach((cons) =>
        this.typeCheckFuncs[cons.type](cons, ifEnv.extendTypeEnvironment()),
      );

      // if the alt exists typecheck it
      if (node.alt) {
        node.alt.forEach((alt) =>
          this.typeCheckFuncs[alt.type](alt, ifEnv.extendTypeEnvironment()),
        );
      }

      // beautiful

      // ultimately, an if statement returns void.
      return new ast_nodes.VoidType();
    },

    forStatement: (node: ast_nodes.ForStatement, te: TypeEnvironment) => {
      const forEnv = te.extendTypeEnvironment();
      // typecheck the init
      if (node.init) {
        this.typeCheckFuncs[node.init.type](node.init, forEnv);
      }

      // typecheck the cond
      if (node.cond) {
        const condType = this.typeCheckFuncs[node.cond.type](node.cond, forEnv);
        if (
          !(
            condType instanceof ast_nodes.BasicTypeClass &&
            (condType as ast_nodes.BasicTypeClass).type_value === "bool"
          )
        ) {
          this.errors.push(`For statement condition must be of type bool`);
          return new ast_nodes.VoidType();
        }
      }

      // typecheck the post
      if (node.post) {
        this.typeCheckFuncs[node.post.type](node.post, forEnv);
      }

      // typecheck the body
      node.body.forEach((body) =>
        this.typeCheckFuncs[body.type](body, forEnv.extendTypeEnvironment()),
      );

      // ultimately, a for statement returns void.
      return new ast_nodes.VoidType();
    },

    goStatement: (node: ast_nodes.GoStatement, te: TypeEnvironment) => {
      // typecheck the application
      this.typeCheckFuncs[node.app.type](node.app, te);

      // ultimately, a go statement returns void.
      return new ast_nodes.VoidType();
    },

    selectStatement: (node: ast_nodes.SelectStatement, te: TypeEnvironment) => {
      const selectEnv = te.extendTypeEnvironment();
      // typecheck the cases
      node.cases.forEach((c) => this.typeCheckFuncs[c.type](c, selectEnv));

      // ultimately, a select statement returns void.
      return new ast_nodes.VoidType();
    },

    selectCase: (node: ast_nodes.SelectCase, te: TypeEnvironment) => {
      // typecheck the statement
      this.typeCheckFuncs[node.statement.type](node.statement, te);

      // typecheck the body
      node.body.forEach((b) => this.typeCheckFuncs[b.type](b, te));

      // ultimately, a select case returns void.
      return new ast_nodes.VoidType();
    },

    defaultCase: (node: ast_nodes.DefaultCase, te: TypeEnvironment) => {
      // typecheck the body
      node.body.forEach((b) => this.typeCheckFuncs[b.type](b, te));

      // ultimately, a default case returns void.
      return new ast_nodes.VoidType();
    },

    sendStatement: (node: ast_nodes.SendStatement, te: TypeEnvironment) => {
      // typecheck the channel
      const chan: ast_nodes.ChanType = this.typeCheckFuncs[node.chan.type](
        node.chan,
        te,
      ) as ast_nodes.ChanType;

      if (chan instanceof ast_nodes.AnyType) {
        return chan;
      }

      // the channel must be a channel
      if (!(chan instanceof ast_nodes.ChanType)) {
        this.errors.push(`Send statement channel must be of type channel`);
        return new ast_nodes.VoidType();
      }

      // check - am I trying to send on a receive-only channel?
      if (chan.send_receive_type === "receive") {
        this.errors.push(`Attempted to send on a receive-only channel`);
        return new ast_nodes.VoidType();
      }

      // typecheck the value
      const value = this.typeCheckFuncs[node.val.type](node.val, te);

      // the value must be the same type as the channel
      if (!chan.chan_value_type.equals(value)) {
        this.errors.push(
          `Send statement value must be of the same type as the channel`,
        );
        return new ast_nodes.VoidType();
      }

      // ultimately, a send statement returns void.
      return new ast_nodes.VoidType();
    },

    receiveExpression: (
      node: ast_nodes.ReceiveExpression,
      te: TypeEnvironment,
    ) => {
      // typecheck the channel
      const chan: ast_nodes.ChanType = this.typeCheckFuncs[node.chan.type](
        node.chan,
        te,
      ) as ast_nodes.ChanType;

      if (chan instanceof ast_nodes.AnyType) {
        return chan;
      }

      // the channel must be a channel
      if (!(chan instanceof ast_nodes.ChanType)) {
        this.errors.push(`Receive expression channel must be of type channel`);
        return new ast_nodes.VoidType();
      }

      // check - am I trying to receive on a send-only channel?
      if (chan.send_receive_type === "send") {
        this.errors.push(`Attempted to receive on a send-only channe`);
        return new ast_nodes.VoidType();
      }

      // ultimately, a receive expression returns the type of the channel
      return chan.chan_value_type;
    },

    indexAccess: (node: ast_nodes.IndexAccess, te: TypeEnvironment) => {
      // typecheck the accessed
      const accessed = this.typeCheckFuncs[node.accessed.type](
        node.accessed,
        te,
      );

      if (accessed instanceof ast_nodes.AnyType) {
        return accessed;
      }

      // the accessed must be an array or slice
      if (
        !(accessed instanceof ast_nodes.ArrayType) &&
        !(accessed instanceof ast_nodes.SliceType)
      ) {
        this.errors.push(`Index access must be on an array or slice`);
        return new ast_nodes.VoidType();
      }

      // typecheck the index
      const index = this.typeCheckFuncs[node.index.type](node.index, te);

      // the index must somehow resolve to a number
      if (
        !(
          index instanceof ast_nodes.BasicTypeClass &&
          (index as ast_nodes.BasicTypeClass).type_value === "number"
        )
      ) {
        this.errors.push(`Index must be of type number.`);
        return new ast_nodes.VoidType();
      }

      // ultimately, an index access returns the type of the accessed
      if (accessed instanceof ast_nodes.ArrayType) {
        return accessed.arr_type;
      } else {
        return accessed.slice_type;
      }
    },

    function: (node: ast_nodes.FunctionNode, te: TypeEnvironment) => {
      // whether a function is an expression or a definition depends on whether it has a name assigned to it.
      if (node.name) {
        // its a definition
        // we will save the name first, remove it from the function, allowing us to typecheck it as an anonymous function
        // and then restore it later.
        const name = node.name;
        node.name = null;
        // typecheck the function as an expression
        const type = this.typeCheckFuncs[node.type](node, te);
        // assert that the type is a function type,
        // if not, another error has been thrown somewhere
        if (!(type instanceof ast_nodes.FunctionType)) {
          // i decide not to add an error, as it would overshadow the real problem
          return new ast_nodes.VoidType();
        }
        // restore the name
        node.name = name;
        // add the name as a constant declaration
        te.try_addName(node.name, type, true);
        // its a definition, so it returns void
        return new ast_nodes.VoidType();
      }
      // its an expression

      // first, we can capture its return type
      const returnType = node.retType ? node.retType : new ast_nodes.VoidType();

      // next, we can capture its formal types - also wrap it in a tuple since thats how
      // we represent formals
      // also, formal nodes are forced to have types, so we can safely assert that here
      const formalTypesRaw = node.formals.map(
        (f) => f.val_type as ast_nodes.Type,
      );
      const formalType =
        formalTypesRaw.length === 0
          ? new ast_nodes.VoidType()
          : formalTypesRaw.length === 1
            ? formalTypesRaw[0]
            : new ast_nodes.TupleType(formalTypesRaw);

      const formalScope = te.extendTypeEnvironment();
      // add the formals to the scope
      node.formals.forEach((f) =>
        this.setIdentifierInScope(f, formalScope, f.val_type as ast_nodes.Type),
      );

      const functionScope = formalScope.extendTypeEnvironment();

      // map through all of the function's body and typecheck them.
      node.body.forEach((b) => {
        if (b.type === "returnStatement") {
          // we need to verify that the return statement is well-typed
          // and is in line with the function's return type
          const returnStatementType = this.typeCheckFuncs[b.type](
            b,
            functionScope,
          );
          if (!returnType.equals(returnStatementType)) {
            console.log("return type", returnType);
            console.log("return statement type", returnStatementType);
            this.errors.push(
              `Return statement does not match function return type`,
            );
          }
        }
        this.typeCheckFuncs[b.type](b, functionScope);
      });

      // ultimately, a function node returns a function type.
      return new ast_nodes.FunctionType(formalType, returnType);
    },
    emptyStatement: (node: ast_nodes.EmptyStatement, te: TypeEnvironment) => {
      // ultimately, an empty statement returns void.
      return new ast_nodes.VoidType();
    },
    // structntype
    // structElement
    // structFieldInstateonation
    // structLiteral
    // structAccess
    typeDeclaration: (node: ast_nodes.TypeDeclaration, te: TypeEnvironment) => {
      // add the type to the type environment
      const res = te.try_addCustomType(node.name, node.dec_type);

      if (!res) {
        this.errors.push(
          `Type ${node.name.type_name} already declared in scope`,
        );
      }

      // ultimately, a type declaration returns void.
      return new ast_nodes.VoidType();
    },
  };

  getUnopOperatorType(unop: string): ast_nodes.Type {
    switch (unop) {
      case "+":
      case "-":
        return new ast_nodes.BasicTypeClass("number");
      case "!":
        return new ast_nodes.BasicTypeClass("bool");
      default:
        return new ast_nodes.VoidType();
    }
  }

  getBinopOperatorType(binop: string): ast_nodes.Type {
    switch (binop) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "%":
      case "<":
      case ">":
      case "<=":
      case ">=":
      case "==":
      case "!=":
        return new ast_nodes.BasicTypeClass("number");
      case "&&":
      case "||":
        return new ast_nodes.BasicTypeClass("bool");
      default:
        return new ast_nodes.VoidType();
    }
  }
}
