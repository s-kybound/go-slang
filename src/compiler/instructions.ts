/** 
 * This file contains the instruction set of our compiler.
 */

import { Value } from "../types";

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
  RESET,
  LAUNCH_THREAD,
  SEND,
  RECEIVE,
  SOF,
  ROF,
  BLOCK,
  CLEAR_WAIT,
  DONE
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
  value: Value;
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

export interface ENTER_SCOPEInstr extends BaseInstr {
  syms: string[];
}

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

export interface LAUNCH_THREADInstr extends BaseInstr {
  addr: number;
}

// takes a channel from the OS - sends item to it or blocks
export interface SENDInstr extends BaseInstr {}

// takes a channel from the OS - receives from it or blocks
export interface RECEIVEInstr extends BaseInstr {}

// send-or-jump - sends item or jumps
export interface SOFInstr extends BaseInstr {
  addr: number
}

// receive-or-jump - receives item or jumps
export interface ROFInstr extends BaseInstr {
  addr: number
}

// blocks goroutine
export interface BLOCKInstr extends BaseInstr {}

// clears a goroutine of waiting channels
export interface CLEAR_WAITInstr extends BaseInstr {}

export interface DONEInstr extends BaseInstr {}

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
  | RESETInstr
  | LAUNCH_THREADInstr
  | SENDInstr
  | RECEIVEInstr
  | SOFInstr
  | ROFInstr
  | BLOCKInstr
  | CLEAR_WAITInstr
  | DONEInstr;