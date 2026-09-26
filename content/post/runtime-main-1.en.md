---
title: "Inside Go's Main Goroutine Scheduler (1)"
date: 2019-11-10 14:40:10 +0800
slug: "go-main-goroutine-scheduler-1"
categories: ["Go"]
---


<!-- HTML method: Write HTML directly in the Markdown file to call -->
<!-- where class="blockquote-center" is required -->
<blockquote class="blockquote-center">
Under the compilation, all traces are revealed. <br/>
<!--                 Zheng Xie -->
<!-- Right aligned -->
</blockquote>

### 1.go program entry_rt0_amd64_linux:
```
// The TEXT instruction defines the symbol _rt0_amd64_linux, the global data symbol is declared with DATA, and GLOBL defines the data as global.

// SB SB virtual register: saves the starting address of the program address space; the value saved by this SB register is the starting address of the TEXT segment, which is mainly used to locate global symbols.
// For the allocation structure of the process in memory, you can view https://vites.app/article/dev/8a9fa889.html
// Function definitions, function calls, global variable definitions and references to them in go assembly will use this SB virtual register.

// NOSPLIT means that this function does not need to check for stack overflow

// $-8: $a-b The a parameter specifies the stack frame size of the function in bytes, and the b parameter specifies the byte size required for the parameters and return value of the called function.
// The parameters and return values ​​of function calls in the Go language are placed on the caller's stack, so when defining the function, you need to explain how much space needs to be reserved in the caller's stack frame.
// The _rt0_amd64_linux function has no local variables, so the stack frame size is 0 bytes
// The called function _rt0_amd64 has two parameters passed by the operating system kernel, which are the addresses of the argc and argv arrays. All _rt0_amd64_linux function b parameters should be 16 bytes. I don’t know why it is 8 bytes.

TEXT _rt0_amd64_linux(SB),NOSPLIT,$-8
    JMP    _rt0_amd64(SB)
```

### 2. Jump to _rt0_amd64

```
// golang uses C-style main function int main( int argc, char** argv )
// The first two lines of instructions of _rt0_amd64 place the addresses of the parameter argc and argv arrays passed by the operating system kernel in the DI and SI registers respectively. The third line of instructions jumps to rt0_go for execution.

TEXT _rt0_amd64(SB),NOSPLIT,$-8
    MOVQ 0(SP), DI // argc represents the number of parameters
    LEAQ 8(SP), SI // argv represents the parameter array address
    JMP    runtime·rt0_go(SB)
```

### 3. The runtime·rt0_go function is long, so we split it into small segments to watch:

```
//Here, adjust the value of the register on top of the stack so that it is aligned to 16 bytes, that is, the memory address pointed to by register SP on the top of the stack is a multiple of 16. The reason why it is aligned to 16 bytes is because the CPU has a set of SSE instructions, and the memory addresses appearing in these instructions must be multiples of 16.
//The principle is to set the address &0xFFFF0 and set the digits less than 16 to 0
TEXT runtime·rt0_go(SB),NOSPLIT,$0
    // copy arguments forward on an even stack
    MOVQ    DI, AX                // argc
    MOVQ    SI, BX                // argv
    SUBQ    $(4*8+7), SP        // 2args 2auto
    ANDQ $~15, SP //Adjust the top register of the stack to align it to 16 bytes
    MOVQ AX, 16(SP) // argc is placed at SP+ 16 bytes
    MOVQ BX, 24(SP) // argv is placed at SP+ 24 bytes
```

### 4.runtime·rt0_go continues down:

```
// The g0 global variable is defined in the proc.go file and is a runtime.g type. runtinme.g0 describes a root goroutine and is mainly used for general goroutine scheduling.

// Initialize the stack space of g0, the top and bottom pointers of the stack point to the address, and the stackguard0 and stackguard1 member variables

//The functions of stackguard0 and stackguard1 will be analyzed later

// create istack out of the given (operating system) stack.
    // _cgo_init may update stackguard.
    MOVQ $runtime·g0(SB), DI //Put the address of g0 into the DI register
    LEAQ    (-64*1024+104)(SP), BX      // BX=SP- 64*1024 + 104
    MOVQ    BX, g_stackguard0(DI)       // g0.stackguard0 =SP- 64*1024 + 104
    MOVQ    BX, g_stackguard1(DI)       // g0.stackguard1 =SP- 64*1024 + 104
    MOVQ BX, (g_stack+stack_lo)(DI) // g0.stack.lo =SP- 64*1024 + 104, pointing to the bottom of the stack
    MOVQ SP, (g_stack+stack_hi)(DI) // g0.stack.hi =SP, points to the top of the stack
```

#### The functions of stackguard0 and stackguard1:
﻿Go language uses a resizable stack. Each goroutine starts with a small stack (about 2kb) and its size changes every time a certain threshold is reached. Whether the threshold is reached is checked before each function starts executing.
 For example, the following main function assembly language:

