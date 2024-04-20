export class Stack<T> {
  private stack: T[] = [];
  push(value: T) {
    this.stack.push(value);
  }
  pop(): T {
    if (this.stack.length === 0) {
      throw new Error("Stack is empty");
    }
    const res = this.stack.pop();
    return res as T;
  }
  isEmpty() {
    return this.stack.length === 0;
  }
  forEach(callback: (value: T, index: number, array: T[]) => void) {
    this.stack.forEach(callback);
  }
  constructor() {}
}
