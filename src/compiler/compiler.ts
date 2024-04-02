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
}