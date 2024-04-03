import { parse } from "./go-slang-parser/src"
import { GoCompiler } from "./compiler/compiler"
import { Runner } from "./runner/runner"
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";

const program = 
`
const a, b, c number = 1, 2, 3;

func add(x, y number) number {
  return x + y;
}

func sub(x, y number) number {
  return x - y;
}

func main() {
  x := add(a, b);
  y := sub(c, a);
  display(x);
  display(y);
}
`

const ast = parse(program) as Program;

const compiler = new GoCompiler(ast);

compiler.compile();

const instructions = compiler.getInstrs();

console.log(instructions);

const QUANTUM = 10;

const runner = new Runner(instructions, QUANTUM);

runner.run();