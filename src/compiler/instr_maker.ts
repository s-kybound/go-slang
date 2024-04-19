import { Value } from "../types"
import {
  InstrType,
  UnopType,
  BinopType,
  LDCInstr,
  UNOPInstr,
  BINOPInstr,
  POPInstr,
  JOFInstr,
  GOTOInstr,
  ENTER_SCOPEInstr,
  EXIT_SCOPEInstr,
  LDInstr,
  ASSIGNInstr,
  LDFInstr,
  CALLInstr,
  TCALLInstr,
  RESETInstr,
  LAUNCH_THREADInstr,
  SENDInstr,
  RECEIVEInstr,
  SOFInstr,
  ROFInstr,
  BLOCKInstr,
  DONEInstr,
  CLEAR_WAITInstr,
  ACCESS_ADDRESSInstr,
  ASSIGN_ADDRESSInstr,
} from "./instructions"

import { compileTimeEnvPosition } from "./compiler";

export function makeLDCInstr(value: Value): LDCInstr {
  return { type: InstrType.LDC, value: value }
}

export function makeUNOPInstr(op: UnopType): UNOPInstr {
  return { type: InstrType.UNOP, op: op }
}

export function makeBINOPInstr(op: BinopType): BINOPInstr {
  return { type: InstrType.BINOP, op: op }
}

export function makePOPInstr(): POPInstr {
  return { type: InstrType.POP }
}

export function makeJOFInstr(addr: number): JOFInstr {
  return { type: InstrType.JOF, addr: addr }
}

export function makeGOTOInstr(addr: number): GOTOInstr {
  return { type: InstrType.GOTO, addr: addr }
}

export function makeENTER_SCOPEInstr(syms: number): ENTER_SCOPEInstr {
  return { type: InstrType.ENTER_SCOPE, syms: syms }
}

export function makeEXIT_SCOPEInstr(): EXIT_SCOPEInstr {
  return { type: InstrType.EXIT_SCOPE }
}

export function makeLDInstr(name: string, pos: compileTimeEnvPosition): LDInstr {
  return { type: InstrType.LD, name: name, pos: pos}
}

export function makeASSIGNInstr(name: string, pos: compileTimeEnvPosition): ASSIGNInstr {
  return { type: InstrType.ASSIGN, name: name, pos: pos}
}

export function makeLDFInstr(arity: number, addr: number): LDFInstr {
  return { type: InstrType.LDF, arity: arity, addr: addr }
}

export function makeCALLInstr(arity: number): CALLInstr {
  return { type: InstrType.CALL, arity: arity }
}

export function makeTCALLInstr(arity: number): TCALLInstr {
  return { type: InstrType.TCALL, arity: arity }
}

export function makeRESETInstr(): RESETInstr {
  return { type: InstrType.RESET }
}

export function makeLAUNCH_THREADInstr(addr: number): LAUNCH_THREADInstr {
  return { type: InstrType.LAUNCH_THREAD, addr: addr }
}

export function makeDONEInstr(): DONEInstr {
  return { type: InstrType.DONE }
}

export function makeSENDInstr(): SENDInstr {
  return { type: InstrType.SEND }
}

export function makeRECEIVEInstr(): RECEIVEInstr {
  return { type: InstrType.RECEIVE }
}

export function makeSOFInstr(addr: number): SOFInstr {
  return { type: InstrType.SOF, addr: addr }
}

export function makeROFInstr(addr: number): ROFInstr {
  return { type: InstrType.ROF, addr: addr }
}

export function makeCLEAR_WAITInstr(): CLEAR_WAITInstr {
  return { type: InstrType.CLEAR_WAIT }
}

export function makeBLOCKInstr(): BLOCKInstr {
  return { type: InstrType.BLOCK }
}

export function makeACCESS_ADDRESSInstr(): ACCESS_ADDRESSInstr {
  return { type: InstrType.ACCESS_ADDRESS }
}

export function makeASSIGN_ADDRESSInstr(): ASSIGN_ADDRESSInstr {
  return { type: InstrType.ASSIGN_ADDRESS }
}
