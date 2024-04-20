import { parse } from "./go-slang-parser/src"
import { GoCompiler } from "./compiler/compiler"
import { Runner } from "./runner/runner"
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";
import { Instr } from "./compiler/instructions";

export async function compile(program: string): Promise<Instr[]> {
  const ast = parse(program) as Program;

  const compiler = new GoCompiler(ast);

  compiler.compile();

  return compiler.getInstrs();
}

export async function compile_and_run(
  program: string,
  quantum: number, 
  size: number, 
  inBytes: boolean): Promise<void> {

  const instrs = await compile(program);
  const runner = new Runner(instrs, quantum, size, inBytes);
  runner.run();
}