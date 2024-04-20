# go-slang

## Table of Contents

- [About](#about)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Testing](#testing)
- [Current Issues](#current-issues)

## About

An implementation of a subset of the language _Go_, created for CS4215 term project for AY23/24 Semester 2.

Currently, our implementation exhibits the following features:

- Realistic Virtual Machine with heap and instruction compiler
- Concurrent execution achieved with timeslicing
- Synchronization primitives with unbuffered channels
- Support for select-case statement
- Mark-and-sweep Garbage Collection
- Dynamic resizing of heap

All in all, our implementation allows learners to reason about and play with the message passing paradigm using _Go_. 

## Prerequisites

- NodeJS v20

## Usage

To build,

```bash
$ git clone --recurse-submodules https://github.com/CS4215-AY2324S2-joy-kyriel/go-slang.git
$ cd go-slang
$ yarn
$ yarn build
```

This repository uses git submodules. To update existing repositories with a submodule,

```bash
# Init is only required on the very first time.
$ git submodule update --init --recursive
# Required subsequently every time you want to update the submodules.
$ git submodule update --recursive --remote
```

To try out _go-slang_, run:

```bash
$ yarn build
```

Followed by:

```bash
$ node dist/index.js <YOUR PROGRAM HERE>
```

_go-slang_ can be run with several options, such as changing the time quantum or heap size. For more information, run:

```bash
$ node dist/index.js --help
```

```{.}
Usage: index.js <file> [options]

Options:
      --version  Show version number                                   [boolean]
  -q, --quantum  The time quantum for the program. Set to 20
                 instructions/goroutine by default        [number] [default: 20]
  -s, --size     The size of the heap, specified in MiB by default. Set to 8 by
                 default                                   [number] [default: 8]
      --inBytes  If the size is specified in bytes. Set to false by default
                                                      [boolean] [default: false]
      --debug    Enable debug mode, which emits debug information during
                 execution to stderr                  [boolean] [default: false]
  -h, --help     Show help                                             [boolean]
```

Several example programs are left in the `examples` folder. Give them a try!

## Current issues

### Erroneous behaviour with too little memory

_go-slang_ is able to resize its heap during runtime, if garbage collection fails to free memory. However, starting a program with too little
memory may impact the correctness of _go-slang_ in program execution. (for example, `example/fibonacci.goslang` fails to execute properly with less than 4320 bytes) While we prevent you from allocating less than 80 bytes (the size of a single node), do be careful with the number of bytes allocated to your program!

### Data types

There are only 3 primitive data types, `number`, `string`, and `bool`. Currently, _go-slang_ represents all numbers with the `number` type. Arrays and Channels can be used, but only with the `make_array()` and `make_channel()` builtin - they cannot be initialized directly by the user. The parser and heap support Slice and Struct data types, but these are unsupported by our current instruction set.
