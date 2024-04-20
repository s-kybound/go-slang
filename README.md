# go-slang

An implementation of a subset of the language _Go_, created for CS4215 term project for AY23/24 Semester 2

## Table of Contents

- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Testing](#testing)

## Prerequisites

- NodeJS v20

## Usage

To build,

```bash
$ git clone --recurse-submodules https://github.com/CS4215-AY2324S2-joy-kyriel/go-slang.git
$ cd js-slang
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

_go-slang_ is able to resize its heap during runtime, if garbage collection fails to free memory. However, starting a program with too little
memory may impact the correctness of _go-slang_ in program execution. (for example, `example/fibonacci.goslang` fails to execute properly with less than 4320 bytes) While we prevent you from allocating less than 80 bytes (the size of a single node), do be careful with the number of bytes allocated to your program!