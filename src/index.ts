import { parse } from "./go-slang-parser/src";
import { GoCompiler } from "./compiler/compiler";
import { Runner } from "./runner/runner";
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";
import { Instr } from "./compiler/instructions";

export async function compile(program: string): Promise<Instr[]> {
  let ast: Program;
  try {
    ast = parse(program) as Program;
  } catch (e) {
    console.error(e);
    console.log("Parsing error: Please check your program and try again.");
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
): Promise<void> {
  const instrs = await compile(program);
  const runner = new Runner(instrs, quantum, size, inBytes);
  runner.run();
}