```
"".main t=1 size=48 value=0 args=0x0 locals=0x8
    0x0000 00000 (test.go:3)    TEXT    "".main+0(SB),$8-0
    // Get the first variable TLS[0] stored locally in the thread to the CX register, and execute curg(runtime.g) that the current thread is running. Tls will be introduced in detail later.
    0x0000 00000 (test.go:3)    MOVQ    (TLS),CX
    // Compare the current top address of the stack with curg.stackguard0
    0x0009 00009 (test.go:3)    CMPQ    SP,16(CX)
    //If the stack address threshold is not reached, jump to 22
    0x000d 00013 (test.go:3)    JHI    ,22
    //Execute when stack address threshold is reached
    0x000f 00015 (test.go:3) CALL ,runtime.morestack_noctxt(SB) runtime.morestack_noctxt function allocates more stack space
    0x0014 00020 (test.go:3)    JMP    ,0
    0x0016 00022 (test.go:3)    SUBQ    $8,SP
```
  stackguard1 has a similar function to stackguard0. It is used for cgo stack growth.

### 5.runtime·rt0_go continues down:


```
//CPU model check
// Here we are trying to find out which processor we are using.
// If it is Intel, set the runtime.lfenceBeforeRdtsc variable.
//Here, CPU ticks of different models are obtained based on different assembly instructions.
// Used in the runtime/alg.go file to select the appropriate hashing algorithm natively supported by the computer architecture.
    // find out information about the processor we're on
    MOVL    $0, AX
    CPUID
    MOVL    AX, SI
    CMPL    AX, $0
    JE    nocpuinfo

    // Figure out how to serialize RDTSC.
    // On Intel processors LFENCE is enough. AMD requires MFENCE.
    // Don't know about the rest, so let's do MFENCE.
    CMPL    BX, $0x756E6547  // "Genu"
    JNE    notintel
    CMPL    DX, $0x49656E69  // "ineI"
    JNE    notintel
    CMPL    CX, $0x6C65746E  // "ntel"
    JNE    notintel
    MOVB    $1, runtime·isIntel(SB)
    MOVB    $1, runtime·lfenceBeforeRdtsc(SB)
notintel:

    // Load EAX=1 cpuid flags
    MOVL    $1, AX
    CPUID
    MOVL    AX, runtime·processorVersionInfo(SB)

```

```
// cgo initialization related code, skip
nocpuinfo:
    // if there is an _cgo_init, call it.
    MOVQ    _cgo_init(SB), AX
    TESTQ    AX, AX
    JZ    needtls
    // arg 1: g0, already in DI
    MOVQ    $setg_gcc<>(SB), SI // arg 2: setg_gcc
#ifdef GOOS_android
    MOVQ    $runtime·tls_g(SB), DX     // arg 3: &tls_g
    // arg 4: TLS base, stored in slot 0 (Android's TLS_SLOT_SELF).
    // Compensate for tls_g (+16).
    MOVQ    -16(TLS), CX
#else
    MOVQ    $0, DX    // arg 3, 4: not used when using platform's TLS
    MOVQ    $0, CX
#endif
#ifdef GOOS_windows
    // Adjust for the Win64 calling convention.
    MOVQ    CX, R9 // arg 4
    MOVQ    DX, R8 // arg 3
    MOVQ    SI, DX // arg 2
    MOVQ    DI, CX // arg 1
#endif
    CALL    AX

    // update stackguard after _cgo_init
    MOVQ    $runtime·g0(SB), CX
    MOVQ    (g_stack+stack_lo)(CX), AX
    ADDQ    $const__StackGuard, AX
    MOVQ    AX, g_stackguard0(CX)
    MOVQ    AX, g_stackguard1(CX)

#ifndef GOOS_windows
    JMP ok
#endif
```

```
// Skip TLS settings if your system doesn't support TLS
needtls:
#ifdef GOOS_plan9
    // skip TLS setup on Plan 9
    JMP ok
#endif
#ifdef GOOS_solaris
    // skip TLS setup on Solaris
    JMP ok
#endif
#ifdef GOOS_illumos
    // skip TLS setup on illumos
    JMP ok
#endif
#ifdef GOOS_darwin
    // skip TLS setup on Darwin
    JMP ok
#endif
```

### 6. runtime·rt0_go tls settings

```
#Initialize tls(thread local storage, thread local storage)

    // Get the address of the tls member of m0 to the DI register
    LEAQ    runtime·m0+m_tls(SB), DI
    // Call settls to set up thread local storage. The parameters of the settls function are in the DI register.
    CALL    runtime·settls(SB)

    // store through it, to make sure it works
    // Get the base address of the fs segment and put it into the BX register. It is actually the address of m0.tls[1]. The code for get_tls is generated by the compiler.
    get_tls(BX)
    //Copy the integer constant 0x123 to the memory location of the fs segment base address offset -8, that is, m0.tls[0] =0x123
    MOVQ    $0x123, g(BX)
    // AX=m0.tls[0]
    MOVQ    runtime·m0+m_tls(SB), AX
    // Check whether the value of m0.tls[0] is 0x123 stored through thread local storage to verify whether the tls function is normal
    CMPQ    AX, $0x123
JEQ 2(PC)
    JEQ 2(PC)
    // If thread local storage does not work properly, exit the program
    CALL    runtime·abort(SB)
```

