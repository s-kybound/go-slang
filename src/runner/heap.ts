import { stdlib, constants, Stdlib, Constants } from "../stdlib";
import { Runner } from "./runner";

// a representation of the heap, which stores all data in the program.
// for go-slang, we use a fixed-size big-endian heap
// using tagged pointers that uses
// a first-fit allocation strategy.

// Garbage collection is done using
// a mark-and-sweep algorithm.

const MEGABYTE = 2 ** 20;

// for our go-slang, we fix a word size of 8 bytes.
// additionally, we use word addressing, so addresses
// given to the heap are in words, not bytes.

const WORD_SIZE = 8;

// for our go-slang, we fix a node size of 10 words.
// the first word is reserved for the tag header,
// and the last word is reserved for an "extension" node.
// this gives each node 8 words to store children, aside from
// the tag and extension node.

// 1: [tagpointer] 8: [children] 1: [extension-node]

const NODE_SIZE = 10;

// tags used to represent the different types of nodes in the heap.
export enum Tag {
  FREE = 0, // a free node
  UNALLOCATED = 1, // an unallocated item

  // Data types
  FALSE = 2, // a false boolean
  TRUE = 3, // a true boolean
  NUMBER = 4, // a JS number
  NULL = 5, // a null value
  UNDEFINED = 6, // an undefined value
  CHAN = 7, // a channel
  STRUCT = 8, // a struct
  ARRAY = 9, // an array
  SLICE = 10, // a slice
  CLOSURE = 11, // a closure
  BUILTIN = 12, // a builtin
  STRING = 13, // a string

  // Environment types
  ENVIRONMENT = 14, // an environment
  FRAME = 15, // a frame
  BLOCKFRAME = 16, // a block frame
  CALLFRAME = 17, // a call frame
  EXTENSION = 18, // an extension node
  WAIT_SEND = 19, // a wait send node
  WAIT_RECEIVE = 20, // a wait receive node
}

export class Heap {
  // TAGGED POINTER CONVENTION
  // the first word of each node is the tagged pointer itself.
  // the first byte of the word is the tag.
  // the next byte is reserved for garbage collection.
  // the next 2 bytes represent the number of children in the node.
  // the last 4 bytes are reserved for metadata related to the node type.

  // 1: [tag] 1: [gc] 2: [children] 4: [metadata]

  // an unallocated word is represented with a tag and
  // a next free address, represented as follows:

  // 1: [UNALLOCATED_TAG] 3: [unused] 4: [next free word address]

  private heap: DataView;

  // free pointers are represented by a "linked list" of free nodes.
  private freePointer: number;

  // a stringpool is implemented as a table of addresses and strings.
  private stringPool: [number, string][] = [];

  // The heap's literals
  False: number;
  True: number;
  Null: number;
  Undefined: number;
  Unallocated: number;
  globalEnv: number;

  // set of builtins, represented with [arity, function]
  builtins: [number, Function][] = [];

  // the runner that the heap is associated with
  private runner: Runner;

  // a list of addresses that should be protected from GC
  // while they are still being constructed by the program.
  // for example, this is used to protect the global environment while it is being constructed.
  private working: number[] = [];

  // debugging flag
  private debug: boolean;

  // constructor for the heap.
  // remember that the size is given in bytes.
  private constructor(size: number, runner: Runner, debug: boolean = false) {
    if (size < NODE_SIZE * WORD_SIZE) {
      const min = NODE_SIZE * WORD_SIZE;
      throw new Error(
        `Heap size too small - please allocate more initial memory (at least ${min} bytes).`,
      );
    }
    this.debug = debug;
    this.runner = runner;
    this.freePointer = 0;
    this.heap = new DataView(new ArrayBuffer(size));

    // set every node EXCEPT THE LAST to point to the next node
    // allocableSize refers to the size of the heap that can be allocated.
    // it ignores any remaining bytes that cannot fit a node.
    const allocableSize = size - (size % (NODE_SIZE * WORD_SIZE));

    // then initialize the free pointers as required
    let i = 0;

    // we mark every node EXCEPT THE LAST ONE as free.
    for (; (i + NODE_SIZE) * WORD_SIZE < allocableSize; i += NODE_SIZE) {
      // set the value of the free pointer to the next free node
      this.setFreePointerAtAddress(i, i + NODE_SIZE);
    }
    // finally, set the last free pointer to -1
    this.setFreePointerAtAddress(i, -1);

    // while allocating items, mark them to protect them from GC
    // allocate the global environment
    this.False = this.allocate(Tag.FALSE, 0);
    this.working.push(this.False);
    this.True = this.allocate(Tag.TRUE, 0);
    this.working.push(this.True);
    this.Null = this.allocate(Tag.NULL, 0);
    this.working.push(this.Null);
    this.Undefined = this.allocate(Tag.UNDEFINED, 0);
    this.working.push(this.Undefined);
    this.Unallocated = this.allocate(Tag.UNALLOCATED, 0);
    this.working.push(this.Unallocated);
    this.globalEnv = this.initGlobalEnvironment();

    // revert the working set
    this.working = [];
  }

