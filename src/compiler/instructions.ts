/** 
 * This file contains the instruction set of our compiler.
 */

export enum InstrType {
  LDC,
  UNOP,
  BINOP,
  POP,
  JOF,
  GOTO,
  ENTER_SCOPE, // or env?
  EXIT_SCOPE,
  LD,
  ASSIGN,
  LDF,
  CALL,
  TCALL,
  RESET
}

export enum UnopType {
  NEG,
  NOT
}

export enum BinopType {
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  AND,
  OR,
  EQ,
  NEQ,
  LT,
  GT,
  LE,
  GE
}

export interface BaseInstr {
  type: InstrType;
}

export interface LDCInstr extends BaseInstr {
  value: any;
}

export interface UNOPInstr extends BaseInstr {
  op: UnopType;
}

export interface BINOPInstr extends BaseInstr {
  op: BinopType;
}

export interface POPInstr extends BaseInstr {}

export interface JOFInstr extends BaseInstr {
  addr: number;
}

export interface GOTOInstr extends BaseInstr {
  addr: number;
}

export interface ENTER_SCOPEInstr extends BaseInstr {}

export interface EXIT_SCOPEInstr extends BaseInstr {}

export interface LDInstr extends BaseInstr {
  name: string;
}

export interface ASSIGNInstr extends BaseInstr {
  name: string;
}

export interface LDFInstr extends BaseInstr {
  params: any[];
  addr: number;
}

export interface CALLInstr extends BaseInstr {
  arity: number;
}

export interface TCALLInstr extends BaseInstr {
  arity: number;
}

export interface RESETInstr extends BaseInstr {}

export type Instr = 
  | LDCInstr 
  | UNOPInstr 
  | BINOPInstr 
  | POPInstr 
  | JOFInstr 
  | GOTOInstr 
  | ENTER_SCOPEInstr 
  | EXIT_SCOPEInstr 
  | LDInstr 
  | ASSIGNInstr 
  | LDFInstr 
  | CALLInstr 
  | TCALLInstr 
  | RESETInstr;