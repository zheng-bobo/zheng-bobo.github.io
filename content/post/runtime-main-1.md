---
title: main goroutine调度源码分析(1)
categories: [go]
date: 2019-11-10 14:40:10 +0800 
---

<!-- HTML方式: 直接在 Markdown 文件中编写 HTML 来调用 -->
<!-- 其中 class="blockquote-center" 是必须的 -->
<blockquote class="blockquote-center">
汇编之下,一切踪迹皆显。 <br/>
<!--&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;——郑燮-->
<!-- 右对齐 -->
</blockquote>

### 1.go程序入口_rt0_amd64_linux:
```
//  TEXT 指令定义符号 _rt0_amd64_linux, 全局数据符号用 DATA 声明，GLOBL 定义数据为全局。

//  SB SB虚拟寄存器：保存程序地址空间的起始地址; 这个SB寄存器保存的值就是TEXT段的起始地址，它主要用来定位全局符号。 
//  有关进程在内存中的分配结构可以查看https://vites.app/article/dev/8a9fa889.html 
//  go汇编中的函数定义、函数调用、全局变量定义以及对其引用会用到这个SB虚拟寄存器。

//  NOSPLIT 表示该函数无须检查堆栈溢出

//  $-8: $a-b a参数说明函数的栈帧大小字节，b参数说明被调用函数的参数和返回值需要占用的字节大小。
//  go语言中函数调用的参数和返回值都是放在调用者的栈上的，所以在函数定义时需要说明到底需要在调用者的栈帧中预留多少空间
//  _rt0_amd64_linux函数没有局部变量,所以栈帧大小为0字节
//  被调用函数_rt0_amd64有两个由操作系统内核传递过来的参数是argc和argv数组的地址,所有_rt0_amd64_linux函数b参数应该为16字节，这里不知道为啥是8字节。

TEXT _rt0_amd64_linux(SB),NOSPLIT,$-8
	JMP	_rt0_amd64(SB)
```

### 2.跳转到 _rt0_amd64

```
//  golang 使用类似C风格的mian函数 int main( int argc, char** argv )
//  _rt0_amd64前两行指令把操作系统内核传递过来的参数argc和argv数组的地址分别放在DI和SI寄存器中，第三行指令跳转到 rt0_go 去执行。

TEXT _rt0_amd64(SB),NOSPLIT,$-8
	MOVQ	0(SP), DI	// argc   表示参数个数
	LEAQ	8(SP), SI	// argv   表示参数数组地址
	JMP	runtime·rt0_go(SB)
```

### 3.runtime·rt0_go函数较长，我们将其拆分成小段观看：

```
// 这里调整栈顶寄存器的值使其按16字节对齐，也就是让栈顶寄存器SP指向的内存的地址为16的倍数，之所以要按16字节对齐，是因为CPU有一组SSE指令，这些指令中出现的内存地址必须是16的倍数。
// 原理就是将地址&0xFFFF0,将小于16的位数置为0
TEXT runtime·rt0_go(SB),NOSPLIT,$0
	// copy arguments forward on an even stack
	MOVQ	DI, AX		        // argc
	MOVQ	SI, BX		        // argv
	SUBQ	$(4*8+7), SP		// 2args 2auto
	ANDQ	$~15, SP            // 调整栈顶寄存器使其按16字节对齐
	MOVQ	AX, 16(SP)          // argc放在SP+ 16字节处
	MOVQ	BX, 24(SP)          // argv放在SP+ 24字节处
```

### 4.runtime·rt0_go继续向下:

```
// g0全局变量定义在proc.go文件,是一个runtime.g类型，runtinme.g0描述了一个root goroutine，主要通用goroutine调度时使用。

// 初始化g0的栈空间,栈顶栈底指针指向地址,及stackguard0,stackguard1成员变量

// stackguard0,stackguard1作用稍后分析

// create istack out of the given (operating system) stack.
	// _cgo_init may update stackguard.
	MOVQ	$runtime·g0(SB), DI         // g0的地址放入DI寄存器
	LEAQ	(-64*1024+104)(SP), BX      // BX=SP- 64*1024 + 104
	MOVQ	BX, g_stackguard0(DI)       // g0.stackguard0 =SP- 64*1024 + 104
	MOVQ	BX, g_stackguard1(DI)       // g0.stackguard1 =SP- 64*1024 + 104
	MOVQ	BX, (g_stack+stack_lo)(DI)  // g0.stack.lo =SP- 64*1024 + 104,指向栈底位置
	MOVQ	SP, (g_stack+stack_hi)(DI)  // g0.stack.hi =SP，指向栈顶位置
```

#### stackguard0,stackguard1的作用:
&emsp;&emsp;Go语言使用可可调整大小的堆栈。每个goroutine从一个小的堆栈(大约2kb)开始，并且每次达到某个阈值时其大小都会更改。而是否到达阈值是在每个函数功能开始执行前检查的
&emsp;&emsp;例如以下的main函数汇编语言：

