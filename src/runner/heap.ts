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

  private readonly heap: DataView;

  // free pointers are represented by a "linked list" of free nodes.
  private freePointer: number;

  // constructor for the heap.
  // remember that the size is given in bytes.
  private constructor(size: number) {
    this.freePointer = 0;
    this.heap = new DataView(new ArrayBuffer(size));

    // then initialize the free pointers as required
    let i = 0;
    // set every node EXCEPT THE LAST to point to the next node
    for (; (i + NODE_SIZE) * WORD_SIZE < size; i += NODE_SIZE) {
      // set the value of the free pointer to the next free node
      this.setFreePointerAtAddress(i, i + NODE_SIZE);
    }
    // finally, set the last free pointer to -1
    this.setFreePointerAtAddress(i, -1);
  }

  // create a new heap with a size given in megabytes.
  static create(size: number): Heap {
    return new Heap(size * MEGABYTE);
  }

  // create a new heap with a size given in bytes.
  // we can use this to test GC with smaller heaps.
  static createWithBytes(size: number): Heap {
    return new Heap(size);
  }

  setWord(address: number, value: number) {
    this.heap.setFloat64(address * WORD_SIZE + 8, value);
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
    if (this.isFree(address)) {
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
      // if, even after GC, we are out of memory, throw an error
      if (this.freePointer === -1) {
        throw new Error("Out of memory");
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

  mark(address: number) {
    this.setByteAtOffset(address, 1, 1);
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
        // if the first node is unmarked, we free it.
        this.free(current);
      }
    }
  }

  garbageCollect() {
    // mark and sweep algorithm
    throw new Error("Not implemented");
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

  // On literals:
  // there will only ever be a single instance of true, false,
  // null, undefined, and the UNALLOCATED object, defined in the heap.
  // these all have no children, and will only be recognised by their tag.
  createGlobalEnv(): number {
    // TODO: implement the builtins and literals here
    return this.allocate(Tag.ENVIRONMENT, 0);
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
    // TODO: implement the 2 children
    return this.allocate(Tag.CHAN, 2);
  }

  // structs - dont know yet
  // most likely a tagged pointer with children pointing to the fields
  // of the struct.
  allocateStruct(): number {
    return this.allocate(Tag.STRUCT, 0);
  }

  // arrays are represented as a tagged pointer.
  // they have children which correspond to the given size of the
  // array.
  // the metadata consists of the size of the array.
  allocateArray(size: number): number {
    // TODO: addional logic for children + extension
    const addr = this.allocate(Tag.ARRAY, size);
    // set the last 4 bytes to the size of the array
    this.heap.setInt32(addr * WORD_SIZE + 4, size);
    return addr;
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

  // builtins are represented as a tagged pointer.
  // they have no children.
  // the metadata consists of the id of the builtin to call.
  allocateBuiltin(id: number): number {
    const addr = this.allocate(Tag.BUILTIN, 0);
    this.heap.setInt32(addr * WORD_SIZE + 4, id);
    return addr;
  }

  // strings have no children,
  // and have a hash corresponding to the string hash in the string pool.
  allocateString(str: string): number {
    // todo: implement the hash function plus the string pool
    const hash = 0;
    const addr = this.allocate(Tag.STRING, 0);
    this.heap.setInt32(addr * WORD_SIZE + 4, hash);
    return addr;
  }

  // environments are represented as a tagged pointer.
  // they have children corresponding to the frames in the environment.
  allocateEnvironment(frames: number): number {
    // todo: additional logic for children beyond the first 8
    return this.allocate(Tag.ENVIRONMENT, frames);
  }

  // frames are represented as a tagged pointer.
  // they have children corresponding to the bindings in the frame.
  allocateFrame(bindings: number): number {
    // todo: additional logic for children beyond the first 8
    return this.allocate(Tag.FRAME, bindings);
  }

  // block frames are represented as a tagged pointer, with
  // the environment of the block frame as the single child.
  allocateBlockFrame(env: number): number {
    const addr = this.allocate(Tag.BLOCKFRAME, 1);
    this.setWord(addr + 1, env);
    return addr;
  }

  // call frames are represented as a tagged pointer, with
  // the environment of the call frame as the single child.
  allocateCallFrame(env: number): number {
    const addr = this.allocate(Tag.CALLFRAME, 1);
    this.setWord(addr + 1, env);
    return addr;
  }

  // extension frames are represented as a tagged pointer, with
  // children corresponding to the fields in the extension.
  allocateExtension(children: number): number {
    return this.allocate(Tag.EXTENSION, children);
  }
}