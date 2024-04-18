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
    // todo - add free tag
    this.heap.setInt32(address * WORD_SIZE + 4, next);
  }

  getFreePointerAtAddress(address: number): number {
    return this.heap.getInt32(address * WORD_SIZE + 4);
  }

  // the accessors for the tagged pointer
  setTag(address: number, tag: number) {
    this.setByteAtOffset(address, 0, tag);
  }

  getTag(address: number): number {
    return this.getByteAtOffset(address, 0);
  }

  set_num_children(address: number, children: number) {
    this.set2BytesAtOffset(address, 2, children);
  }

  get_num_children(address: number): number {
    return this.get2BytesAtOffset(address, 2);
  }

  // allocates a node in the heap, setting the tag and number of children.
  // returns the address allocated.
  allocate(tag: number, children: number): number {
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
    this.set_num_children(newNode, children);

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
      if (!this.isMarked(current)) {
        // if the first node is unmarked, we free it.
        this.free(current);
      }
    }
  }

  garbageCollect() {
    // mark and sweep algorithm
    throw new Error("Not implemented");
  }
}