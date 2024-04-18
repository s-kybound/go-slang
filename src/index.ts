import { parse } from "./go-slang-parser/src"
import { GoCompiler } from "./compiler/compiler"
import { Runner } from "./runner/runner"
import { Program } from "./go-slang-parser/src/parser_mapper/ast_types";

const program = 
`
func fibonacci(c, quit chan int) {
	x, y := 0, 1;
	for ;;{
		select {
		case c <- x:
			//display("before");
			//display(x);
			x, y = y, x+y;
			//display("after");
			//display(x);
		//default:
			//display("default");
		case <- quit:
			display("quit");
			return 0;
		}
	}
}

func main() {
	c := makeChannel();
	quit := makeChannel();
	funisdone := makeChannel();
	go func() {
		for i := 0; i < 10; i = i + 1 {
			display(<-c);
		}
		quit <- 0;
		//funisdone <- 0;
	}();
	fibonacci(c, quit);
	//<-funisdone;
}
`

const ast = parse(program) as Program;

const compiler = new GoCompiler(ast);

compiler.compile();

const instructions = compiler.getInstrs();

const QUANTUM = 22;

const runner = new Runner(instructions, QUANTUM, 4);
console.log("running program...")
runner.run();