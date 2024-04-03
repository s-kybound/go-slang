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

func async1() {
  display("async1 running:");
  for x := 0; x < 10000; x = x + 1 {
    display(x);
  }
  display("async1 done");
}

func async2() {
  display("async2 running:");
  for x := 10000; x < 20000; x = x + 1 {
    display(x);
  }
  display("async2 done");
}

func main() {
  /*func inner() {
    display("hello");
  }
  x, y, z := 1, 2, 3;
  check(x, y, z);
  x, y, z = give_three();
  check(x, y, z);
  check(a, b, c);
  inner();*/
  go async1();
  go async2();
  display("main running:");
  display("7");
  display("8");
  display("9");
  display("main done");
}
`

const ast = parse(program) as Program;

const compiler = new GoCompiler(ast);

compiler.compile();

const instructions = compiler.getInstrs();

const QUANTUM = 22;

const runner = new Runner(instructions, QUANTUM);

runner.run();