#### Introduction to runtime·settls (runtime/sys_linx_amd64.s):

```

// set tls base to DI
TEXT runtime·settls(SB),NOSPLIT,$32
#ifdef GOOS_android
    // Android stores the TLS offset in runtime·tls_g.
    SUBQ    runtime·tls_g(SB), DI
#else
    //The address of m.tls[0] is stored in the DI register. The tls member of m is an array. //If the reader forgets, he can look back at the definition of the m structure.
    //The following code adds 8 to the address in the DI register. Why is it +8? It is mainly related to the TLS implementation mechanism in the ELF executable file format.
    // After executing the following instruction, the address stored in the DI register is the address of m.tls[1]
    ADDQ    $8, DI  // ELF wants to use -8(FS)
#endif
    // SI stores the second parameter of the arch_prctl system call
    MOVQ    DI, SI
    // The first parameter of arch_prctl
    MOVQ    $0x1002, DI    // ARCH_SET_FS

    MOVQ    $SYS_arch_prctl, AX
    SYSCALL
    CMPQ    AX, $0xfffffffffffff001
    JLS    2(PC)
    // System call fails and crashes directly
    MOVL    $0xf1, 0xf1
    RET
```

﻿﻿As can be seen from the comments, this function executes the arch_prctl system call, passes ARCH_SET_FS as a parameter, and sets the address of m0.tls[1] to the segment base address of the fs segment. There is a segment register called fs in the CPU corresponding to it, and each thread has its own set of CPU register values. When the operating system transfers the thread away from the CPU to run, it will help us save the values ​​in all registers in the memory. When the thread is scheduled to run, it will restore the values ​​of these registers from the memory to the CPU. In this way, after this, the worker thread code can find m.tls through the fs register.

 Do you remember the assembly instructions at the beginning of main?
```
0x0000 00000 (test.go:3)    MOVQ    (TLS),CX
```
 Previously I have explained that this instruction loads the address of the runtime.g structure instance into the CX register. This structure describes the current goroutine and is stored in TLS.

### 7. Continue back to runtime·rt0_go

```
ok:
// set the per-goroutine and per-mach "registers"
// Get the fs segment base address to the BX register
get_tls(BX)
// CX=g0 address
LEAQ runtime·g0(SB), CX
//Save the address of g0 in thread local storage, that is, m0.tls[0]=&g0
MOVQ CX, g(BX)
// AX=m0 address
LEAQ runtime·m0(SB), AX
//Associate m0 and g0 m0->g0 =g0, g0->m =m0
// save m->g0 =g0
MOVQ CX, m_g0(AX) //m0.g0 =g0
// save m0 to g0->m
MOVQ AX, g_m(CX) //g0.m =m0
```

﻿﻿Here, we load the TLS address into the BX register, then put the address of g0 into the thread local storage of the main thread, and then pass
```
m0.g0 = &g0
g0.m = &m0
```
Bind m0 and g0 together, so that g0 can be obtained through get_tls in the main thread, and m0 can be found through the m member of g0, so the association between m0 and g0 and the main thread is realized here.

### 8.runtime·rt0_go ends

```
    CLD                // convention is D is always left cleared
    CALL    runtime·check(SB)
    // AX=argc
    MOVL    16(SP), AX        // copy argc
    // argc is placed on the top of the stack
    MOVL    AX, 0(SP)
    // AX=agrv
    MOVQ    24(SP), AX        // copy argv
    // agrv is placed at SP+8
    MOVQ    AX, 8(SP)
    // Process the parameters and env passed by the operating system, no need to care
    CALL    runtime·args(SB)
    // For linx, the only function of osinit is to obtain the number of cores of the CPU and put it in the global variable ncpu.
    // When the scheduler is initialized, it needs to know how many CPU cores the current system has.
    //The result of execution is the global variable ncpu = number of CPU cores
    CALL    runtime·osinit(SB)
    // Scheduling system initialization
    CALL    runtime·schedinit(SB)
```

 At this point, runtime·rt0_go ends. The initialization of g0 is completed, m0 is bound to the system thread through tls, and g0 and m0 are bound to each other. <br>

References:
[Go language: startup and memory allocation initialization](https://cloud.tencent.com/developer/article/1486607)
[Go language scheduler source code scenario analysis](https://www.cnblogs.com/abozhang/p/10813229.html)
[Golang Internals, Part 5: the Runtime Bootstrap Process](https://studygolang.com/articles/2833)
