import { Goroutine } from "./runner/goroutines/goroutine";

export interface Stdlib {
  [key: string]: [number, (g: Goroutine) => any];
}

export const stdlib: Stdlib = {
  display: [1, (g: Goroutine) => { 
    const addr = g.operandStack.pop();
    console.log(g.heap.addressToValue(addr));
    return addr; 
  }],

  make_channel: [0, (g: Goroutine) => {
    const channel = g.heap.allocateChannel();
    return channel;
  }],

  make_array: [1, (g: Goroutine) => {
    const size = g.operandStack.pop();
    const sizeValue = g.heap.addressToValue(size);
    const array = g.heap.allocateArray(sizeValue);
    return array;
  }],

  is_number: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    return g.heap.valueToAddress(g.heap.isNumber(addr));
  }],

  is_boolean: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    return g.heap.valueToAddress(g.heap.isBoolean(addr));
  }],

  is_string: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    return g.heap.valueToAddress(g.heap.isString(addr));
  }],

  is_undefined: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    return g.heap.valueToAddress(g.heap.isUndefined(addr));
  }],

  is_function: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    return g.heap.valueToAddress(g.heap.isClosure(addr));
  }],

  math_sqrt: [1, (g: Goroutine) => {
    const addr = g.operandStack.pop();
    const value = g.heap.addressToValue(addr);
    return g.heap.valueToAddress(Math.sqrt(value));
  }],
}

export interface Constants {
  [key: string]: number;
}

export const constants: Constants = {
  math_E: Math.E,
  math_LN2: Math.LN2,
  math_LN10: Math.LN10,
  math_LOG2E: Math.LOG2E,
  math_LOG10E: Math.LOG10E,
  math_PI: Math.PI,
  math_SQRT1_2: Math.SQRT1_2,
  math_SQRT2: Math.SQRT2,
}