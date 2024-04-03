import * as instr from "../../compiler/instructions";
import { Runner } from "../runner";
import { Stack } from "../../utils";
import { Environment } from "../env"; 
import { Closure } from "../values/closure";

export interface Goroutine {
  isDone(): boolean;
  isBlocked(): boolean;
  isRunnable(): boolean;
  run(): void;
}

export class NormalGoroutine implements Goroutine {
  private programCounter: number = 0;
  readonly runner: Runner;
  readonly instructions: instr.Instr[];
  readonly runtimeStack: Stack<any>;
  readonly operandStack: Stack<any>;
  private environment: Environment;
  private done: boolean = false;
  private blocked: boolean = false;

  constructor(programCounter: number, runner: Runner, environment: Environment) {
    this.runner = runner;
    this.instructions = runner.getInstructions();
    this.runtimeStack = new Stack();
    this.operandStack = new Stack();
    this.programCounter = programCounter;
    this.environment = environment;
  }

  isDone() {
    return this.done;
  }

  isBlocked() {
    return this.blocked;
  }

  isRunnable() {
    return !this.done && !this.blocked;
  }

  private executeInstruction(i: instr.Instr) {
    switch (i.type) {
      case instr.InstrType.LDC:
        this.operandStack.push((i as instr.LDCInstr).value);
        this.programCounter++;
        break;
      case instr.InstrType.UNOP:
        const operand = this.operandStack.pop();
        const unopRes = this.performUnOpcode((i as instr.UNOPInstr).op, operand);
        this.operandStack.push(unopRes);
        this.programCounter++;
        break;
      case instr.InstrType.BINOP:
        const right = this.operandStack.pop();
        const left = this.operandStack.pop();
        const binopRes = this.performBinOpode((i as instr.BINOPInstr).op, left, right);
        this.operandStack.push(binopRes);
        this.programCounter++;
        break;
      case instr.InstrType.POP:
        this.operandStack.pop();
        this.programCounter++;
        break;
      case instr.InstrType.JOF:
        const condition = this.operandStack.pop();
        if (!condition) {
          this.programCounter = (i as instr.JOFInstr).addr;
        }
        break;
      case instr.InstrType.GOTO:
        this.programCounter = (i as instr.GOTOInstr).addr;
        break;
      case instr.InstrType.ENTER_SCOPE:
        // make a new scope
        this.environment = this.environment.extend();
        this.programCounter++;
        break;
      case instr.InstrType.EXIT_SCOPE:
        this.environment = this.environment.getParent();
        this.programCounter++;
        break;
      case instr.InstrType.LD:
        const name = (i as instr.LDInstr).name;
        const value = this.environment.get(name);
        this.operandStack.push(value);
        this.programCounter++;
        break;
      case instr.InstrType.ASSIGN:
        const assignName = (i as instr.ASSIGNInstr).name;
        const assignValue = this.operandStack.pop();
        this.environment.set(assignName, assignValue);
        this.programCounter++;
        break;
      case instr.InstrType.LDF:
        // make a closure
        const closure = new Closure(
          (i as instr.LDFInstr).addr, 
          this.environment, 
          (i as instr.LDFInstr).params);
        this.operandStack.push(closure);
        this.programCounter++;
        break;
      case instr.InstrType.CALL:
        const arity = (i as instr.CALLInstr).arity;
        let args: any[] = [];
        for (let i = 0; i < arity; i++) {
          args.push(this.operandStack.pop());
        }
        this.programCounter++;
        break;
      case instr.InstrType.TCALL:
        // todo
        this.programCounter++;
        break;
      case instr.InstrType.RESET:
        // todo
        break
      case instr.InstrType.LAUNCH_THREAD:
        // launch a new thread with wc + 1
        this.runner.launchThread(this.programCounter + 1, this.environment);
        this.programCounter = (i as instr.LAUNCH_THREADInstr).addr;
        break;
      case instr.InstrType.DONE:
        this.done = true;
        break;
    }
  }

  private performUnOpcode(op: instr.UnopType, operand: any) {
    switch (op) {
      case instr.UnopType.NEG:
        return -operand;
      case instr.UnopType.NOT:
        return !operand;
    }
  }

  private performBinOpode(op: instr.BinopType, left: any, right: any) {
    switch (op) {
      case instr.BinopType.ADD:
        return left + right;
      case instr.BinopType.SUB:
        return left - right;
      case instr.BinopType.MUL:
        return left * right;
      case instr.BinopType.DIV:
        return left / right;
      case instr.BinopType.MOD:
        return left % right;
      case instr.BinopType.AND:
        return left && right;
      case instr.BinopType.OR:
        return left || right;
      case instr.BinopType.EQ:
        return left === right;
      case instr.BinopType.NEQ:
        return left !== right;
      case instr.BinopType.LT:
        return left < right;
      case instr.BinopType.GT:
        return left > right;
      case instr.BinopType.LE:
        return left <= right;
      case instr.BinopType.GE:
        return left >= right
    }
  }

  // do a single step of istruction
  run() {
    if (this.done) {
      return;
    }
    const instr = this.instructions[this.programCounter];
    this.executeInstruction(instr);
  }
}