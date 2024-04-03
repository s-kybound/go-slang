export class Stack<T> {
  private stack: T[] = [];
  push(value: T) {
    this.stack.push(value);
  }
  pop(): T {
    const res = this.stack.pop()
    if (res === undefined) {
      throw new Error("Stack is empty");
    }
    return res;
  }
  isEmpty() {
    return this.stack.length === 0;
  }
  constructor () {}
}