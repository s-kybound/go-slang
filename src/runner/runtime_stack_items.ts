import { Environment } from "./env";

export interface CallFrame {
  type: "call";
  pc: number;
  env: Environment;
}

export interface BlockFrame {
  type: "block";
  env: Environment;
}

export type Frame = CallFrame | BlockFrame;

export function makeCallFrame(env: Environment, pc: number): CallFrame {
  return { type: "call", env, pc};
}

export function makeBlockFrame(env: Environment): BlockFrame {
  return { type: "block", env };
}

export function isCallFrame(frame: Frame): frame is CallFrame {
  return frame.type === "call";
}

export function isBlockFrame(frame: Frame): frame is BlockFrame {
  return frame.type === "block";
}
