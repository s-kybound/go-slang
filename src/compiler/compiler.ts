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
  makeRESETInstr,
  makeLAUNCH_THREADInstr,
  makeSENDInstr,
  makeRECEIVEInstr,
  makeSOFInstr,
  makeROFInstr,
  makeBLOCKInstr,
  makeDONEInstr,
  makeCLEAR_WAITInstr,
  makeACCESS_ADDRESSInstr,
  makeASSIGN_ADDRESSInstr,
} from "./instr_maker";

import * as inst from "./instructions";

import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

import { constants, stdlib } from "../stdlib";

// we represent the compile-time environment as an array of frames, starting from the
// top level frame and going down to the current frame.
type compileTimeEnv = frame[];
// we represent a frame as an array of variables, where each variable is a string.
type frame = string[];

function compileTimeEnvExtend(ce: compileTimeEnv, vars: frame): compileTimeEnv {
  return [...ce, vars];
}

// the compile-time environment position is a pair of numbers, where the first number
// represents the frame index and the second number represents the variable index in the frame.
export type compileTimeEnvPosition = [number, number];

function compileTimeEnvPosition(
  ce: compileTimeEnv,
  name: string,
): compileTimeEnvPosition {
  let frameIndex;
  // trace the ce BACKWARDS to find the first frame
  // containing an instance for the variable
  for (let i = ce.length - 1; i >= 0; i--) {
    if (ce[i].includes(name)) {
      frameIndex = i;
      break;
    }
  }
  if (frameIndex === undefined) {
    throw new Error(`Variable ${name} not found in compile-time environment`);
  }

  // console.log(`name ${name} found at frame ${frameIndex} index ${ce[frameIndex].indexOf(name)}`)
  return [frameIndex, ce[frameIndex].indexOf(name)];
}

interface CompileFuncs {
  [key: string]: (comp: any, ce: compileTimeEnv) => void;
}

const global_compile_frame: frame = [
  ...Object.keys(stdlib),
  ...Object.keys(constants),
];
const global_compile_env: compileTimeEnv = [global_compile_frame];

// search for all variables in a node. will allow us to
// assign variables to memory locations at compile time.
function scanForVariables(node: ast_type.GoNode | null): string[] {
  if (node === null) {
    return [];
  }
  const vars: string[] = [];
  switch (node.type) {
    case "function":
      const func = node as ast_type.FunctionNode;
      if (func.name) {
        vars.push(func.name.name);
      }
      break;
    case "declaration":
      const decl = node as ast_type.Declaration;
      decl.ids.forEach((id) => {
        vars.push(id.name);
      });
      break;
    default:
      break;
  }
  return vars;
}

export class GoCompiler {
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

