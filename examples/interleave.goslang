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