  // create a new heap with a size given in megabytes.
  static create(size: number, runner: Runner, debug: boolean): Heap {
    return new Heap(size * MEGABYTE, runner);
  }

  // create a new heap with a size given in bytes.
  // we can use this to test GC with smaller heaps.
  static createWithBytes(size: number, runner: Runner, debug: boolean): Heap {
    return new Heap(size, runner);
  }

  private initGlobalEnvironment(): number {
    // we track the total number of objects we add to the working here
    let numAddedToWorking = 0;
    // get the total number of objects in the stdlib and constants
    const total = Object.keys(stdlib).length + Object.keys(constants).length;
    // allocate a single frame
    const frame = this.allocateFrame(total);
    this.working.push(frame);
    numAddedToWorking++;

    // set the bindings in the frame
    let i = 0;
    for (const key in stdlib) {
      this.builtins[i] = stdlib[key as keyof Stdlib];
      const builtin = this.allocateBuiltin(i);
      this.working.push(builtin);
      numAddedToWorking++;
      this.setFrameValue(frame, i, builtin);
      i++;
    }
    for (const key in constants) {
      const val = this.valueToAddress(constants[key as keyof Constants]);
      this.working.push(val);
      numAddedToWorking++;
      this.setFrameValue(frame, i, val);
      i++;
    }
    // allocate the global environment
    const addr = this.allocateEnvironment(1);
    this.working.push(addr);
    numAddedToWorking++;
    // set the first frame in the environment
    this.setWord(addr + 1, frame);

    // revert the working set by the amount added
    this.working = this.working.slice(
      0,
      this.working.length - numAddedToWorking,
    );
    return addr;
  }

  setWord(address: number, value: number) {
    this.heap.setFloat64(address * WORD_SIZE, value);
  }

  getWord(address: number): number {
    return this.heap.getFloat64(address * WORD_SIZE);
  }

  setByteAtOffset(address: number, offset: number, value: number) {
    this.heap.setUint8(address * WORD_SIZE + offset, value);
  }

  set2BytesAtOffset(address: number, offset: number, value: number) {
    this.heap.setUint16(address * WORD_SIZE + offset, value);
  }

  getByteAtOffset(address: number, offset: number): number {
    return this.heap.getUint8(address * WORD_SIZE + offset);
  }

  get2BytesAtOffset(address: number, offset: number): number {
    return this.heap.getUint16(address * WORD_SIZE + offset);
  }

  setFreePointerAtAddress(address: number, next: number) {
    this.setTag(address, Tag.FREE);
    this.heap.setInt32(address * WORD_SIZE + 4, next);
  }

  getFreePointerAtAddress(address: number): number {
    if (!this.isFree(address)) {
      const tag = this.getTag(60);
      throw new Error("Not a free pointer");
    }
    return this.heap.getInt32(address * WORD_SIZE + 4);
  }

  // the accessors for the tagged pointer
  setTag(address: number, tag: Tag) {
    this.setByteAtOffset(address, 0, tag);
  }

  getTag(address: number): Tag {
    return this.getByteAtOffset(address, 0) as Tag;
  }

  setNumChildren(address: number, children: number) {
    this.set2BytesAtOffset(address, 2, children);
  }

  getNumChildren(address: number): number {
    return this.get2BytesAtOffset(address, 2);
  }

