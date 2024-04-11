import * as instr from "../compiler/instructions";
import { Goroutine, NormalGoroutine } from "./goroutines/goroutine";
import { Environment, globalEnvironment } from "./env";
import { GarbageCollector } from "./goroutines/special_goroutines";

export class Runner {
  private readonly instructions: instr.Instr[];

  // treated as a circular list of goroutines to run.
  private readonly goroutines: Goroutine[];
  private readonly programEnvironment = globalEnvironment.extend();
  private readonly mainGoroutine: NormalGoroutine;
  private currGoroutine: number;

  // quantum of time to run each goroutine.
  private readonly quantum: number;

  constructor(instructions: instr.Instr[], quantum: number) {
    this.instructions = instructions;
    this.quantum = quantum;
    this.mainGoroutine = new NormalGoroutine(0, this, this.instructions, this.programEnvironment);
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
    const newGoroutine = new NormalGoroutine(pc, this, this.instructions, e);
    this.goroutines.push(newGoroutine);
  }

  // move to the next available goroutine.
  cycleNext() {
    let string = "context switching from: " + this.currGoroutine + " to ";
    while (true) {
      this.currGoroutine = (this.currGoroutine + 1) % this.goroutines.length;
      if (this.goroutines[this.currGoroutine].isDone() && this.currGoroutine !== 0) {
        // clean up the goroutine
        this.goroutines.splice(this.currGoroutine, 1);
        // check if currGoroutine now points to an invalid index - ie the last goroutine was removed.
        if (this.currGoroutine >= this.goroutines.length) {
          this.currGoroutine = 0;
        }
        continue;
      }
      if (this.goroutines[this.currGoroutine].isBlocked()) {
        continue;
      }
      // we have landed on a runnable goroutine.
      string += this.currGoroutine;
      console.log(string);
      break;
    }
  }

  isDone() {
    return this.mainGoroutine.isDone();
  }

  isDeadlocked() {
    return !this.isDone() && this.goroutines.every(g => !g.isRunnable());
  }

  run(): any {
    let time = 0;
    while (!this.isDone()) {
      if (this.isDeadlocked()) {
        throw new Error("Deadlock detected!");
      }
      const currGoroutine = this.goroutines[this.currGoroutine];
      currGoroutine.run();
      time++;
      if (time === this.quantum) {
        time = 0;
        this.cycleNext();
      }
    }
    // display the final state of the program

    console.log("Program finished running.");
    return this.mainGoroutine.getFinalValue();
  }
}