  public compileProgram() {
    this.compileFuncs[this.ast.type](this.ast, global_compile_env);
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
  compileFuncs: CompileFuncs = {
    program: (comp: ast_type.Program, ce: compileTimeEnv) => {
      // compile everything
      // find the top level declarations
      let locals = comp.top_declarations.flatMap(scanForVariables);
      // create a new scope - this is the program environment
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(locals.length);
      const programScope = compileTimeEnvExtend(ce, locals);
      comp.top_declarations.forEach((decl) => {
        this.compileFuncs[decl.type](decl, programScope);
      });
      // add a call to main()
      this.instrs[this.wc++] = makeLDInstr(
        "main",
        compileTimeEnvPosition(programScope, "main"),
      );
      this.instrs[this.wc++] = makeCALLInstr(0);
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
      this.instrs[this.wc++] = makeDONEInstr();
    },
    emptyStatement: (comp: ast_type.EmptyStatement, ce: compileTimeEnv) => {
      // do nothing
    },
    identifier: (comp: ast_type.Identifier, ce: compileTimeEnv) => {
      this.instrs[this.wc++] = makeLDInstr(
        comp.name,
        compileTimeEnvPosition(ce, comp.name),
      );
    },
    literal: (comp: ast_type.Literal, ce: compileTimeEnv) => {
      this.instrs[this.wc++] = makeLDCInstr(comp.value);
    },
    application: (comp: ast_type.Application, ce: compileTimeEnv) => {
      // compile the operator
      this.compileFuncs[comp.operator.type](comp.operator, ce);
      // compile the operands
      comp.operands.forEach((operand) => {
        this.compileFuncs[operand.type](operand, ce);
      });
      // add a call instruction
      this.instrs[this.wc++] = makeCALLInstr(comp.operands.length);
    },
    declaration: (comp: ast_type.Declaration, ce: compileTimeEnv) => {
      // TODO: some sort of check to make sure
      // number of ids and vals are the same?
      // perhaps we do this with the type checker

      // TODO: add a check for the type of declaration?
      // or, again, do this in the type checker
      comp.declaration_type;

      // compile every value
      comp.vals.forEach((val) => {
        this.compileFuncs[val.type](val, ce);
      });
      // then compile every name
      comp.ids.reverse().forEach((id) => {
        this.instrs[this.wc++] = makeASSIGNInstr(
          id.name,
          compileTimeEnvPosition(ce, id.name),
        );
      });
    },
    unop: (comp: ast_type.UnOp, ce: compileTimeEnv) => {
      this.compileFuncs[comp.expr.type](comp.expr, ce);
      const opcode: inst.UnopType = this.getUnopType(comp.opcode);
      // match the opcode to the enum type
      this.instrs[this.wc++] = makeUNOPInstr(opcode);
    },
    binop: (comp: ast_type.BinOp, ce: compileTimeEnv) => {
      this.compileFuncs[comp.left.type](comp.left, ce);
      this.compileFuncs[comp.right.type](comp.right, ce);
      const opcode: inst.BinopType = this.getBinopType(comp.opcode);
      // match the opcode to the enum type
      this.instrs[this.wc++] = makeBINOPInstr(opcode);
    },
    expressionStatement: (
      comp: ast_type.ExpressionStatement,
      ce: compileTimeEnv,
    ) => {
      this.compileFuncs[comp.expression.type](comp.expression, ce);
      this.instrs[this.wc++] = makePOPInstr();
    },
    returnStatement: (comp: ast_type.ReturnStatement, ce: compileTimeEnv) => {
      // check for the tail call condition
      if (
        comp.expressions.length === 1 &&
        comp.expressions[0].type === "application"
      ) {
        // currently do nothing
      }
      // compile every expression
      comp.expressions.forEach((expr) => {
        this.compileFuncs[expr.type](expr, ce);
      });
      this.instrs[this.wc++] = makeRESETInstr();
    },
    assignmentStatement: (
      comp: ast_type.AssignmentStatement,
      ce: compileTimeEnv,
    ) => {
      // TODO: some sort of check to make sure
      // number of ids and vals are the same?
      // perhaps we do this with the type checker

      // compile every value
      comp.vals.forEach((val) => {
        this.compileFuncs[val.type](val, ce);
      });
      // then compile every name, in reverse
      comp.ids.reverse().forEach((id) => {
        if (id.type === "indexAccess") {
          // id is an index access
          id = id as ast_type.IndexAccess;
          // compile the accessed
          this.compileFuncs[id.accessed.type](id.accessed, ce);
          // now compile the index
          this.compileFuncs[id.index.type](id.index, ce);
          // now we can assign the value
          this.instrs[this.wc++] = makeASSIGN_ADDRESSInstr();
          return;
        }
        // id is an identifier
        id = id as ast_type.Identifier;
        this.instrs[this.wc++] = makeASSIGNInstr(
          id.name,
          compileTimeEnvPosition(ce, id.name),
        );
      });
    },
    ifStatement: (comp: ast_type.IfStatement, ce: compileTimeEnv) => {
      // get the local variables in the if statement
      let ifStatementLocals: string[] = scanForVariables(comp.short);
      const ifStatementScope = compileTimeEnvExtend(ce, ifStatementLocals);
      let consLocals = comp.cons.flatMap(scanForVariables);
      let altLocals = comp.alt ? comp.alt.flatMap(scanForVariables) : [];
      const consScope = compileTimeEnvExtend(ifStatementScope, consLocals);
      const altScope = compileTimeEnvExtend(ifStatementScope, altLocals);
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(ifStatementLocals.length);
      if (comp.short !== null) {
        this.compileFuncs[comp.short.type](comp.short, ifStatementScope);
      }
      this.compileFuncs[comp.cond.type](comp.cond, ifStatementScope);
      const jof = makeJOFInstr(0);
      this.instrs[this.wc++] = jof;
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(consLocals.length);
      comp.cons.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt, consScope);
      });
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
      const goto = makeGOTOInstr(0);
      this.instrs[this.wc++] = goto;
      jof.addr = this.wc;
      if (comp.alt !== null) {
        this.instrs[this.wc++] = makeENTER_SCOPEInstr(altLocals.length);
        comp.alt.forEach((stmt) => {
          this.compileFuncs[stmt.type](stmt, altScope);
        });
        this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
      }
      goto.addr = this.wc;
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
    },
    forStatement: (comp: ast_type.ForStatement, ce: compileTimeEnv) => {
      // get the local variables in the if statement
      let locals: string[] = [];
      locals = locals.concat(scanForVariables(comp.init));
      locals = locals.concat(scanForVariables(comp.cond));
      locals = locals.concat(scanForVariables(comp.post));
      const forScope = compileTimeEnvExtend(ce, locals);
      let bodyLocals = comp.body.flatMap(scanForVariables);
      const bodyScope = compileTimeEnvExtend(forScope, bodyLocals);
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(locals.length);
      // compile the initializer
      if (comp.init !== null) {
        this.compileFuncs[comp.init.type](comp.init, forScope);
      }
      const start = this.wc;
      const jof = makeJOFInstr(0);
      // compile the condition
      if (comp.cond !== null) {
        this.compileFuncs[comp.cond.type](comp.cond, forScope);
        this.instrs[this.wc++] = jof;
      }
      // compile the body
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(bodyLocals.length);
      comp.body.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt, bodyScope);
      });
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
      // compile the post
      if (comp.post !== null) {
        this.compileFuncs[comp.post.type](comp.post, forScope);
      }
      this.instrs[this.wc++] = makeGOTOInstr(start);
      jof.addr = this.wc;
      // exit the scope
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
    },
    goStatement: (comp: ast_type.GoStatement, ce: compileTimeEnv) => {
      // LAUNCH_THREAD creates a new thread using a "syscall"
      // that starts at wc + 1
      const launch = makeLAUNCH_THREADInstr(0);
      this.instrs[this.wc++] = launch;
      // compile the function
      this.compileFuncs[comp.app.type](comp.app, ce);
      this.instrs[this.wc++] = makeDONEInstr();
      // set the launch instruction
      launch.addr = this.wc;
    },
    function: (comp: ast_type.FunctionNode, ce: compileTimeEnv) => {
      // this one does double work - if we have a function name, we need to assign it
      // otherwise its just a function VALUE

      // compile the function as a literal
      this.instrs[this.wc++] = makeLDFInstr(comp.formals.length, this.wc + 1);
      const goto = makeGOTOInstr(0);
      this.instrs[this.wc++] = goto;
      // scan the function body + formals for variables
      // identifiers aren't detected by scanForVariables so we do something different
      let locals = comp.formals.map((id) => id.name);
      let fnBody = comp.body.flatMap(scanForVariables);
      // console.log(`locals: ${locals.length}`)
      // create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(fnBody.length);
      const functionScope = compileTimeEnvExtend(
        compileTimeEnvExtend(ce, locals),
        fnBody,
      );
      // compile the function body
      comp.body.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt, functionScope);
      });
      // add undefined, if we need it
      this.instrs[this.wc++] = makeLDCInstr(undefined);
      this.instrs[this.wc++] = makeRESETInstr();
      // exit the scope
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
      // set the goto instruction
      goto.addr = this.wc;

      if (comp.name) {
        this.instrs[this.wc++] = makeASSIGNInstr(
          comp.name.name,
          compileTimeEnvPosition(ce, comp.name.name),
        );
      }
    },
    sendStatement: (comp: ast_type.SendStatement, ce: compileTimeEnv) => {
      // compile the channel
      this.compileFuncs[comp.chan.type](comp.chan, ce);
      // compile the value
      this.compileFuncs[comp.val.type](comp.val, ce);
      // add the send instruction - depends on whether we are in a select statement
      // or not.
      this.instrs[this.wc++] = comp.inSelect
        ? makeSOFInstr(0)
        : makeSENDInstr();
    },
    receiveExpression: (
      comp: ast_type.ReceiveExpression,
      ce: compileTimeEnv,
    ) => {
      // compile the channel
      this.compileFuncs[comp.chan.type](comp.chan, ce);
      // add the receive instruction - depends on whether we are in a select statement
      this.instrs[this.wc++] = comp.inSelect
        ? makeROFInstr(0)
        : makeRECEIVEInstr();
    },
    indexAccess: (comp: ast_type.IndexAccess, ce: compileTimeEnv) => {
      // compile the accessed
      this.compileFuncs[comp.accessed.type](comp.accessed, ce);
      // compile the index
      this.compileFuncs[comp.index.type](comp.index, ce);
      // add the access address instruction
      this.instrs[this.wc++] = makeACCESS_ADDRESSInstr();
    },
    selectStatement: (comp: ast_type.SelectStatement, ce: compileTimeEnv) => {
      // get the local variables in the if statement
      let locals: string[] = [];
      comp.cases.forEach((c) => {
        locals = locals.concat(c.body.flatMap(scanForVariables));
      });
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr(locals.length);
      // then create a block instruction that is skipped over
      // when entering the select statement
      const goto = makeGOTOInstr(0);
      this.instrs[this.wc++] = goto;
      const blockaddr = this.wc;
      this.instrs[this.wc++] = makeBLOCKInstr();
      goto.addr = this.wc;
      // each case should have a goto instruction that points to the end
      // of the select statement
      const caseGotos: inst.GOTOInstr[] = [];
      // compile every case
      // we don't handle select and default cases outside of the select statement, as
      // they won't exist outside
      comp.cases.forEach((c) => {
        // there are 2 cases - the default case and the select case
        // we will handle the default case first
        if (c.type === "defaultCase") {
          const def = c as ast_type.DefaultCase;
          // compile default case - this is just a block
          def.body.forEach((stmt) => {
            this.compileFuncs[stmt.type](
              stmt,
              compileTimeEnvExtend(ce, locals),
            );
          });
          // add a goto instruction that points to the end of the select statement
          const defaultGoto = makeGOTOInstr(0);
          this.instrs[this.wc++] = defaultGoto;
          caseGotos.push(defaultGoto);
          return;
        }
        // this is a select case
        const sel = c as ast_type.SelectCase;
        let currSF = this.wc;
        let rofOrSof;
        // compile the select case statement
        this.compileFuncs[sel.statement.type](
          sel.statement,
          compileTimeEnvExtend(ce, locals),
        );

        // we need to find the SOF or ROF instruction that was just added -
        // we are assured it exists - as the parser prevents a select case without a SOF or ROF.
        for (let i = currSF; i < this.wc; i++) {
          if (
            this.instrs[i].type === inst.InstrType.SOF ||
            this.instrs[i].type === inst.InstrType.ROF
          ) {
            rofOrSof = this.instrs[i] as inst.SOFInstr | inst.ROFInstr;
            break;
          }
        }

        if (rofOrSof === undefined) {
          throw new Error("Could not find SOF or ROF instruction");
        }

        // compile the body
        sel.body.forEach((stmt) => {
          this.compileFuncs[stmt.type](stmt, compileTimeEnvExtend(ce, locals));
        });

        // add a goto instruction that points to the end of the select statement
        const caseGoto = makeGOTOInstr(0);
        this.instrs[this.wc++] = caseGoto;
        caseGotos.push(caseGoto);

        // set the address of the rof or sof to the current wc - this will
        // make it jump to the very next case
        rofOrSof.addr = this.wc;
        return;
      });

      // if none of the cases were executed,
      // we will land on this goto, which will
      // block the goroutine
      this.instrs[this.wc++] = makeGOTOInstr(blockaddr);

      // otherwise, the cases should jump to the instruction after this block
      // right here - this is the end of the select statement
      caseGotos.forEach((goto) => {
        goto.addr = this.wc;
      });

      // we clear the goroutine of any waiting channels
      this.instrs[this.wc++] = makeCLEAR_WAITInstr();

      // then we exit the scope
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
    },
  };
}