```
"".main t=1 size=48 value=0 args=0x0 locals=0x8
	0x0000 00000 (test.go:3)	TEXT	"".main+0(SB),$8-0  
    // 取线程本地存储第一个变量TLS[0]到CX寄存器，执行当前线程正在运行的curg(runtime.g) tls后面具体介绍
	0x0000 00000 (test.go:3)	MOVQ	(TLS),CX   
    // 取当前栈顶地址与curg.stackguard0比较 
	0x0009 00009 (test.go:3)	CMPQ	SP,16(CX)  
    // 未达到栈地址阈值则跳转到22
	0x000d 00013 (test.go:3)	JHI	,22          
    // 达到栈地址阈值执行  
	0x000f 00015 (test.go:3)	CALL	,runtime.morestack_noctxt(SB) runtime.morestack_noctxt 函数分配更多的栈空间
	0x0014 00020 (test.go:3)	JMP	,0
	0x0016 00022 (test.go:3)	SUBQ	$8,SP
```
&emsp;&emsp;stackguard1 的作用跟stackguard0类似，它是用于cgo的堆栈增长

### 5.runtime·rt0_go继续向下:


```
// CPU型号检查
// 在这里，我们试图找出我们正在使用的处理器。
// 如果是Intel，则设置runtime.lfenceBeforeRdtsc变量。
// 这里根据不同的汇编指令获取不同型号的CPU ticks。
// 用于runtime/alg.go文件中，以选择计算机体系结构本身支持的适当哈希算法。
	// find out information about the processor we're on
	MOVL	$0, AX
	CPUID
	MOVL	AX, SI
	CMPL	AX, $0
	JE	nocpuinfo

	// Figure out how to serialize RDTSC.
	// On Intel processors LFENCE is enough. AMD requires MFENCE.
	// Don't know about the rest, so let's do MFENCE.
	CMPL	BX, $0x756E6547  // "Genu"
	JNE	notintel
	CMPL	DX, $0x49656E69  // "ineI"
	JNE	notintel
	CMPL	CX, $0x6C65746E  // "ntel"
	JNE	notintel
	MOVB	$1, runtime·isIntel(SB)
	MOVB	$1, runtime·lfenceBeforeRdtsc(SB)
notintel:

	// Load EAX=1 cpuid flags
	MOVL	$1, AX
	CPUID
	MOVL	AX, runtime·processorVersionInfo(SB)

```

```
//  cgo初始化相关的代码，跳过
nocpuinfo:
	// if there is an _cgo_init, call it.
	MOVQ	_cgo_init(SB), AX
	TESTQ	AX, AX
	JZ	needtls
	// arg 1: g0, already in DI
	MOVQ	$setg_gcc<>(SB), SI // arg 2: setg_gcc
#ifdef GOOS_android
	MOVQ	$runtime·tls_g(SB), DX 	// arg 3: &tls_g
	// arg 4: TLS base, stored in slot 0 (Android's TLS_SLOT_SELF).
	// Compensate for tls_g (+16).
	MOVQ	-16(TLS), CX
#else
	MOVQ	$0, DX	// arg 3, 4: not used when using platform's TLS
	MOVQ	$0, CX
#endif
#ifdef GOOS_windows
	// Adjust for the Win64 calling convention.
	MOVQ	CX, R9 // arg 4
	MOVQ	DX, R8 // arg 3
	MOVQ	SI, DX // arg 2
	MOVQ	DI, CX // arg 1
#endif
	CALL	AX

	// update stackguard after _cgo_init
	MOVQ	$runtime·g0(SB), CX
	MOVQ	(g_stack+stack_lo)(CX), AX
	ADDQ	$const__StackGuard, AX
	MOVQ	AX, g_stackguard0(CX)
	MOVQ	AX, g_stackguard1(CX)

#ifndef GOOS_windows
	JMP ok
#endif
```

```
// 在你的系统不支持 TLS 时跳过 TLS 设置
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

### 6. runtime·rt0_go tls设置

```
# 初始化tls(thread local storage,线程本地存储)

    // 取m0的tls成员的地址到DI寄存器
	LEAQ	runtime·m0+m_tls(SB), DI 
    // 调用settls设置线程本地存储，settls函数的参数在DI寄存器中
	CALL	runtime·settls(SB) 

	// store through it, to make sure it works
    // 获取fs段基地址并放入BX寄存器，其实就是m0.tls[1]的地址，get_tls的代码由编译器生成
	get_tls(BX) 
    // 把整型常量0x123拷贝到fs段基地址偏移-8的内存位置，也就是m0.tls[0] =0x123
	MOVQ	$0x123, g(BX) 
    // AX=m0.tls[0]
	MOVQ	runtime·m0+m_tls(SB), AX 
    // 检查m0.tls[0]的值是否是通过线程本地存储存入的0x123来验证tls功能是否正常
	CMPQ	AX, $0x123 
