import * as instr from "../compiler/instructions";
import { Goroutine, NormalGoroutine } from "./goroutines/goroutine";
import { Environment, globalEnvironment } from "./env";
import { GarbageCollector } from "./goroutines/special_goroutines";

export class Runner {
  private readonly instructions: instr.Instr[];

  // treated as a circular list of goroutines to run.
  private readonly goroutines: Goroutine[];
  private readonly programEnvironment = globalEnvironment.extend();
  private readonly mainGoroutine: Goroutine = new NormalGoroutine(0, this, this.programEnvironment);
  private currGoroutine: number;

  // quantum of time to run each goroutine.
  private readonly quantum: number;

  constructor(instructions: instr.Instr[], quantum: number) {
    this.instructions = instructions;
    this.quantum = quantum;
    this.goroutines = [this.mainGoroutine];
    this.currGoroutine = 0;
  }

  getInstructions() {
    return this.instructions;
  }

  addGoroutine(g: Goroutine) {
    this.goroutines.push(g);
  }

  launchThread(pc: number, e: Environment) {
    const newGoroutine = new NormalGoroutine(pc, this, e);
    this.goroutines.push(newGoroutine);
  }

  // move to the next available goroutine.
  cycleNext() {
    while (true) {
      this.currGoroutine = (this.currGoroutine + 1) % this.goroutines.length;
      if (!this.goroutines[this.currGoroutine].isRunnable()) {
        break;
      }
    }
  }
}