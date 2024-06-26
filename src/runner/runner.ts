import * as instr from "../compiler/instructions";
import { Goroutine } from "./goroutines/goroutine";
import { Heap } from "./heap";
export class Runner {
  private readonly instructions: instr.Instr[];

  // treated as a circular list of goroutines to run.
  private readonly goroutines: Goroutine[];
  private readonly programEnvironment;
  private readonly mainGoroutine: Goroutine;
  private readonly heap;
  private currGoroutine: number;
  private time: number = 0;

  // quantum of time to run each goroutine.
  private readonly quantum: number;

  // whether to print debug information to the console.
  private debug: boolean;

  /**
   *
   * @param instructions the compiled instructions for the program.
   * @param quantum the quantum each goroutine is allowed to run for. (removed once webworkers are added).
   * @param size the size of memory (in megabytes)
   */
  constructor(
    instructions: instr.Instr[],
    quantum: number,
    size: number,
    withBytes: boolean,
    debug: boolean,
  ) {
    this.goroutines = [];
    this.debug = debug;
    this.instructions = instructions;
    this.quantum = quantum;
    this.heap = withBytes
      ? Heap.createWithBytes(size, this, debug)
      : Heap.create(size, this, debug);
    this.programEnvironment = this.heap.globalEnv;
    this.mainGoroutine = new Goroutine(
      0,
      this,
      this.instructions,
      this.programEnvironment,
      debug,
    );
    this.goroutines.push(this.mainGoroutine);
    this.currGoroutine = 0;
  }

  getInstructions() {
    return this.instructions;
  }

  getHeap() {
    return this.heap;
  }

  addGoroutine(g: Goroutine) {
    this.goroutines.push(g);
  }

  // spawns a new thread with the given pc and environment.
  launchThread(pc: number, e: number) {
    const newGoroutine = new Goroutine(pc, this, this.instructions, e);
    this.goroutines.push(newGoroutine);
  }

  // a round robin scheduler that cycles through the goroutines.
  // if a goroutine is blocked, it will check if it can be unblocked.
  cycleNext() {
    const oldGoroutine = this.currGoroutine;
    let string = "context switching from: " + oldGoroutine + " to ";
    // we will cycle through the goroutine ring once, finding the next runnable goroutine,
    // and cleaning up any goroutines that are done.
    let currLength = this.goroutines.length;
    let toClean: number[] = [];
    let foundGoroutine = false;
    let newGoroutine;
    for (let i = 0; i < currLength; i++) {
      // get the next goroutine
      const goroutineToCheck =
        (this.currGoroutine + i + 1) % this.goroutines.length;

      // if the goroutine is done, we will clean it up.
      if (
        this.goroutines[goroutineToCheck].isDone() &&
        goroutineToCheck !== 0
      ) {
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
          newGoroutine = goroutineToCheck;
        }
        continue;
      }

      // Otherwise, we have landed on a runnable goroutine.
      foundGoroutine = true;
      newGoroutine = goroutineToCheck;
    }
    // if we have not found a runnable goroutine by the end of the loop,
    // we know we are deadlocked
    if (!foundGoroutine) {
      throw new Error("Deadlock detected: all goroutines are blocked.");
    }

    // update the current goroutine index
    this.currGoroutine = newGoroutine as number;

    // clean up goroutines marked as done in reverse order and adjust the nextGoroutine index
    toClean
      .sort((a, b) => b - a)
      .forEach((index) => {
        this.goroutines.splice(index, 1);
        if (index < this.currGoroutine) {
          this.currGoroutine--; // adjust the index due to the removal of goroutines before it
        }
      });

    string += newGoroutine;
    if (this.debug && oldGoroutine !== newGoroutine) {
      console.error(string);
    }
    // reset the time to 0
    this.time = 0;
  }

  // signal each goroutine to mark all required elements
  markGoroutines() {
    for (let i = 0; i < this.goroutines.length; i++) {
      this.goroutines[i].mark();
    }
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
