/**
 * A compiler that compiles a go AST to "bytecode" representation.
 */

import {
  makeLDCInstr,
  makeUNOPInstr,
  makeBINOPInstr,
  makePOPInstr,
  makeJOFInstr,
  makeGOTOInstr,
  makeENTER_SCOPEInstr,
  makeEXIT_SCOPEInstr,
  makeLDInstr,
  makeASSIGNInstr,
  makeLDFInstr,
  makeCALLInstr,
  makeTCALLInstr,
  makeRESETInstr,
  makeLAUNCH_THREADInstr,
} from "./instr_maker";

import * as inst from "./instructions";

import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

class GoCompiler {
  private ast: ast_type.Program;
  private instrs: inst.Instr[];
  private compiled: boolean;
  private wc: number;

  constructor(ast: ast_type.Program) {
    this.ast = ast;
    this.instrs = [];
    this.compiled = false;
    this.wc = 0;
  }

  // compile the ast to instructions.
  public compile() {
    if (this.compiled) {
      return;
    }
    this.compileProgram();
    this.compiled = true;
  }

  public getInstrs() {
    return [...this.instrs];
  }

  compileProgram() {
  }

  // a mapping of opcodes to their respective enum representations.

  getUnopType(opcode: string): inst.UnopType {
    switch (opcode) {
      case "!":
        return inst.UnopType.NOT;
      case "-":
        return inst.UnopType.NEG;
      default:
        throw new Error(`Unrecognized opcode ${opcode}`);
    }
  }

  getBinopType(opcode: string): inst.BinopType {
    switch (opcode) {
      case "+":
        return inst.BinopType.ADD;
      case "-":
        return inst.BinopType.SUB;
      case "*":
        return inst.BinopType.MUL;
      case "/":
        return inst.BinopType.DIV;
      case "%":
        return inst.BinopType.MOD;
      case "==":
        return inst.BinopType.EQ;
      case "!=":
        return inst.BinopType.NEQ;
      case "<":
        return inst.BinopType.LT;
      case "<=":
        return inst.BinopType.LE;
      case ">":
        return inst.BinopType.GT;
      case ">=":
        return inst.BinopType.GE;
      case "&&":
        return inst.BinopType.AND;
      case "||":
        return inst.BinopType.OR;
      default:
        throw new Error(`Unrecognized opcode ${opcode}`);
    }
  }

  // dictionary of compiler functions for each ast node type.
  compileFuncs = {
    program: (comp: ast_type.Program) => {
      // compile everything
      comp.top_declarations.forEach((decl) => {
        this.compileFuncs[decl.declaration_type](decl);
        });
      // add a call to main()
      },
    identifier: (comp: ast_type.Identifier) => {
      this.instrs[this.wc++] = makeLDInstr(comp.name);
      },
    literal: (comp: ast_type.Literal) => {
      this.instrs[this.wc++] = makeLDCInstr(comp.value);
      },
    application: (comp: ast_type.Application) => {
      // compile the operator
      this.compileFuncs[comp.operator.type](comp.operator);
      // compile the operands
      comp.operands.forEach((operand) => {
        this.compileFuncs[operand.type](operand);
        });
      // add a call instruction
      this.instrs[this.wc++] = makeCALLInstr(comp.operands.length);
      },
    declaration: (comp: ast_type.Declaration) => {
      // TODO: some sort of check to make sure
      // number of ids and vals are the same?
      // perhaps we do this with the type checker

      // TODO: add a check for the type of declaration?
      // or, again, do this in the type checker
      comp.declaration_type;

      // compile every value
      comp.vals.forEach((val) => {
        this.compileFuncs[val.type](val);
        });
      // then compile every name
      comp.ids.forEach((id) => {
        this.instrs[this.wc++] = makeASSIGNInstr(id.name);
        });
      },
    unop: (comp: ast_type.UnOp) => {
      this.compileFuncs[comp.expr.type](comp.expr);
      const opcode: inst.UnopType = this.getUnopType(comp.opcode);
      // match the opcode to the enum type
      this.instrs[this.wc++] = makeUNOPInstr(opcode);
      },
    binop: (comp: ast_type.BinOp) => {
      this.compileFuncs[comp.left.type](comp.left);
      this.compileFuncs[comp.right.type](comp.right);
      const opcode: inst.BinopType = this.getBinopType(comp.opcode);
      // match the opcode to the enum type
      this.instrs[this.wc++] = makeBINOPInstr(opcode);
      },
    expressionStatement: (comp: ast_type.ExpressionStatement) => {
      this.compileFuncs[comp.expression.type](comp.expression);
      this.instrs[this.wc++] = makePOPInstr();
      },
    returnStatement: (comp: ast_type.ReturnStatement) => {
      // check for the tail call condition
      if (comp.expressions.length === 1 && comp.expressions[0].type === "application") {
        // currently do nothing
      }
      // compile every expression
      comp.expressions.forEach((expr) => {
        this.compileFuncs[expr.type](expr);
        });
      this.instrs[this.wc++] = makeRESETInstr();
      },
    assignmentStatement: (comp: ast_type.AssignmentStatement) => {
      // TODO: some sort of check to make sure
      // number of ids and vals are the same?
      // perhaps we do this with the type checker
      
      // compile every value
      comp.vals.forEach((val) => {
        this.compileFuncs[val.type](val);
        });
      // then compile every name
      comp.ids.forEach((id) => {
        this.compileFuncs[id.type](id);
        });
      },
    ifStatement: undefined,
    forStatement: undefined,
    goStatement: undefined,
    function: (comp: ast_type.FunctionNode) => {
      // this one does double work - if we have a function name, we need to assign it
      // otherwise its just a function VALUE
      
      // compile the function as a literal
      this.instrs[this.wc++] = makeLDFInstr(comp.formals, this.wc + 1);
      const goto = makeGOTOInstr(0)
      this.instrs[this.wc++] = goto;
      // compile the function body
      comp.body.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt);
        });
      // add undefined, if we need it
      this.instrs[this.wc++] = makeLDCInstr(undefined);
      this.instrs[this.wc++] = makeRESETInstr();
      // set the goto instruction
      goto.addr = this.wc;

      if (comp.name) {
        this.instrs[this.wc++] = makeASSIGNInstr(comp.name.name);
      }
    },
  }
}