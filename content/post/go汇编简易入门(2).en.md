---
title: "A Practical Introduction to Go Assembly (2)"
date: 2021-01-01 12:34:14  +0800
slug: "introduction-to-go-assembly-2"
categories: ["Go"]
---


# Function call from assembly perspective

﻿ Let’s start with a simple example:

```
package main

func main() {
    add(1, 1)
}

func add(a, b int64) (c int64) {
    c = a + b
    return
}
```

 After executing the go tool compile -S compliation_add.go command, the assembly code is as follows

```
 ......
 0x0000 00000 (compliation_add.go:8) MOVQ "".b+16(SP), AX #Read the value of variable b into register ax
 0x0005 00005 (compliation_add.go:8) MOVQ "".a+8(SP), CX #Read the value of variable a into register cx
 0x000a 00010 (compliation_add.go:8) ADDQ CX, AX #Add the values ​​in registers cx and ax, and put the result back into the ax register
 0x000d 00013 (compliation_add.go:9) MOVQ AX, "".c+24(SP) #Write the value in register ax back to the memory where variable c is located
 0x0012 00018 (compliation_add.go:9) RET #Function return
 ......
```

﻿ We have mentioned above that the `sp` register points to the top address of the function call stack <br/>

﻿ Now assuming that the memory address is

The suffix `Q` of `MOVQ` means reading 8 consecutive bytes. The address in the instruction is just the starting address, which represents the address of the variable `b` in memory;
<br/>

 The second instruction is similar, except that the starting address is `X + 8` (the address of variable a in memory); <br/>

﻿﻿The last instruction means to write the value in the `AX` register into the 8 memory units starting from the address `X + 24`.

<br/>
 Why is the starting address of variable `a` not `X`, but `X + 8` memory units? This is related to the layout of the function call stack in memory.


# Function call stack

 The layout of the process in memory is as shown in the figure

