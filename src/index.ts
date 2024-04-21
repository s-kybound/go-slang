#!/usr/bin/env node

import yargs from "yargs/yargs";
import fs from "fs";
import { parse } from "./go-slang-parser/src";
import { GoCompiler } from "./compiler/compiler";
import { Runner } from "./runner/runner";
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";
import { Instr } from "./compiler/instructions";
import { GoTypeChecker } from "./type-checker/type_checker";

export async function compile(program: string): Promise<Instr[]> {
  let ast: Program;
  try {
    ast = parse(program) as Program;
  } catch (e) {
    console.error(e);
    console.log("Parsing error: Please check your program and try again.");
    throw e;
  }

  const typeChecker = new GoTypeChecker(ast);
  try {
    typeChecker.typeCheck();
  } catch (e) {
    console.error(e);
    console.log("Type error: Please check your program and try again.");
    throw e;
  }

  const compiler = new GoCompiler(ast);

  try {
    compiler.compile();
  } catch (e) {
    console.error(e);
    console.log("Compilation error: Please check your program and try again.");
    throw e;
  }
  return compiler.getInstrs();
}

export async function compile_and_run(
  program: string,
  quantum: number,
  size: number,
  inBytes: boolean,
  debug: boolean = false,
): Promise<void> {
  const instrs = await compile(program);
  const runner = new Runner(instrs, quantum, size, inBytes, debug);
  runner.run();
}

const argv = yargs(process.argv.slice(2))
  .usage("Usage: $0 <file> [options]")
  .demandCommand(1, "Please specify a file to run")
  .example(
    "$0 test/fibonacci.go -q 50 -s 5",
    "Run the program in test/fibonacci.go with a quantum of 50 instructions/goroutine and a heap size of 5 MiB",
  )
  .option("q", {
    alias: "quantum",
    describe:
      "The time quantum for the program. Set to 20 instructions/goroutine by default",
    type: "number",
    default: 20,
  })
  .option("s", {
    alias: "size",
    describe:
      "The size of the heap, specified in MiB by default. Set to 8 by default",
    type: "number",
    default: 8,
  })
  .option("inBytes", {
    describe: "If the size is specified in bytes. Set to false by default",
    type: "boolean",
    default: false,
  })
  .option("debug", {
    describe:
      "Enable debug mode, which emits debug information during execution to stderr",
    type: "boolean",
    default: false,
  })
  .help("h")
  .alias("h", "help")
  .parseSync();

const file = argv._[0];
const quantum = argv.q as number;
const size = argv.s as number;
const inBytes = argv.inBytes as boolean;
const debug = argv.debug as boolean;

let program: string;
try {
  program = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(e);
  console.log("File error: Please check the file path and try again.");
  process.exit(1);
}

compile_and_run(program, quantum, size, inBytes, debug).catch((e) => {
  console.error(e);
  process.exit(1);
});