  // allocates a node in the heap, setting the tag and number of children.
  // returns the address allocated.
  allocate(tag: Tag, children: number): number {
    // get the current free pointer from the heap
    const newNode = this.freePointer;
    // get the next free pointer from the free pointer's position
    this.freePointer = this.getFreePointerAtAddress(newNode);
    if (this.freePointer === -1) {
      // this is where we need to do GC
      this.garbageCollect();
      // if, even after GC, we are out of memory, resort to resizing the heap
      if (this.freePointer === -1) {
        this.resizeHeap();
      }
    }
    // set the tag of the new node
    this.setTag(newNode, tag);

    // ensure it is unmarked
    this.unmark(newNode);

    // set the number of children of the new node
    this.setNumChildren(newNode, children);

    return newNode;
  }

  resizeHeap() {
    // get the old size
    const oldSize = this.heap.byteLength;
    // get the new size
    const newSize = oldSize * 2;

    if (this.debug) {
      console.error(
        "Resizing heap from",
        oldSize,
        "bytes to",
        newSize,
        "bytes",
      );
    }
    // create a new heap
    const newHeap = new DataView(new ArrayBuffer(newSize));
    const oldAllocableSize = oldSize - (oldSize % (NODE_SIZE * WORD_SIZE));
    const newAllocableSize = newSize - (newSize % (NODE_SIZE * WORD_SIZE));

    // copy every word in the old heap to the new one
    for (let i = 0; i < oldAllocableSize / WORD_SIZE; i++) {
      newHeap.setFloat64(i * WORD_SIZE, this.heap.getFloat64(i * WORD_SIZE));
    }

    // set the new heap
    this.heap = newHeap;

    // set the free pointer to the old size
    this.freePointer = oldAllocableSize / WORD_SIZE;

    // create the linked list of free pointers with the new size
    let i = this.freePointer;
    for (; (i + NODE_SIZE) * WORD_SIZE < newAllocableSize; i += NODE_SIZE) {
      this.setFreePointerAtAddress(i, i + NODE_SIZE);
    }

    // finally, set the last free pointer to -1
    this.setFreePointerAtAddress(i, -1);
  }

  mark(address: number) {
    this.setByteAtOffset(address, 1, 1);
  }

  markRecursive(address: number) {
    // if the node is already marked, we return
    if (this.isMarked(address)) {
      return;
    }
    if (this.isFree(address)) {
      return;
    }

    // mark the node itself
    this.mark(address);

    // get the number of children in the node
    const children = this.getNumChildren(address);

    // mark the children of the node
    for (let i = 1; i <= children; i++) {
      this.markRecursive(this.getWord(address + i));
    }

    return;
  }

  isMarked(address: number): boolean {
    return this.getByteAtOffset(address, 1) === 1;
  }

  unmark(address: number) {
    this.setByteAtOffset(address, 1, 0);
  }

  free(address: number) {
    // set the next free pointer to the current free pointer
    this.setFreePointerAtAddress(address, this.freePointer);
    // set the current free pointer to the address
    this.freePointer = address;
  }

  sweep() {
    // we sweep through the heap, freeing all unmarked nodes.
    // start at the first address
    let current = 0;
    while (current * WORD_SIZE < this.heap.byteLength) {
      // only free the node if it is NOT free, and NOT marked
      if (!this.isMarked(current) && !this.isFree(current)) {
        // if the string pool contains the address, we remove it
        if (this.isString(current)) {
          const hash = this.getWord(current + 1);
          delete this.stringPool[hash];
        }
        // if the first node is unmarked, we free it.
        this.free(current);
        if (this.debug) {
          console.log("Freeing", current);
        }
      }
      // unmark this node
      this.unmark(current);
      // move to the next node
      current += NODE_SIZE;
    }
  }

  garbageCollect() {
    if (this.debug) {
      console.error("Garbage collecting");
    }
    // mark and sweep algorithm
    // mark all of the literals
    this.mark(this.False);
    this.mark(this.True);
    this.mark(this.Null);
    this.mark(this.Undefined);
    this.mark(this.Unallocated);

    // mark everything in the working set
    this.working.forEach((address) => this.markRecursive(address));

    // recursively mark the global environment
    this.markRecursive(this.globalEnv);

    // now signal the runner to signal each goroutine to mark its own stuff
    this.runner.markGoroutines();

    // finally, sweep the heap
    this.sweep();
  }

  // data type predicates
  isFree(address: number): boolean {
    return this.getTag(address) === Tag.FREE;
  }

  isUnallocated(address: number): boolean {
    return this.getTag(address) === Tag.UNALLOCATED;
  }

