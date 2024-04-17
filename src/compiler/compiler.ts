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
  makeSENDInstr,
  makeRECEIVEInstr,
  makeSOFInstr,
  makeROFInstr,
  makeBLOCKInstr,
  makeDONEInstr,
  makeCLEAR_WAITInstr
} from "./instr_maker";

import * as inst from "./instructions";

import * as ast_type from "../go-slang-parser/src/parser_mapper/ast_types";

interface CompileFuncs {
  [key: string]: (comp: any) => void;
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
    this.compileFuncs[this.ast.type](this.ast);
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
    program: (comp: ast_type.Program) => {
      // compile everything
      comp.top_declarations.forEach((decl) => {
        this.compileFuncs[decl.type](decl);
        });
      // add a call to main()
      // add a call to main()
      this.instrs[this.wc++] = makeLDInstr("main");
      this.instrs[this.wc++] = makeCALLInstr(0);
      this.instrs[this.wc++] = makeDONEInstr();
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
      comp.ids.reverse().forEach((id) => {
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
      // then compile every name, in reverse
      comp.ids.reverse().forEach((id) => {
        this.instrs[this.wc++] = makeASSIGNInstr(id.name);
        });
      },
    ifStatement: (comp: ast_type.IfStatement) => {
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr();
      if (comp.short !== null) {
        this.compileFuncs[comp.short.type](comp.short);
      }
      this.compileFuncs[comp.cond.type](comp.cond);
      const jof = makeJOFInstr(0);
      this.instrs[this.wc++] = jof;
      comp.cons.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt);
        });
      const goto = makeGOTOInstr(0);
      this.instrs[this.wc++] = goto;
      jof.addr = this.wc;
      if (comp.alt !== null) {
        comp.alt.forEach((stmt) => {
          this.compileFuncs[stmt.type](stmt);
          });
        }
      goto.addr = this.wc;
    },
    forStatement: (comp: ast_type.ForStatement) => {
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr();
      // compile the initializer
      if (comp.init !== null) {
        this.compileFuncs[comp.init.type](comp.init);
        }
      const start = this.wc;
      const jof = makeJOFInstr(0);
      // compile the condition
      if (comp.cond !== null) {
        this.compileFuncs[comp.cond.type](comp.cond);
        this.instrs[this.wc++] = jof;
      }
      // compile the body
      comp.body.forEach((stmt) => {
        this.compileFuncs[stmt.type](stmt);
        });
      // compile the post
      if (comp.post !== null) {
        this.compileFuncs[comp.post.type](comp.post);
        }
      this.instrs[this.wc++] = makeGOTOInstr(start);
      jof.addr = this.wc;
      // exit the scope
      this.instrs[this.wc++] = makeEXIT_SCOPEInstr();
    },
    goStatement: (comp: ast_type.GoStatement) => {
      // LAUNCH_THREAD creates a new thread using a "syscall"
      // that starts at wc + 1
      const launch = makeLAUNCH_THREADInstr(0);
      this.instrs[this.wc++] = launch;
      // compile the function
      this.compileFuncs[comp.app.type](comp.app);
      this.instrs[this.wc++] = makeDONEInstr();
      // set the launch instruction
      launch.addr = this.wc;
    },
    function: (comp: ast_type.FunctionNode) => {
      // this one does double work - if we have a function name, we need to assign it
      // otherwise its just a function VALUE
      
      // compile the function as a literal
      this.instrs[this.wc++] = makeLDFInstr(comp.formals.map(c => c.name), this.wc + 1);
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
    sendStatement: (comp: ast_type.SendStatement) => {
      // compile the channel
      this.compileFuncs[comp.chan.type](comp.chan);
      // compile the value
      this.compileFuncs[comp.value.type](comp.value);
      // add the send instruction - depends on whether we are in a select statement
      // or not.
      this.instrs[this.wc++] = comp.inSelect ? makeSOFInstr(0) : makeSENDInstr();
    },
    receiveExpression: (comp: ast_type.ReceiveExpression) => {
      // compile the channel
      this.compileFuncs[comp.chan.type](comp.chan);
      // add the receive instruction - depends on whether we are in a select statement
      this.instrs[this.wc++] = comp.inSelect ? makeROFInstr(0) : makeRECEIVEInstr();
    },
    selectStatement: (comp: ast_type.SelectStatement) => {
      // first create a new scope
      this.instrs[this.wc++] = makeENTER_SCOPEInstr();
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
            this.compileFuncs[stmt.type](stmt);
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
        this.compileFuncs[sel.statement.type](sel.statement);

        // we need to find the SOF or ROF instruction that was just added -
        // we are assured it exists - as the parser prevents a select case without a SOF or ROF.
        for (let i = currSF; i < this.wc; i++) {
          if (this.instrs[i].type === inst.InstrType.SOF || this.instrs[i].type === inst.InstrType.ROF) {
            rofOrSof = this.instrs[i] as inst.SOFInstr | inst.ROFInstr;
            break;
          }
        }

        if (rofOrSof === undefined) {
          throw new Error("Could not find SOF or ROF instruction");
        }

        // compile the body
        sel.body.forEach((stmt) => {
          this.compileFuncs[stmt.type](stmt);
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
    }
  }
}