![layout of process.png](https://i.loli.net/2021/01/01/eZdTbjO9fgYHInP.png)

  The function call stack is referred to as the stack. During the running of the program, whether it is the execution of a function or a function call, the stack plays a very important role. It is mainly used for:

1. Save the local variables of the function;

2. Pass parameters to the called function;

3. Return the return value of the function;

4. Save the return address of the function. The return address refers to the address of the instruction that the caller should continue to execute after returning from the called function<!--. We will explain the return address in more detail when introducing the call instruction in the assembly instructions section. -->

﻿Each function uses stack memory to save these values during execution. This region is the function's `stack frame`. On AMD64 Linux, the stack grows from high addresses toward low addresses.

<br/>
**AMD64 CPU provides 2 stack-related registers: **

* rsp register (SP), always points to the top of the function call stack

* rbp register (BP), generally used to point to the starting position of the function stack frame

<br/>
Two illustrations are used below to illustrate the function call stack and the relationship between rsp/rbp and the stack.

Assume that there is now the following function call chain and function C() is being executed:

A()->B()->C()
Then the stack frame of function ABC and the status of rsp/rbp are roughly as shown in the figure below (note that the stack grows from high address to low address):
![layout of stack1.png](https://i.loli.net/2021/01/01/Ng7PbHK5ESs9p68.png)

Regarding the above picture, there are a few points that need to be explained:

* When calling a function, parameters and return values are stored in the caller's stack frame, not in the called function;

* The C function is currently being executed, and the function call chain is A()->B()->C(), so in terms of stack frames, the stack frame of the C function is currently on the top of the stack;

* The CPU hardware register rsp points to the top of the entire stack. Of course, it also points to the top of the stack frame of the C function, and the rbp register points to the starting position of the C function stack frame;

* Although the stack frames of the three functions ABC in the picture appear to be about the same size, in fact, in a real program, the stack frame size of each function may be different, because the number of local variables and the size of the memory occupied by different functions are different;

* Some compilers such as gcc will put parameters and return values in registers instead of on the stack. The parameters and return values of functions in the Go language are placed on the stack;

<br/>

As the program runs, if both functions C and B are executed and return to function A to continue execution, the stack status will be as follows:

![layout of stack2.png](https://i.loli.net/2021/01/01/CpHXbQ5jYGD84an.png)

Because both functions C and B have completed execution and returned to function A, the stack frames of functions C and B have been popped out of the stack by POP, which means that the stack memory consumed by them has been automatically recycled. Because function A is now being executed, the registers rbp and rsp point to the corresponding positions in the stack of function A. If function A continues to call function D, the stack will look like this again:

<br/>
![layout of stack3.png](https://i.loli.net/2021/01/01/K9OaWT8MEQXcrFC.png)

<br/>
The stack frame of function D actually uses the stack memory used to call functions B and C before. Because functions B and C have been executed, function D now reuses this memory. This is why the address of function local variables should never be returned in C language, because the stack memory at the same address will be reused, but there is no such restriction in go language (escape analysis). When it finds that the program returns the address of a local variable, the compiler will put this variable on the heap. From the above analysis, we can see that the registers rbp and rsp always point to the stack frame of the executing function.

<br/>
The stack frame size of the sample code `add` function is 0. When the `add` function stack is called, the `sp` register points to the top address of the function call stack. `X` is `add`. After the function is executed, return to `main` function address, then the starting address of the first parameter variable a is `X + 8`. <br/>
Finally, execute the `RET` instruction. This step clears the stack frame of the called function ` add `, then pops the return address on the top of the stack and assigns it to the instruction register ` rip`, and the return address is the next line in the ` main ` function that calls the `add ` function.

#Virtual registers provided by go assembly

In addition to these registers that correspond one-to-one to the AMD64 CPU hardware registers, the go assembly also introduces several virtual registers that do not correspond to any hardware registers. These registers are generally used to store memory addresses. The main purpose of introducing them is to facilitate programmers and compilers to locate code and data in memory.

﻿﻿The following focuses on the use of two common virtual registers in go assembly:

***FP virtual register***: Mainly used to reference function parameters. Go language stipulates that parameters must be placed on the stack when a function is called. For example, the called function uses `first_arg+0(FP)` to reference the first parameter passed in by the caller, and `second_arg+8(FP)` to reference the second parameter. , and by analogy, the `first_arg` and `second_arg` here are just symbols to help us read the source code and have no practical meaning for the compiler. `+0` and `+8` represent the offset relative to the FP register. Let's use a function fragment in runtime as an example to see the use of FP.

　　 There is a function called gogo in go runtime, which accepts a pointer of type gobuf.

```
// func gogo(buf *gobuf)
// restore state from Gobuf; longjmp
TEXT runtime·gogo(SB), NOSPLIT, $16-8
MOVQbuf+0(FP), BX// gobuf -->bx
......
```

`MOVQ buf+0(FP), BX` This instruction puts the pointer buf passed in by the caller into the BX register. It can be seen that the gogo function obtains the parameters through `buf+0(FP)`. From the perspective of the called function (here, the gogo function), the relationship between FP and the function stack frame is as shown below. It can be seen that the FP register points to the stack frame of the caller, not the stack frame of the called function.

***SB virtual register***: Saves the starting address of the program address space. Do you still remember the picture of the layout of the process in memory that we saw in the function call stack section? The value saved in this SB register is the starting address of the code area, which is mainly used to locate global symbols. Function definitions, function calls, global variable definitions and references to them in go assembly will use this SB virtual register. We don't need to pay too much attention to this virtual register. We just know that it is a virtual register when we see it in the code.

# Function definition

 Let’s take the gogo function in go runtime as an example:

```
// func gogo(buf *gobuf)
// restore state from Gobuf; longjmp
TEXT runtime·gogo(SB), NOSPLIT, $16-8
......
```

 The following is an explanation of each part of the first line of the function definition:

* `TEXT runtime·gogo(SB)`: Indicates that a global function (symbol) named gogo is defined in the code area, and this function belongs to the runtime package.

* `NOSPLIT`: Instructs the compiler not to insert code that checks whether the stack overflows in this function.

* `$16-8`: The number 16 indicates that the stack frame size of this function is 16 bytes, and 8 indicates that the parameters and return value of this function require a total of 8 bytes of memory. Because the gogo function here has no return value, only a pointer parameter, and for the AMD64 platform, the pointer is 8 bytes. The parameters and function return values ​​of function calls in the Go language are placed on the stack, and this part of the stack memory is reserved by the caller rather than the called function. Therefore, when defining the function, you need to specify how much space needs to be reserved in the caller's stack frame.
