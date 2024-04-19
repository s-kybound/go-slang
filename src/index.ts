import { parse } from "./go-slang-parser/src"
import { GoCompiler } from "./compiler/compiler"
import { Runner } from "./runner/runner"
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";
import * as programs from "./programs";
const program = programs.calltheGC;

const ast = parse(program) as Program;

const compiler = new GoCompiler(ast);

compiler.compile();

const instructions = compiler.getInstrs();

const QUANTUM = 22;

const runner = new Runner(instructions, QUANTUM, 8000, true);

runner.run();