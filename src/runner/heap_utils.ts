// utilities for creating and using values in the heap, represented as a tagged pointer array buffer.

// initialize the heap, allocate the free pointers based on a given word size, 
// later to be changed to pages.
// size is given in megabytes.
export function initHeap(size: number, pageSize: number): SharedArrayBuffer {
  const megabytes = 2 ** 20;
  const memory = new SharedArrayBuffer(size * megabytes);
  // all relevant values are stored in the first 8 bytes of the memory.
  // the first 4 bytes of the memory are reserved to store the free pointer of the memory.
  // the next 4 bytes are reserved to store the word size of the memory.
  const freePointer = new DataView(memory);
  // set the pageSize in the memory.
  freePointer.setInt32(4, pageSize);
  // TODO: allocate the pageTable in the memory.

  // allocate the free pointers based on the page size
  let i = 8;
  for (i = 8; i <= size - pageSize; i += pageSize) {
    freePointer.setFloat64(i, i + pageSize);
  }

  // set the last page to -1
  freePointer.setFloat64(i - pageSize, -1);

  // finally, set the freePointer to the first free byte in the memory.
  freePointer.setInt32(0, 8);
  return memory;
}

export namespace DataTags {
  export const False_tag          = -2   // 11111110
  export const True_tag           = -3   // 11111101
  export const Number_tag         = -4   // 11111100
  export const Null_tag           = -5   // 11111011
  export const Unassigned_tag     = -6   // 11111010
  export const Undefined_tag      = -7   // 11111001
  export const Blockframe_tag     = -8   // 11111000
  export const Callframe_tag      = -9   // 11110111
  export const Closure_tag        = -10  // 11110110
  export const Frame_tag          = -11  // 11110101
  export const Environment_tag    = -12  // 11110100
  export const Pair_tag           = -13  // 11110011
  export const Builtin_tag        = -14  // 11110010
}

// accordingly, define the type Tag
export type Tag = -2 | -3 | -4 | -5 | -6 | -7 | -8 | -9 | -10 | -11 | -12 | -13 | -14

export function getTag(heap: SharedArrayBuffer, address: number): Tag {
  const heapView = new DataView(heap);
  // get the page size
  const pageSize = heapView.getInt32(4);

  // safe to typecast - we assert that the first byte of a (allocated) page is always a tag.
  return heapView.getInt8(address * pageSize) as Tag;
}

export function heapAllocate(heap: SharedArrayBuffer, tag: Tag, size: number): number {
  const heapView = new DataView(heap);
  
  // get the page size from the memory.
  const pageSize = heapView.getInt32(4);
  
  // get the first free address in the memory.
  const currentFreePointer = heapView.getInt32(0);

  // logic for GC here:
  if (currentFreePointer === -1) {
    throw new Error("Out of memory");
  }

  // get the next free address from the memory - an empty page
  // should be set to the next address.
  const nextFreePointer = heapView.getFloat64(currentFreePointer * pageSize);

  // update the free pointer
  heapView.setInt32(0, nextFreePointer);

  // now set the tag and size of the allocated memory
  heapView.setInt8(currentFreePointer, tag);
  return currentFreePointer;
}

// set a page in the heap to a given value.
export function heapSet(heap: SharedArrayBuffer, address: number, value: number): void {
  const heapView = new DataView(heap);
  const pageSize = heapView.getInt32(4);
  heapView.setFloat64(address * pageSize, value);
}

// get a page in the heap
export function heapGet(heap: SharedArrayBuffer, address: number): number {
  const heapView = new DataView(heap);
  const pageSize = heapView.getInt32(4);
  return heapView.getFloat64(address * pageSize);
}