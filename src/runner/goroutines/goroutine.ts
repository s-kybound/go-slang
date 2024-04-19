import * as instr from "../../compiler/instructions";
import { Runner } from "../runner";
import { Stack } from "../../utils";
import { Heap } from "../heap";

export class Goroutine {
  private programCounter: number = 0;
  readonly runner: Runner;
  readonly instructions: instr.Instr[];
  readonly runtimeStack: Stack<number>;
  readonly operandStack: Stack<number>;
  private environment: number;
  readonly heap: Heap;
  private waitingOn: number[] = [];
  private done: boolean = false;
  private blocked: boolean = false;

  // A transitionary field for addresses that are required but are in "transit"
  private working: number[] = [];

  constructor(programCounter: number, runner: Runner, inst:instr.Instr[], environment: number) {
    this.runner = runner;
    this.instructions = inst;
    this.runtimeStack = new Stack();
    this.operandStack = new Stack();
    this.programCounter = programCounter;
    this.environment = environment;
    this.heap = runner.getHeap();
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
 
  // scan the waitingOn list and see if any of the channels are free
  waitingChannelIsFree(): boolean {
    for (let i = 0; i < this.waitingOn.length; i++) {
      const addr = this.waitingOn[i];
      if (this.heap.isWaitSend(addr)) {
        // get the channel from the wait send
        const chan = this.heap.getWaitSendChan(addr);

        return this.heap.channelIsEmpty(chan);
      }
      if (this.heap.isWaitReceive(addr)) {
        // get the channel from the wait receive
        const chan = this.heap.getWaitReceiveChan(addr);

        return this.heap.channelIsFull(chan);
      }
    }
    return false;
  }

  private executeInstruction(i: instr.Instr) {
    switch (i.type) {
      case instr.InstrType.LDC:
        const val = this.heap.valueToAddress((i as instr.LDCInstr).value);
        this.operandStack.push(val);
        this.programCounter++;
        break;
      case instr.InstrType.UNOP:
        const operand = this.operandStack.pop();
        this.working.push(operand);
        const unopRes = this.performUnOpcode((i as instr.UNOPInstr).op, operand);
        this.operandStack.push(unopRes);
        this.working.pop();
        this.programCounter++;
        break;
      case instr.InstrType.BINOP:
        const right = this.operandStack.pop();
        const left = this.operandStack.pop();
        this.working.push(left);
        this.working.push(right);
        const binopRes = this.performBinOpcode((i as instr.BINOPInstr).op, left, right);
        this.operandStack.push(binopRes);
        this.working.pop();
        this.working.pop();
        this.programCounter++;
        break;
      case instr.InstrType.POP:
        this.operandStack.pop();
        this.programCounter++;
        break;
      case instr.InstrType.JOF:
        const condition = this.operandStack.pop();
        if (this.heap.isFalse(condition)) {
          this.programCounter = (i as instr.JOFInstr).addr;
        }
        this.programCounter++;
        break;
      case instr.InstrType.GOTO:
        this.programCounter = (i as instr.GOTOInstr).addr;
        break;
      case instr.InstrType.ENTER_SCOPE:
        let str = "enter scope from " + this.environment;
        // make a new scope
        const blockFrame = this.heap.allocateBlockFrame(this.environment);
        this.working.push(blockFrame);
        this.runtimeStack.push(blockFrame);
        // console.log("allocating frame with", (i as instr.ENTER_SCOPEInstr).syms, "symbols");
        const newFrame = this.heap.allocateFrame((i as instr.ENTER_SCOPEInstr).syms);
        this.working.push(newFrame);
        this.environment = this.heap.extendEnvironment(this.environment, newFrame);
        this.working.pop();
        this.working.pop();
        str += " to " + this.environment;
        // console.log(str);
        this.programCounter++;
        break;
      case instr.InstrType.EXIT_SCOPE:
        // pop the old scope
        const oldFrame = this.runtimeStack.pop();
        this.environment = this.heap.getBlockFrameEnv(oldFrame);
        this.programCounter++;
        break;
      case instr.InstrType.LD:
        const value = this.heap.getEnvironmentValue(this.environment, (i as instr.LDInstr).pos);
        if (this.heap.isUnallocated(value)) {
          throw new Error("Unallocated value");
        }
        this.operandStack.push(value);
        this.programCounter++;
        break;
      case instr.InstrType.ASSIGN:
        const assignValue = this.operandStack.pop();
        // console.log("assigning ", assignValue, " to ", (i as instr.ASSIGNInstr).name, "with position ", (i as instr.ASSIGNInstr).pos);
        this.heap.setEnvironmentValue(this.environment, (i as instr.ASSIGNInstr).pos, assignValue);
        this.programCounter++;
        break;
      case instr.InstrType.LDF:
        // make a closure
        const closure = this.heap.allocateClosure(
          (i as instr.LDFInstr).arity, 
          (i as instr.LDFInstr).addr, 
          this.environment);
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

        // add all the items to the working list
        this.working = this.working.concat(args);
        
        if (this.heap.isBuiltin(fn)) {
          // console.log("builtin function")
          // put the arguments back on the stack
          for (let i = 0; i < arity; i++) {
            this.operandStack.push(args[i]);
          }
          // get the builtin function
          const builtin = this.heap.getBuiltinFunction(fn);
          // call the builtin function
          const res = builtin(this);
          // push the result onto the stack
          this.operandStack.push(res);
          this.programCounter++;

          // remove the arguments from the working list
          this.working = [];

          break;
        }

        if (!this.heap.isClosure(fn)) {
          throw new Error("Expected a closure");
        }
        
        if (i.type === instr.InstrType.CALL) {
          // push onto runtime stack
          const callFrame = this.heap.allocateCallFrame(this.environment, this.programCounter + 1);
          this.runtimeStack.push(callFrame);
        }

        const parameterFrame = this.heap.allocateFrame(arity);
        this.working.push(parameterFrame);
        for (let i = 0; i < arity; i++) {
          this.heap.setFrameValue(parameterFrame, i, args[i]);
        }

        this.environment = this.heap.extendEnvironment(this.heap.getClosureEnv(fn), parameterFrame);
        this.programCounter = this.heap.getClosurePC(fn);

        // now remove everything from the working list
        this.working = [];

        break;
      case instr.InstrType.RESET:
        // pop from runtime stack until we find a call frame
        let frame = this.runtimeStack.pop();
        while (!this.heap.isCallFrame(frame)) {
          frame = this.runtimeStack.pop();
        }
        this.environment = this.heap.getCallFrameEnv(frame);
        this.programCounter = this.heap.getCallFramePC(frame);
        break;
      case instr.InstrType.LAUNCH_THREAD:
        // launch a new thread with wc + 1
        this.runner.launchThread(this.programCounter + 1, this.environment);
        this.programCounter = (i as instr.LAUNCH_THREADInstr).addr;
        break;
      case instr.InstrType.SEND:
        {
        const val = this.operandStack.pop();
        const chan = this.operandStack.pop();
        
        this.working = this.working.concat([val, chan]);

        if (!this.heap.isChan(chan)) {
          throw new Error("Expected a channel");
        }
        
        if (this.heap.channelIsFull(chan)) {
          // put the value and channel back on the stack
          this.operandStack.push(chan);
          this.operandStack.push(val);

          this.blocked = true;

          this.waitingOn.push(this.heap.allocateWaitSend(chan));
          this.working.pop();
          this.working.pop();
          this.runner.cycleNext();
          return;
        }
        this.heap.channelPushItem(chan, val);
        this.programCounter++;
        this.working.pop();
        this.working.pop();
        }
        break;
      case instr.InstrType.RECEIVE: {
        const chan = this.operandStack.pop();
        this.working.push(chan);
        
        if (!this.heap.isChan(chan)) {
          throw new Error("Expected a channel");
        }
        
        if (this.heap.channelIsEmpty(chan)) {
          // put the channel back on the stack
          this.operandStack.push(chan);

          this.blocked = true;
          this.waitingOn.push(this.heap.allocateWaitReceive(chan));
          this.runner.cycleNext();
          this.working.pop();
          break;
        }
        const val = this.heap.channelPopItem(chan);
        this.working.pop();
        this.operandStack.push(val);
        this.programCounter++;
      }
        break;
      case instr.InstrType.SOF: {
        const val = this.operandStack.pop();
        const chan = this.operandStack.pop();
        this.working.concat([val, chan]);
        if (this.heap.channelIsFull(chan)) {
          // console.log("channel is full, failing send");
          // the send fails
          // jump to the specified address
          this.programCounter = (i as instr.SOFInstr).addr;
          // and add the channel to the list of channels we are waiting on
          this.waitingOn.push(this.heap.allocateWaitSend(chan));
        } else {
          // send the value
          this.heap.channelPushItem(chan, val);
          this.programCounter++;
        }
        this.working.pop();
        this.working.pop();
      }
        break;
      case instr.InstrType.ROF: {
        const chan = this.operandStack.pop();
        this.working.push(chan);
        if (this.heap.channelIsEmpty(chan)) {
          // console.log("channel is empty, failing receive");
          // the receive fails
          // jump to the specified address
          this.programCounter = (i as instr.ROFInstr).addr;
          // and add the channel to the list of channels we are waiting on
          this.waitingOn.push(this.heap.allocateWaitReceive(chan));
        } else {
          // receive the value
          const val = this.heap.channelPopItem(chan);
          this.operandStack.push(val);
          this.programCounter++;
        }
        this.working.pop();
      }
        break;
      case instr.InstrType.BLOCK:
        // block this goroutine
        this.blocked = true;
        // signal the runner to get a new goroutine
        this.runner.cycleNext();
        this.programCounter++;
        break;
      case instr.InstrType.CLEAR_WAIT:
        // reset the blocked state
        this.waitingOn = [];
        this.programCounter++;
        break;
      case instr.InstrType.DONE:
        this.done = true;
        break;
    }
  }

  private performUnOpcode(op: instr.UnopType, operand: number): number {
    switch (op) {
      case instr.UnopType.NEG:
        return this.heap.valueToAddress(-this.heap.addressToValue(operand));
      case instr.UnopType.NOT:
        return this.heap.valueToAddress(!this.heap.addressToValue(operand));
    }
  }

  private performBinOpcode(op: instr.BinopType, left: number, right: number) {
    left = this.heap.addressToValue(left);
    right = this.heap.addressToValue(right);
    function rawPerformBinOpcode(op: instr.BinopType, left: any, right: any) {
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
    return this.heap.valueToAddress(rawPerformBinOpcode(op, left, right));
  }

  // do a single step of istruction
  run() {
    if (this.done) {
      return;
    }
    const instr = this.instructions[this.programCounter];
    try {
      //console.log("before: ", this.working);
      //console.log(this.programCounter, instr);
      this.executeInstruction(instr);
      // we should assert that the working list is empty
      // after every instruction
      this.working = [];
      //console.log("after: ", this.working);
    } catch (e) {
      // display the current stack trace
      // console.log("Error in goroutine: ", e);
      // console.log("Stack trace: ");
      // console.log(this.operandStack);
      // console.log(this.runtimeStack);
      // console.log(this.environment);
      // console.log(this.programCounter);
      throw e;
    }
  }

  unblock() {
    this.waitingOn = [];
    this.blocked = false;
  }

  mark() {
    this.heap.markRecursive(this.environment);
    this.working.forEach((addr) => {
      this.heap.markRecursive(addr);
    });
    this.operandStack.forEach((addr) => {
      this.heap.markRecursive(addr);
    });
    this.runtimeStack.forEach((addr) => {
      this.heap.markRecursive(addr);
    });
    this.waitingOn.forEach((addr) => {
      this.heap.markRecursive(addr);
    });
  }

  getFinalValue() {
    if (!this.done) {
      throw new Error("Goroutine not done yet");
    }
    try {
      return this.operandStack.pop();
    } catch (e) {
      // if there's no value on the stack, return undefined
      return undefined;
    }
  }
}