  isFalse(address: number): boolean {
    return this.getTag(address) === Tag.FALSE;
  }

  isTrue(address: number): boolean {
    return this.getTag(address) === Tag.TRUE;
  }

  isNumber(address: number): boolean {
    return this.getTag(address) === Tag.NUMBER;
  }

  isBoolean(address: number): boolean {
    return this.isFalse(address) || this.isTrue(address);
  }

  isNull(address: number): boolean {
    return this.getTag(address) === Tag.NULL;
  }

  isUndefined(address: number): boolean {
    return this.getTag(address) === Tag.UNDEFINED;
  }

  isChan(address: number): boolean {
    return this.getTag(address) === Tag.CHAN;
  }

  isStruct(address: number): boolean {
    return this.getTag(address) === Tag.STRUCT;
  }

  isArray(address: number): boolean {
    return this.getTag(address) === Tag.ARRAY;
  }

  isSlice(address: number): boolean {
    return this.getTag(address) === Tag.SLICE;
  }

  isClosure(address: number): boolean {
    return this.getTag(address) === Tag.CLOSURE;
  }

  isBuiltin(address: number): boolean {
    return this.getTag(address) === Tag.BUILTIN;
  }

  isString(address: number): boolean {
    return this.getTag(address) === Tag.STRING;
  }

  isEnvironment(address: number): boolean {
    return this.getTag(address) === Tag.ENVIRONMENT;
  }

  isFrame(address: number): boolean {
    return this.getTag(address) === Tag.FRAME;
  }

  isBlockFrame(address: number): boolean {
    return this.getTag(address) === Tag.BLOCKFRAME;
  }

  isCallFrame(address: number): boolean {
    return this.getTag(address) === Tag.CALLFRAME;
  }

  isExtension(address: number): boolean {
    return this.getTag(address) === Tag.EXTENSION;
  }

  isWaitSend(address: number): boolean {
    return this.getTag(address) === Tag.WAIT_SEND;
  }

  isWaitReceive(address: number): boolean {
    return this.getTag(address) === Tag.WAIT_RECEIVE;
  }

  // numbers are represented as a tagged pointer with the number
  // as the second word.
  // there are no children.
  allocateNumber(value: number): number {
    const address = this.allocate(Tag.NUMBER, 0);
    this.setWord(address + 1, value);
    return address;
  }

  // channels are represented as a tagged pointer.
  // they have 2 children: hasItem, which points to either
  // FALSE or TRUE, and item, which points to the item in the channel.
  allocateChannel(): number {
    const addr = this.allocate(Tag.CHAN, 2);
    this.setWord(addr + 1, this.False);
    this.setWord(addr + 2, this.Unallocated);
    return addr;
  }

  channelIsFull(chan: number): boolean {
    if (!this.isChan(chan)) {
      throw new Error("Not a channel");
    }
    return this.getWord(chan + 1) === this.True;
  }

  channelIsEmpty(chan: number): boolean {
    if (!this.isChan(chan)) {
      throw new Error("Not a channel");
    }
    return this.getWord(chan + 1) === this.False;
  }

  channelPopItem(chan: number): number {
    if (!this.isChan(chan)) {
      throw new Error("Not a channel");
    }
    if (this.channelIsEmpty(chan)) {
      throw new Error("Channel is empty");
    }
    const item = this.getWord(chan + 2);
    this.setWord(chan + 2, this.Unallocated);
    this.setWord(chan + 1, this.False);
    return item;
  }

  channelPushItem(chan: number, item: number) {
    if (!this.isChan(chan)) {
      throw new Error("Not a channel");
    }
    if (this.channelIsFull(chan)) {
      throw new Error("Channel is full");
    }
    this.setWord(chan + 2, item);
    this.setWord(chan + 1, this.True);
  }

  // structs - dont know yet
  // most likely a tagged pointer with children pointing to the fields
  // of the struct.
  allocateStruct(): number {
    return this.allocate(Tag.STRUCT, 0);
  }

