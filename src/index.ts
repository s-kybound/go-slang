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

func give_three() (number, number, number) {
  return 4, 5, 6;
}

func check(x, y, z number) {
  display(x);
  display(y);
  display(z);
}

func main() {
  x, y, z := 1, 2, 3;
  check(x, y, z);
  x, y, z = give_three();
  check(x, y, z);
}
`

const ast = parse(program) as Program;

const compiler = new GoCompiler(ast);

compiler.compile();

const instructions = compiler.getInstrs();

const QUANTUM = 10;

const runner = new Runner(instructions, QUANTUM);

runner.run();