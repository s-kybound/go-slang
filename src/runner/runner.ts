import * as instr from "../compiler/instructions";
import { Goroutine, NormalGoroutine } from "./goroutines/goroutine";
import { Environment, globalEnvironment } from "./env";
import { Heap } from "./heap";
export class Runner {
  private readonly instructions: instr.Instr[];

  // treated as a circular list of goroutines to run.
  private readonly goroutines: Goroutine[];
  private readonly programEnvironment = globalEnvironment.extend();
  private readonly mainGoroutine: NormalGoroutine;
  private readonly heap;
  private currGoroutine: number;
  private time: number = 0;

  // quantum of time to run each goroutine.
  private readonly quantum: number;

  /**
   * 
   * @param instructions the compiled instructions for the program.
   * @param quantum the quantum each goroutine is allowed to run for. (removed once webworkers are added).
   * @param size the size of memory (in megabytes)
   */
  constructor(instructions: instr.Instr[], quantum: number, size: number) {
    this.instructions = instructions;
    this.quantum = quantum;
    this.mainGoroutine = new NormalGoroutine(0, this, this.instructions, this.programEnvironment);
    this.goroutines = [this.mainGoroutine];
    this.currGoroutine = 0;
    this.heap = Heap.create(size);
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
    // we will cycle through the goroutine ring once, finding the next runnable goroutine,
    // and cleaning up any goroutines that are done.
    let currLength = this.goroutines.length;
    let toClean: number[] = [];
    let foundGoroutine = false;
    for (let i = 0; i < currLength; i++) {
      // get the next goroutine
      const goroutineToCheck = (this.currGoroutine + i) % this.goroutines.length;

      // if the goroutine is done, we will clean it up.
      if (this.goroutines[goroutineToCheck].isDone() && goroutineToCheck !== 0) {
        toClean.push(goroutineToCheck);
        continue;
      }

      // if we have already found a goroutine to run, we will skip the rest of the loop.
      if (foundGoroutine) {
        continue;
      }

      // if the goroutine is blocked, we will check if we can unblock it.
      if (this.goroutines[goroutineToCheck].isBlocked()) {
        // we have found a blocked goroutine, we will reason about it 
        // and check if it can be unblocked.
        if (this.goroutines[goroutineToCheck].waitingChannelIsFree()) {
          this.goroutines[goroutineToCheck].unblock();
          foundGoroutine = true;
          this.currGoroutine = goroutineToCheck;
        }
        continue;
      }

      // Otherwise, we have landed on a runnable goroutine.
      foundGoroutine = true;
      this.currGoroutine = goroutineToCheck;
    }
    // if we have not found a runnable goroutine by the end of the loop,
    // we know we are deadlocked
    if (!foundGoroutine) {
      throw new Error("Deadlock detected: all goroutines are blocked.");
    }

    // clean up goroutines marked as done in reverse order and adjust the nextGoroutine index
    toClean.sort((a, b) => b - a).forEach(index => {
      this.goroutines.splice(index, 1);
      if (index < this.currGoroutine) {
        this.currGoroutine--; // adjust the index due to the removal of goroutines before it
      }
    });

    string += this.currGoroutine;
    // console.log(string);
    // reset the time to 0
    this.time = 0;
  }

  isDone() {
    return this.mainGoroutine.isDone();
  }

  run(): any {
    while (!this.isDone()) {
      const currGoroutine = this.goroutines[this.currGoroutine];
      currGoroutine.run();
      this.time++;
      if (this.time >= this.quantum) {
        this.cycleNext();
      }
    }
    // display the final state of the program

    console.log("Program finished running.");
    return this.mainGoroutine.getFinalValue();
  }
}