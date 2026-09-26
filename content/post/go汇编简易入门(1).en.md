---
title: "A Practical Introduction to Go Assembly (1)"
date: 2020-12-30 11:25:47  +0800
slug: "introduction-to-go-assembly-1"
categories: ["Go"]
---


# Program storage space layout

 A `process` is an executing program instance. Each instance has its own address space and execution state. A program becomes a process when the operating system adds the appropriate information to the kernel data structures and allocates the necessary resources to run the program code.

 A `thread` is an abstract data type that represents a thread of execution within a process. A thread has its own execution stack, program counter value, register set and state.


The standard memory segment layout of a Linux process in virtual memory is roughly as shown in the figure below:
![layout of program.png](https://i.loli.net/2020/12/30/Fe3QLr5UHPmjYgR.png)

<br/>

 The user process adopts [Segmented Memory Management](https://baike.baidu.com/item/%E5%9F%BA%E6%9C%AC%E5%88%86%E6%AE%B5%E5%AD%98%E5%82%A8%E7%AE%A1%E7%90%86%E6%96%B9%E5%BC%8F) internally, and the segmented storage contents are as follows (in descending order of addresses)
<br/>

|Name|Storage content|
| ---- | ---- |
|Stack|Local variables, function parameters, return addresses, etc.
|Heap| Dynamically allocated memory
|BSS segment (Block Started by Symbol Segment)| Global variables and static local variables that are not initialized or have an initial value of 0, usually refer to a memory area used to store initialized global variables in the program.
|Data Segment|Global variables and static local variables that have been initialized and have non-zero initial values, usually refer to a memory area used to store initialized global variables in the program.
|Code segment (Text Segemnt)|Executable code, string literal value, read-only variable, usually refers to a memory area used to store program execution code.

<br/>

You can use the `size` command to view the `section size` and `total size` of the executable binary program, and specify the `-A` parameter to output it according to `System V size`. The default is to output according to B`erkeley size`.

```
func main() {
    var a, b, c = 0, 0, 0
    c = a + b
    print(c)
}

zhengxuzhangde-MacBook-Pro:compilation zhengxuzhang$ size compliation_add
__TEXT  __DATA  __OBJC  others      dec         hex
786432  131560  0       16839480    17757472    10ef520
```

<br/>

|Name|Meaning|
| ---- | ---- |
|__TEXT |Code segment
|__DATA|Data segment
|__OBJC|Objective-C runtime support library;
|dec|The ‘dec’ (as a decimal number) is the sum of text, data and bss:dec (abbreviation of decimal, that is, decimal number) is the arithmetic sum of text, data and bss.
|hex|The hex value is the hexadecimal representation of the dec value.

<br/>

# Brief introduction to assembly knowledge

The golang source code is written using the `AT&T` format and `Plan9` assembly (application layer).

## AT&T format
The basic format of AT&T assembly instructions is:

```
opcode [operand]

Opcode [source operand] [destination operand]

```
  It can be seen that every assembly instruction usually consists of two parts:

* Opcode: The opcode instructs the CPU what operation to perform, such as whether to perform addition, subtraction, or read and write memory. Every instruction must have an opcode.

* Operand: The operand is the object of the operation. For example, an addition operation requires two addends. These two addends are the operands of this instruction. The number of operands is generally 0, 1 or 2.

  If there are two operands, the first is the source operand and the second is the destination operand. The destination operand indicates where the result should be saved after the instruction is executed.

A few examples of assembly instructions:

```
add  %rdx,%rax
```

﻿﻿The opcode of this instruction is add, which means performing an addition operation. It has two operands, rdx and rax. If an instruction has two operands, the first operand is called the source operand, and the second operand is called the destination operand. As the name implies, the destination operand indicates where the result should be saved after the instruction is executed. So the above instruction means summing the values ​​in the rax and rdx registers and saving the result in the rax register. In fact, the second operand of this instruction, the rax register, is both the source and destination operands, because rax is both one of the two addends of the addition operation and must store the result of the addition operation. After this instruction is executed, the value of the rax register changes. The value before the instruction is overwritten and lost. If the previous value of the rax register is still useful, then you must first use the instruction to save it to other registers or memory.

Let’s look at an example with only one operand:

```
callq 0x400526
```

﻿﻿The opcode of this instruction is callq, which means calling a function. The operand is 0x400526, which is the address of the called function.

Finally, let’s look at an instruction without operands:

```
retq
```

﻿﻿This instruction only has the opcode retq, which means returning from the called function to the calling function to continue execution.


For AT&T format assembly instructions, some instructions are as follows:

1. The register name needs to be prefixed with `%`, and `$` before the immediate number.
2. The format of the register [Indirect Addressing](https://baike.baidu.com/item/%E5%AF%84%E5%AD%98%E5%99%A8%E9%97%B4%E6%8E%A5%E5%AF%BB%E5%9D%80) is `offset(%register)`. If `offset` is 0, you can omit the offset and write it directly as `(%register)`.
3. If there is a register operand in the AT&T format assembly instruction, you can determine how many bits the operand is (8, 16, 32 or 64 bits) based on the name of the register (for example, rax, eax, ax, and al represent 64, 32, 16, and 8-bit registers respectively).


## Register
Application layer code generally uses three types of 19 registers:

1. `General-purpose registers` (64-bit): `rax`, `rbx`, `rcx`, `rdx`, `rsi`, `rdi`, `rbp`, `rsp`, `r8`, `r9`, `r10`, `r11`, `r12`, `r13`, `r14`, `r15`. The CPU does not prescribe how these 16 registers must be used, so programmers and compilers can assign their roles (`rsp` and `rbp` do have conventional purposes). <br/>

2. Program count register (64-bit, PC register, sometimes also called IP register): `rip` register. It is used to store the address of the next instruction to be executed. This register determines the execution flow of the program;
3. `Segment registers`: `fs` and `gs` (both 16 bits). They are commonly used to implement `thread-local storage (TLS)`. For example, Go and pthreads on AMD64 Linux use `fs` to implement TLS for system threads.
4. Go assembly also defines four `pseudo-registers`. The compiler uses them to maintain context and identify special locations:

    `FP(Frame pointer)`: arguments and locals

    `PC(Program counter)`: jumps and branches

    `SB(Static base pointer)`: global symbols

    `SP(Stack pointer)`: top of stack

<br/>
﻿﻿The above 16 general-purpose registers can also be used as 32/16/8-bit registers, but they need to be renamed when used. For example, the name eax can be used to represent a 32-bit register, which uses the lower 32 bits of the rax register.

For ease of reference, the following table lists the names of the 32/16/8-bit registers corresponding to these 64 general-purpose registers:
![universally register.png](https://i.loli.net/2020/12/30/h96UQZNBfCE8oWR.png)

<br/>
﻿Two special general-purpose registers: `rsp`, the stack pointer, and `rbp`, the frame pointer

These two registers are related to the function call stack. The rsp register is generally used to store the top address of the function call stack, while the rbp register is usually used to store the stack frame starting address of the function. The compiler generally uses these two registers plus a certain offset to access function local variables or function parameters, such as:

```
mov 0x8(%rsp),%rdx
```

﻿ This instruction copies the value at memory address `0x8(%rsp)` into `rdx`. Here, `0x8(%rsp)` reads memory at the address in the `rsp` register plus an offset of 8—the location of the function parameter.


## Plan9 Go Compilation

**1**. The registers used in Plan9 do not need to be prefixed with `r` or `e`, for example, `rax`, just write `AX`:

```
MOVQ $101, AX = mov $101, %rax
```

**2**. Register opcodes in AT&T format generally use lowercase and there is a % symbol in front of the register name, while go assembly uses uppercase and there is no % symbol in front of the register name, for example:

```
#AT&T format
mov %rbp,%rsp

#go assembly format
MOVQ BP,SP
```

  The following is the correspondence between the names of general general registers in AMD64 and PLAN9:
![IA64andplan9.png](https://i.loli.net/2021/01/01/JVwCdEuq5BPQSGU.png)

**3**. The opcodes of some instructions related to memory will be added with `b`, `w`, `l` and `q` letters respectively indicating that the memory being operated is `1`, `2`, `4` or `8` bytes, such as the instruction `movl $0x0,-0x8(%rbp)`, the suffix letter of the operation code `movl` `l ` indicates that we need to assign the value of 0 to the four memory cells starting from the address `-0x8(%rbp)`.

**4**. LEA and MOV, where LEA is used to operate addresses; and MOV is used to operate data. For example:

```
LEAQ 8(SP), SI // argv puts the 8(SP) address into the SI register
MOVQ 0(SP), DI // argc puts the content of 0(SP) into the DI register
```


# Go's Assembler

```
package main

type unused struct {
    parameter1 int
}

func main() {
    var a, b, c = 0, 0, 0
    c = a + b
    print(c)
}
```

  1. Specify the generation of assembly code under the liunx64-bit system architecture

ˆ GOOS=linux GOARCH=amd64 go tool compile -S compliation_add.go

```
"".main STEXT size=69 args=0x0 locals=0x10
        0x0000 00000 (compliation_add.go:7)     TEXT    "".main(SB), ABIInternal, $16-0
        0x0000 00000 (compliation_add.go:7)     MOVQ    (TLS), CX
        0x0009 00009 (compliation_add.go:7)     CMPQ    SP, 16(CX)
        0x000d 00013 (compliation_add.go:7)     JLS     62
        0x000f 00015 (compliation_add.go:7)     SUBQ    $16, SP
        0x0013 00019 (compliation_add.go:7)     MOVQ    BP, 8(SP)
        0x0018 00024 (compliation_add.go:7)     LEAQ    8(SP), BP
        0x001d 00029 (compliation_add.go:7)     FUNCDATA        $0, gclocals·33cdeccccebe80329f1fdbee7f5874cb(SB)
        0x001d 00029 (compliation_add.go:7)     FUNCDATA        $1, gclocals·33cdeccccebe80329f1fdbee7f5874cb(SB)
        0x001d 00029 (compliation_add.go:7)     FUNCDATA        $2, gclocals·33cdeccccebe80329f1fdbee7f5874cb(SB)
        0x001d 00029 (compliation_add.go:10)    PCDATA  $0, $0
        0x001d 00029 (compliation_add.go:10)    PCDATA  $1, $0
        0x001d 00029 (compliation_add.go:10)    CALL    runtime.printlock(SB)
        0x0022 00034 (compliation_add.go:10)    MOVQ    $0, (SP)
        0x002a 00042 (compliation_add.go:10)    CALL    runtime.printint(SB)
        0x002f 00047 (compliation_add.go:10)    CALL    runtime.printunlock(SB)
        0x0034 00052 (compliation_add.go:11)    MOVQ    8(SP), BP
        0x0039 00057 (compliation_add.go:11)    ADDQ    $16, SP
        0x003d 00061 (compliation_add.go:11)    RET
        0x003e 00062 (compliation_add.go:11)    NOP
        0x003e 00062 (compliation_add.go:7)     PCDATA  $1, $-1
        0x003e 00062 (compliation_add.go:7)     PCDATA  $0, $-1
        0x003e 00062 (compliation_add.go:7)     CALL    runtime.morestack_noctxt(SB)
        0x0043 00067 (compliation_add.go:7)     JMP     0
```

﻿ FUNCDATA and PCDATA directives contain usage information used by the garbage collector, introduced by the compiler.

<br/>
  2. View the assembly of binary files

&emsp;&emsp;go tool objdump -s main.main compliation_add

```
TEXT main.main(SB) /Users/zhengxuzhang/Project/go/src/runtimeMainProject/compilation/compliation_add.go
  compliation_add.go:7  0x1051560               65488b0c2530000000      MOVQ GS:0x30, CX
  compliation_add.go:7  0x1051569               483b6110                CMPQ 0x10(CX), SP
  compliation_add.go:7  0x105156d               762f                    JBE 0x105159e
  compliation_add.go:7  0x105156f               4883ec10                SUBQ $0x10, SP
  compliation_add.go:7  0x1051573               48896c2408              MOVQ BP, 0x8(SP)
  compliation_add.go:7  0x1051578               488d6c2408              LEAQ 0x8(SP), BP
  compliation_add.go:10 0x105157d               e82e3afdff              CALL runtime.printlock(SB)
  compliation_add.go:10 0x1051582               48c7042400000000        MOVQ $0x0, 0(SP)
  compliation_add.go:10 0x105158a               e8a141fdff              CALL runtime.printint(SB)
  compliation_add.go:10 0x105158f               e89c3afdff              CALL runtime.printunlock(SB)
  compliation_add.go:11 0x1051594               488b6c2408              MOVQ 0x8(SP), BP
  compliation_add.go:11 0x1051599               4883c410                ADDQ $0x10, SP
  compliation_add.go:11 0x105159d               c3                      RET
  compliation_add.go:7  0x105159e               e84d81ffff              CALL runtime.morestack_noctxt(SB)
  compliation_add.go:7  0x10515a3               ebbb                    JMP main.main(SB)
```
<br/>
<br/>
This concludes the introduction of simple introductory knowledge about go assembly. This article is also compiled based on the articles of masters. I believe readers will still have many questions about assembly after reading this. <br/>
<br/>
I am also continuing to learn. I will continue to introduce more in-depth knowledge on organizing go assembly in the future, such as:

What are the roles of the pseudo-registers `FP (Frame pointer)`, `PC (Program counter)`, `SB (Static base pointer)`, and `SP (Stack pointer)`? <br/>
How do the two key registers, `rsp` (stack pointer) and `rbp` (frame pointer), work? <br/>
How is the `main goroutine` created and scheduled to start? <br/>
   ...<br/>

  I will continue to interpret these issues in subsequent articles and encourage you to share them!


# Expand knowledge
<br/>
  The difference between AT&T assembly and Intel assembly instructions

![Difference between AT&T assembly and Intel assembly instructions:.png](https://i.loli.net/2020/12/30/M4wXpDlL5j1yPTF.png)

# References
[(Memory layout of process 3) Linux process layout in memory](http://m.blog.chinaunix.net/uid-69961881-id-5829403.html)

[Go Language Scheduler Source Code Scenario Analysis 2: CPU Registers](https://www.cnblogs.com/abozhang/p/10766689.html)

[Golang compilation](https://www.jianshu.com/p/47422b239f8b?utm_campaign=studygolang.com&utm_medium=studygolang.com&utm_source=studygolang.com)

[A Quick Guide to Go's Assembler](https://golang.org/doc/asm)
