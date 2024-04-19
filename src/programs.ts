export const fibonacci = `
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
	display("Hello, World!");
	c := make_channel();
	quit := make_channel();
	funisdone := make_channel();
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
`;

export const interleave = `
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
  for x := 0; x < 100; x = x + 1 {
    display(x);
  }
  display("async1 done");
}

func async2(c chan number) {
  display("async2 running:");
  for x := 100; x < 200; x = x + 1 {
    display(x);
  }
  display("async2 done");
  c <- 0;
}

func main() {
  d := make_channel();
  func inner() {
    display("hello");
  }
  x, y, z := 1, 2, 3;
  check(x, y, z);
  x, y, z = give_three();
  check(x, y, z);
  check(a, b, c);
  inner();
  go async1();
  go async2(d);
  display("main running:");
  display("7");
  display("8");
  display("9");
  // block on channel d
  <-d;
  display("main done");
}
`