  // an abstraction for allocating a new item with any number of children.
  // this is useful for arrays, slices, closures, and environments.
  allocateItemWithExtension(tag: Tag, children: number): number {
    // check the size of the item - how many extensions do we need?
    let addr: number;

    // track the number of objects added to the working set
    let numberAdded = 0;

    // from the number of children given, we can calculate the number of extensions required
    const numExtensions = children === 0 ? 0 : Math.ceil(children / 8) - 1;

    // the remainder of the children
    const offset = children % 8;

    // allocate the first node
    addr = this.allocate(tag, children > 8 ? 9 : children);
    // protect the address from GC
    this.working.push(addr);
    numberAdded++;

    // set all children to UNALLOCATED
    // we don't need to care about the offset since
    // our logic will prevent us from accessing the children
    // that are out of bounds anyway
    for (let i = 1; i <= 9; i++) {
      this.setWord(addr + i, this.Unallocated);
    }

    let working = addr;
    if (numExtensions > 0) {
      // allocate the extensions
      for (let i = 0; i < numExtensions; i++) {
        // if this is the last extension,
        // we need to set the number of children to the offset
        // except if the offset is 0, in which case we set it to 8
        const ext = this.allocateExtension(
          i === numExtensions - 1 ? (offset === 0 ? 8 : offset) : 9,
        );
        // protect the extension from GC
        this.working.push(ext);
        numberAdded++;
        // set the extension node to the working node
        this.setWord(working + 9, ext);
        // set every child of the extension to UNALLOCATED
        for (let i = 1; i <= 9; i++) {
          this.setWord(ext + i, this.Unallocated);
        }
        // traverse down the extension node
        working = ext;
      }
    }
    // set the last extension node to UNALLOCATED
    this.setWord(working + 9, this.Unallocated);

    // revert the working set
    this.working = this.working.slice(0, this.working.length - numberAdded);

    return addr;
  }

  // arrays are represented as a tagged pointer.
  // they have children which correspond to the given size of the
  // array.
  // the metadata consists of the size of the array.
  allocateArray(size: number): number {
    let addr = this.allocateItemWithExtension(Tag.ARRAY, size);

    // set the last 4 bytes to the size of the array
    this.heap.setInt32(addr * WORD_SIZE + 4, size);

    return addr;
  }

