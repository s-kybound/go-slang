import * as instr from "../../compiler/instructions";
import { Runner } from "../runner";
import { Stack } from "../../utils";
import { Environment } from "../env"; 
import { Closure, isClosure } from "../values/closure";
import { Frame, isCallFrame, makeBlockFrame, makeCallFrame } from "../runtime_stack_items";
import { isBuiltin } from "../values/builtin";

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
  readonly runtimeStack: Stack<Frame>;
  readonly operandStack: Stack<any>;
  private environment: Environment;
  private done: boolean = false;
  private blocked: boolean = false;

  constructor(programCounter: number, runner: Runner, inst:instr.Instr[], environment: Environment) {
    this.runner = runner;
    this.instructions = inst;
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
        this.runtimeStack.push(makeBlockFrame(this.environment));
        this.environment = this.environment.extend();
        this.programCounter++;
        break;
      case instr.InstrType.EXIT_SCOPE:
        // pop the old scope
        const oldFrame = this.runtimeStack.pop();
        this.environment = oldFrame.env;
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
      case instr.InstrType.TCALL:
        const arity = (i as instr.CALLInstr).arity;
        
        let args: any[] = [];
        for (let i = arity - 1; i >= 0; i--) {
          args[i] = this.operandStack.pop();
        }
        
        const fn = this.operandStack.pop();
        if (isBuiltin(fn)) {
          const res = fn.apply(args);
          this.operandStack.push(res);
          this.programCounter++;
          return;
        }
        if (!isClosure(fn)) {
          throw new Error("Expected a closure");
        }
        
        if (i.type === instr.InstrType.CALL) {
          // push onto runtime stack
          this.runtimeStack.push(makeCallFrame(this.environment, this.programCounter + 1));
        }

        this.environment = fn.getEnv().extend(fn.getParams(), args);
        this.programCounter = fn.getPC();
        break;
      case instr.InstrType.RESET:
        // pop from runtime stack until we find a call frame
        let frame = this.runtimeStack.pop();
        while (!isCallFrame(frame)) {
          frame = this.runtimeStack.pop();
        }
        this.environment = frame.env;
        this.programCounter = frame.pc;
        break;
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
    try {
      //console.log("before: ", this.operandStack)
      //console.log(instr);
      this.executeInstruction(instr);
      //console.log("after: ", this.operandStack)
    } catch (e) {
      // display the current stack trace
      throw e;
    }
  }

  getFinalValue() {
    if (!this.done) {
      throw new Error("Goroutine not done yet");
    }
    return this.operandStack.pop();
  }
}