JEQ 2(PC)
	JEQ 2(PC)
    // 如果线程本地存储不能正常工作，退出程序
	CALL	runtime·abort(SB) 
```

####  runtime·settls(runtime/sys_linx_amd64.s)介绍:

```

// set tls base to DI
TEXT runtime·settls(SB),NOSPLIT,$32
#ifdef GOOS_android
	// Android stores the TLS offset in runtime·tls_g.
	SUBQ	runtime·tls_g(SB), DI
#else
    // DI寄存器中存放的是m.tls[0]的地址，m的tls成员是一个数组  // 读者如果忘记了可以回头看一下m结构体的定义
    // 下面这一句代码把DI寄存器中的地址加8，为什么要+8呢，主要跟ELF可执行文件格式中的TLS实现的机制有关
    // 执行下面这句指令之后DI寄存器中的存放的就是m.tls[1]的地址了
	ADDQ	$8, DI  // ELF wants to use -8(FS)
#endif
    // SI存放arch_prctl系统调用的第二个参数
	MOVQ	DI, SI  
    // arch_prctl的第一个参数
	MOVQ	$0x1002, DI	// ARCH_SET_FS  
    
	MOVQ	$SYS_arch_prctl, AX 
	SYSCALL
	CMPQ	AX, $0xfffffffffffff001
	JLS	2(PC)
    // 系统调用失败直接crash
	MOVL	$0xf1, 0xf1 
	RET
```

&emsp;&emsp;从注释可以看出，这个函数执行了 arch_prctl 系统调用，并将 ARCH_SET_FS 作为参数传入，把m0.tls[1]的地址设置成了fs段的段基址。CPU中有个叫fs的段寄存器与之对应，而每个线程都有自己的一组CPU寄存器值，操作系统在把线程调离CPU运行时会帮我们把所有寄存器中的值保存在内存中，调度线程起来运行时又会从内存中把这些寄存器的值恢复到CPU，这样，在此之后，工作线程代码就可以通过fs寄存器来找到m.tls

&emsp;&emsp;还记得 main 开始时的汇编指令吗？
```
0x0000 00000 (test.go:3)	MOVQ	(TLS),CX
```
&emsp;&emsp;在前面我已经解释了这条指令将 runtime.g 结构体实例的地址加载到 CX 寄存器中。这个结构体描述了当前 goroutine，且存储到 TLS 中。

### 7.继续回到runtime·rt0_go

```
ok:
// set the per-goroutine and per-mach "registers"
// 获取fs段基址到BX寄存器
get_tls(BX) 
// CX=g0的地址
LEAQ runtime·g0(SB), CX
// 把g0的地址保存在线程本地存储里面，也就是m0.tls[0]=&g0
MOVQ CX, g(BX) 
// AX=m0的地址
LEAQ runtime·m0(SB), AX
// 把m0和g0关联起来m0->g0 =g0，g0->m =m0
// save m->g0 =g0
MOVQ CX, m_g0(AX) //m0.g0 =g0
// save m0 to g0->m 
MOVQ AX, g_m(CX) //g0.m =m0
```

&emsp;&emsp;这里，我们将 TLS 地址加载到 BX 寄存器中,再把g0的地址放入主线程的线程本地存储中，，然后通过
```
m0.g0 = &g0
g0.m = &m0
```
把m0和g0绑定在一起，这样，之后在主线程中通过get_tls可以获取到g0，通过g0的m成员又可以找到m0，于是这里就实现了m0和g0与主线程之间的关联。

### 8.runtime·rt0_go结束

```
    CLD				// convention is D is always left cleared
	CALL	runtime·check(SB)
    // AX=argc
	MOVL	16(SP), AX		// copy argc  
    // argc放在栈顶
	MOVL	AX, 0(SP)                
    // AX=agrv
	MOVQ	24(SP), AX		// copy argv
    // agrv放在SP+8的位置
	MOVQ	AX, 8(SP)       
    // 处理操作系统传递过来的参数和env，不需要关心        
	CALL	runtime·args(SB)    
    // 对于linx来说，osinit唯一功能就是获取CPU的核数并放在global变量ncpu中，
    // 调度器初始化时需要知道当前系统有多少CPU核
    // 执行的结果是全局变量 ncpu = CPU核数
	CALL	runtime·osinit(SB)  
    // 调度系统初始化
	CALL	runtime·schedinit(SB)  
```

&emsp;&emsp;至此,runtime·rt0_go结束。g0初始化完成,m0通过tls绑定了系统线程,且g0与m0相互绑定。<br>

参考资料：
[Go语言：启动和内存分配初始化](https://cloud.tencent.com/developer/article/1486607)
[Go语言调度器源代码情景分析](https://www.cnblogs.com/abozhang/p/10813229.html)
[Golang Internals, Part 5: the Runtime Bootstrap Process](https://studygolang.com/articles/2833)