  accessArrayIndex(array: number, index: number): number {
    if (!this.isArray(array)) {
      throw new Error("Not an array");
    }
    if (!this.isNumber(index)) {
      throw new Error("Index is not a number");
    }

    const indexValue = this.addressToValue(index);
    const size = this.heap.getInt32(array * WORD_SIZE + 4);
    if (indexValue >= size) {
      throw new Error("Index out of bounds");
    }

    // calculate the extension node to access
    const nodesAway = Math.floor(indexValue / 8);
    const offset = indexValue % 8;

    // traverse <nodesAway> nodes down the array
    let working = array;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isArray(working))) {
        throw new Error("Not an array");
      }
      working = this.getWord(working + 9);
    }

    // get the address of the val
    const val = this.getWord(working + offset + 1);
    return val;
  }

  assignArrayIndex(array: number, index: number, value: number) {
    if (!this.isArray(array)) {
      throw new Error("Not an array");
    }
    if (!this.isNumber(index)) {
      throw new Error("Index is not a number");
    }

    const indexValue = this.addressToValue(index);
    const size = this.heap.getInt32(array * WORD_SIZE + 4);
    if (indexValue >= size) {
      throw new Error("Index out of bounds");
    }

    // calculate the extension node to access
    const nodesAway = Math.floor(indexValue / 8);
    const offset = indexValue % 8;

    // traverse <nodesAway> nodes down the array
    let working = array;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isArray(working))) {
        throw new Error("Not an array");
      }
      working = this.getWord(working + 9);
    }

    // set the address to the value
    this.setWord(working + offset + 1, value);
  }

  // slices are represented as a tagged pointer.
  // they have 1 child, which points to the array.
  // or perhaps we need more children corresponding to the size of
  // the slice?
  allocateSlice(arr: number): number {
    const addr = this.allocate(Tag.SLICE, 1);
    this.setWord(addr + 1, arr);
    return addr;
  }

  // closures are represented as a tagged pointer.
  // the metadata consists of the arity of the closure,
  // and the pc of the closure, both represented with Int16.
  // metadata: [arity: 2 bytes] [pc: 2 bytes]
  // they have 1 child, pointing to the environment of the closure.
  allocateClosure(arity: number, pc: number, e: number): number {
    const addr = this.allocate(Tag.CLOSURE, 1);
    this.heap.setInt16(addr * WORD_SIZE + 4, arity);
    this.heap.setInt16(addr * WORD_SIZE + 6, pc);
    // set the env here
    this.setWord(addr + 1, e);
    return addr;
  }

  getClosureArity(closure: number): number {
    if (!this.isClosure(closure)) {
      throw new Error("Not a closure");
    }
    return this.heap.getInt16(closure * WORD_SIZE + 4);
  }

  getClosurePC(closure: number): number {
    if (!this.isClosure(closure)) {
      throw new Error("Not a closure");
    }
    return this.heap.getInt16(closure * WORD_SIZE + 6);
  }

  getClosureEnv(closure: number): number {
    if (!this.isClosure(closure)) {
      throw new Error("Not a closure");
    }
    return this.getWord(closure + 1);
  }

  // builtins are represented as a tagged pointer.
  // they have no children.
  // the metadata consists of the id of the builtin to call.
  allocateBuiltin(id: number): number {
    const addr = this.allocate(Tag.BUILTIN, 0);
    this.heap.setInt32(addr * WORD_SIZE + 4, id);
    return addr;
  }

  getBuiltinArity(addr: number): number {
    if (!this.isBuiltin(addr)) {
      throw new Error("Not a builtin");
    }
    return this.builtins[this.heap.getInt32(addr * WORD_SIZE + 4)][0];
  }

  getBuiltinFunction(addr: number): Function {
    if (!this.isBuiltin(addr)) {
      throw new Error("Not a builtin");
    }
    return this.builtins[this.heap.getInt32(addr * WORD_SIZE + 4)][1];
  }

  hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash >>> 0;
  }

  fetchAddressFromStringPool(hash: number): number | undefined {
    if (this.stringPool[hash] === undefined) {
      return undefined;
    }
    return this.stringPool[hash][0];
  }

  // strings have no children,
  // but have a hash corresponding to the string hash in the string pool.
  allocateString(str: string): number {
    // todo: implement the hash function plus the string pool
    const hash = this.hashString(str);
    const addr_or_undefined = this.fetchAddressFromStringPool(hash);

    if (addr_or_undefined !== undefined) {
      return addr_or_undefined;
    }

    const addr = this.allocate(Tag.STRING, 0);

    // add the string to the string pool
    this.stringPool[hash] = [addr, str];

    this.setWord(addr + 1, hash);
    return addr;
  }

  getString(address: number): string {
    if (!this.isString(address)) {
      throw new Error("Not a string");
    }
    const hash = this.getWord(address + 1);
    return this.stringPool[hash][1];
  }

  // environments are represented as a tagged pointer.
  // they have children corresponding to the frames in the environment.
  // the metadata consists of the number of frames in the environment.
  allocateEnvironment(frames: number): number {
    let addr = this.allocateItemWithExtension(Tag.ENVIRONMENT, frames);
    this.heap.setInt32(addr * WORD_SIZE + 4, frames);
    return addr;
  }

  getNumEnvironmentFrames(env: number): number {
    if (!this.isEnvironment(env)) {
      throw new Error("Not an environment");
    }
    return this.heap.getInt32(env * WORD_SIZE + 4);
  }

  // allocate a new environment, given a parent environment and a frame.
  extendEnvironment(env: number, frame: number): number {
    if (!this.isEnvironment(env)) {
      throw new Error("Not an environment");
    }
    if (!this.isFrame(frame)) {
      throw new Error("Not a frame");
    }
    // track how many objects we add to the working set
    let numAdded = 0;

    // protect both the environment and frame
    this.working.push(env);
    numAdded++;
    this.working.push(frame);
    numAdded++;

    // get the number of frames from the environment
    const frames = this.getNumEnvironmentFrames(env);

    // allocate a new environment with frames + 1
    const addr = this.allocateEnvironment(frames + 1);

    // protect the new environment
    this.working.push(addr);
    numAdded++;

    // now we need to iterate through the old environment and copy every frame
    // to the new environment.
    let newWorking = addr;
    let oldWorking = env;
    // while the old working node has an extension, match the extension
    while (this.getNumChildren(oldWorking) > 8) {
      for (let i = 1; i <= 8; i++) {
        this.setWord(addr + i, this.getWord(env + i));
      }
      // traverse down both the old and new working nodes
      newWorking = this.getWord(newWorking + 9);
      oldWorking = this.getWord(oldWorking + 9);
    }

    // 2 cases are possible here:
    // 1. the old working node has < 8 children, so we can just copy the last frame on top of it.
    //    keep in mind that this still works if the old working node is currently pointing to <unallocated>
    //    so all is good.
    // 2. the old environment has exactly 8 children, so we need to traverse to our newly created
    // extension node and copy the last frame there.
    const oldFrames = this.getNumChildren(oldWorking);
    if (oldFrames < 8) {
      for (let i = 1; i <= oldFrames; i++) {
        this.setWord(addr + i, this.getWord(env + i));
      }
      // set the new frame
      this.setWord(addr + oldFrames + 1, frame);
    } else {
      // case 2 - traverse to the extension node and copy the last frame there
      newWorking = this.getWord(newWorking + 9);
      this.setWord(newWorking + oldFrames + 1, frame);
    }
    // revert the working set
    this.working = this.working.slice(0, this.working.length - numAdded);
    return addr;
  }

  // get the environment value at a given index.
  // the index is represented by [frame index, binding index]
  // both are 0-indexed.
  getEnvironmentValue(env: number, index: [number, number]): number {
    if (!this.isEnvironment(env)) {
      throw new Error("Not an environment");
    }
    let [frameIndex, bindingIndex] = index;

    // we must calculate the correct position from the index
    const nodesAway = Math.floor(frameIndex / 8);
    const offset = frameIndex % 8;

    // traverse <nodesAway> nodes away from the frame
    let working = env;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isEnvironment(working))) {
        throw new Error("Not an environment");
      }
      working = this.getWord(working + 9);
    }

    // working now points to the correct node
    const frame = this.getWord(working + offset + 1);
    return this.getFrameValue(frame, bindingIndex);
  }

  // set the environment value at a given index.
  // the index is represented by [frame index, binding index]
  // both are 0-indexed.
  setEnvironmentValue(env: number, index: [number, number], value: number) {
    if (!this.isEnvironment(env)) {
      throw new Error("Not an environment");
    }
    let [frameIndex, bindingIndex] = index;

    // we must calculate the correct position from the index
    const nodesAway = Math.floor(frameIndex / 8);
    const offset = frameIndex % 8;

    // traverse <nodesAway> nodes away from the frame
    let working = env;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isEnvironment(working))) {
        throw new Error("Not an environment");
      }
      working = this.getWord(working + 9);
    }

    // working now points to the correct node
    const frame = this.getWord(working + offset + 1);
    this.setFrameValue(frame, bindingIndex, value);
  }

  // frames are represented as a tagged pointer.
  // they have children corresponding to the bindings in the frame.
  allocateFrame(bindings: number): number {
    const addr = this.allocateItemWithExtension(Tag.FRAME, bindings);

    return addr;
  }

  // get the value at a given index in the frame.
  // index is 0-indexed.
  getFrameValue(frame: number, index: number): number {
    if (!this.isFrame(frame)) {
      throw new Error("Not a frame");
    }

    // we must calculate the correct position from the index
    const nodesAway = Math.floor(index / 8);
    const offset = index % 8;

    // traverse <nodesAway> nodes away from the frame
    let working = frame;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isFrame(working))) {
        throw new Error("Not a frame");
      }
      working = this.getWord(working + 9);
    }

    // now we can get the offset from the working node
    return this.getWord(working + offset + 1);
  }

  // set the value at a given index in the frame.
  // index is 0-indexed.
  setFrameValue(frame: number, index: number, value: number) {
    if (!this.isFrame(frame)) {
      throw new Error("Not a frame");
    }
    // we must calculate the correct position from the index
    const nodesAway = Math.floor(index / 8);
    const offset = index % 8;
    // traverse <nodesAway> nodes away from the frame
    let working = frame;

    for (let i = 0; i < nodesAway; i++) {
      if (!(this.isExtension(working) || this.isFrame(working))) {
        throw new Error("Not a frame");
      }
      working = this.getWord(working + 9);
    }

    // now we can get the offset from the working node
    this.setWord(working + offset + 1, value);
  }

  // block frames are represented as a tagged pointer, with
  // the environment of the block frame as the single child.
  allocateBlockFrame(env: number): number {
    const addr = this.allocate(Tag.BLOCKFRAME, 1);
    this.setWord(addr + 1, env);
    return addr;
  }

  getBlockFrameEnv(blockFrame: number): number {
    if (!this.isBlockFrame(blockFrame)) {
      throw new Error("Not a block frame");
    }
    return this.getWord(blockFrame + 1);
  }

  // call frames are represented as a tagged pointer, with
  // the environment of the call frame as the single child.
  allocateCallFrame(env: number, pc: number): number {
    const addr = this.allocate(Tag.CALLFRAME, 1);
    this.setWord(addr + 1, env);
    this.setWord(addr + 2, pc);
    return addr;
  }

  getCallFrameEnv(callFrame: number): number {
    if (!this.isCallFrame(callFrame)) {
      throw new Error("Not a call frame");
    }
    return this.getWord(callFrame + 1);
  }

  getCallFramePC(callFrame: number): number {
    if (!this.isCallFrame(callFrame)) {
      throw new Error("Not a call frame");
    }
    return this.getWord(callFrame + 2);
  }

  // extension frames are represented as a tagged pointer, with
  // children corresponding to the fields in the extension.
  allocateExtension(children: number): number {
    return this.allocate(Tag.EXTENSION, children);
  }

  // wait sends are tracked by goroutines, and represent the items the goroutines are waiting on.
  // they have one child, which points to the channel they are waiting on.
  allocateWaitSend(chan: number): number {
    const addr = this.allocate(Tag.WAIT_SEND, 1);
    this.setWord(addr + 1, chan);
    return addr;
  }

  getWaitSendChan(waitSend: number): number {
    if (!this.isWaitSend(waitSend)) {
      throw new Error("Not a wait send");
    }
    return this.getWord(waitSend + 1);
  }

  // similar idea for wait receives.
  allocateWaitReceive(chan: number): number {
    const addr = this.allocate(Tag.WAIT_RECEIVE, 1);
    this.setWord(addr + 1, chan);
    return addr;
  }

  getWaitReceiveChan(waitReceive: number): number {
    if (!this.isWaitReceive(waitReceive)) {
      throw new Error("Not a wait receive");
    }
    return this.getWord(waitReceive + 1);
  }

  valueToAddress(value: any): number {
    if (typeof value === "number") {
      return this.allocateNumber(value);
    }
    if (typeof value === "boolean") {
      return value ? this.True : this.False;
    }
    if (typeof value === "string") {
      return this.allocateString(value);
    }
    if (value === null) {
      return this.Null;
    }
    if (value === undefined) {
      return this.Undefined;
    }
    throw new Error("Unsupported value");
  }

  addressToValue(address: number): any {
    if (this.isNumber(address)) {
      return this.getWord(address + 1);
    }
    if (this.isBoolean(address)) {
      return this.isTrue(address);
    }
    if (this.isString(address)) {
      return this.getString(address);
    }
    if (this.isNull(address)) {
      return null;
    }
    if (this.isUndefined(address)) {
      return undefined;
    }
    throw new Error("Unsupported address");
  }

  // debug

  // for debugging: return a string that shows the bits
  // of a given word
  word_to_string = (word: number) => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setFloat64(0, word);
    let binStr = "";
    for (let i = 0; i < 8; i++) {
      binStr += ("00000000" + view.getUint8(i).toString(2)).slice(-8) + " ";
    }
    return binStr;
  };

  typeOfTag(tag: Tag): string {
    switch (tag) {
      case Tag.FALSE:
      case Tag.TRUE:
        return "boolean";
      case Tag.NUMBER:
        return "number";
      case Tag.NULL:
        return "null";
      case Tag.UNDEFINED:
        return "undefined";
      case Tag.CHAN:
        return "channel";
      case Tag.STRUCT:
        return "struct";
      case Tag.ARRAY:
        return "array";
      case Tag.SLICE:
        return "slice";
      case Tag.CLOSURE:
        return "closure";
      case Tag.BUILTIN:
        return "builtin";
      case Tag.STRING:
        return "string";
      case Tag.ENVIRONMENT:
        return "environment";
      case Tag.FRAME:
        return "frame";
      case Tag.BLOCKFRAME:
        return "block frame";
      case Tag.CALLFRAME:
        return "call frame";
      case Tag.EXTENSION:
        return "extension";
      case Tag.WAIT_SEND:
        return "wait send";
      case Tag.WAIT_RECEIVE:
        return "wait receive";
      case Tag.FREE:
        return "free";
      case Tag.UNALLOCATED:
        return "unallocated";
      default:
        return "unknown";
    }
  }
}
