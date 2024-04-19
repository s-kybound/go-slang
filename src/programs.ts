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

export const calltheGC = `
func main() {
  // spawns a lot of numbers in the heap
  for i := 0; i < 1000000; i = i + 1 {
    display(i);
  }
  return;
}
`

export const lotsOfDeclarations = `
func main() {
  // this should demonstrate that frames can contain a lot of declarations
  const a, b, c number = 1, 2, 3;
  const d, e, f number = 4, 5, 6;
  const g, h, i number = 7, 8, 9;
  const j, k, l number = 10, 11, 12;
  const m, n, o number = 13, 14, 15;
  const p, q, r number = 16, 17, 18;
  const s, t, u number = 19, 20, 21;
  const v, w, x number = 22, 23, 24;
  const y, z number = 25, 26;
  display(a);
  display(b);
  display(c);
  display(d);
  display(e);
  display(f);
  display(g);
  display(h);
  display(i);
  display(j);
  display(k);
  display(l);
  display(m);
  display(n);
  display(o);
  display(p);
  display(q);
  display(r);
  display(s);
  display(t);
  display(u);
  display(v);
  display(w);
  display(x);
  display(y);
  display(z);
  return;
}
`;

export const deadlock = `
func main() {
  c := make_channel();
  c <- 1;
  c <- 2;
  return;
}
`;

export const forLoop = `
func main() {
  for i := 0; i < 10; i = i + 1 {
    display(i);
  }
  return;
}
`;

export const ifStatement = `
func main() {
  if x := 1; true {
    display(x);
    display("true");
  } else {
    display(x);
    display("false");
  }
  return;
}
`;

export const createStackOverflow = `
func main() {
  x := "hello world!";
  display(x);
  main();
  return;
}
`;

export const makeArray = `
func main() {
  a := make_array(10);
  // the array is currently empty
  a[0] = 1;
  a[1] = 2;
  display(a[0]);
  display(a[1]);
  return;
}
`;

export const makeArrayStressTest = `
func main() {
  a := make_array(1000);
  for i := 0; i < 1000; i = i + 1 {
    a[i] = i;
  }
  for i := 0; i < 1000; i = i + 1 {
    display(a[i]);
  }
  return;
}
`;