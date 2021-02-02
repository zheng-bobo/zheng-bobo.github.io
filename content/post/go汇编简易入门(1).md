---
title: go汇编简易入门(1)
categories: [go]
date: 2020-12-30 11:25:47  +0800 
---

# 程序的存储空间布局

&emsp;&emsp;`进程(Process)`是一个正在执行的程序实例(instance)。每个实例有自己的地址空间和执行状态。当操作系统向内核数据结构中添加了适当的信息，并为运行程序代码分配必要的资源之后，程序就变成了进程。

&emsp;&emsp;`线程`是代表了进程内执行线程(a thread of execution within a process)的一种抽象数据类型。线程有自己的执行栈，程序计数器值，寄存器集合和状态。


Linux进程在虚拟内存中的标准内存段布局大致如下图所示：
![layout of program.png](https://i.loli.net/2020/12/30/Fe3QLr5UHPmjYgR.png)

<br/>

&emsp;&emsp;用户进程内部采用[分段式内存管理](https://baike.baidu.com/item/%E5%9F%BA%E6%9C%AC%E5%88%86%E6%AE%B5%E5%AD%98%E5%82%A8%E7%AE%A1%E7%90%86%E6%96%B9%E5%BC%8F),分段存储内容如下所示（按地址递减顺序)
<br/>

|名称|存储内容|
|  ----  | ----  | 
|栈	(Stack)|局部变量、函数参数、返回地址等
|堆 （Heap）|	动态分配的内存
|BSS段（Block Started by Symbol Segment）|	未初始化或初值为0的全局变量和静态局部变量,通常是指用来存放程序中已初始化的全局变量的一块内存区域。
|数据段 (Data Segment)|已初始化且初值非0的全局变量和静态局部变量,通常是指用来存放程序中已初始化的全局变量的一块内存区域。
|代码段	(Text Segemnt)|可执行代码、字符串字面值、只读变量,通常是指用来存放程序执行代码的一块内存区域。

<br/>

可以通过`size`命令查看可执行二进制程序的`section size`以及`total size`，通过指定`-A`参数使其按照`System V size`输出。默认是按照B`erkeley size`输出。

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

|名称|含义|
|  ----  | ----  |
|__TEXT |代码段
|__DATA|数据段
|__OBJC|Objective-C运行时支持库；
|dec|The ‘dec’ (as a decimal number) is the sum of text, data and bss:dec（decimal的缩写，即十进制数）是text，data和bss的算术和。
|hex|hex值是dec值的十六进制表示。

<br/>

# 汇编知识简单介绍

golang源代码使用的`AT&T`格式和`Plan9`汇编(应用层)编写。 

##   AT&T格式 
AT&T 汇编指令的基本格式为：

```
操作码 [操作数]

操作码 [源操作数] [目的操作数] 

```
&emsp;&emsp;可以看到每一条汇编指令通常都由两部分组成：

* 操作码：操作码指示CPU执行什么操作，比如是执行加法，减法还是读写内存。每条指令都必须要有操作码。

* 操作数：操作数是操作的对象，比如加法操作需要两个加数，这两个加数就是这条指令的操作数。操作数的个数一般是0个，1个或2个。

&emsp;&emsp;如果操作数有两个，则第一个为源操作数，第二个为目的操作数，目的操作数表示这条指令执行完后结果应该保存的地方。

几个汇编指令的例子：

```
add  %rdx,%rax
```

&emsp;&emsp;这条指令的操作码是add，表示执行加法操作，它有两个操作数，rdx和rax。如果一条指令有两个操作数，那么第一个操作数叫做源操作数，第二个操作数叫做目的操作数，顾名思义，目的操作数表示这条指令执行完后结果应该保存的地方。所以上面这条指令表示对rax和rdx寄存器里面的值求和，并把结果保存在rax寄存器中。其实这条指令的第二个操作数rax寄存器既是源操作数也是目的操作数，因为rax既是加法操作的两个加数之一，又得存放加法操作的结果。这条指令执行完后rax寄存器的值发生了改变，指令执行前的值被覆盖而丢失了，如果rax寄存器之前的值还有用，那么就得先用指令把它保存到其它寄存器或内存之中。

再来看一个只有一个操作数的例子：

```
callq 0x400526 
```

&emsp;&emsp;这条指令的操作码是callq，表示调用函数，操作数是0x400526，它是被调用函数的地址。

最后来看一条没有操作数的指令：

```
retq
```

&emsp;&emsp;这条指令只有操作码retq，表示从被调用函数返回到调用函数继续执行。


对于 AT&T 格式的汇编指令，一些说明如下：

1. 寄存器名需要加`%`作为前缀，立即数前加`$`。
2. 寄存器[间接寻址](https://baike.baidu.com/item/%E5%AF%84%E5%AD%98%E5%99%A8%E9%97%B4%E6%8E%A5%E5%AF%BB%E5%9D%80)的格式为`offset(%register)`，如果`offset`为 0，则可以略去偏移不写直接写成 `(%register)`。
3. AT&T格式的汇编指令中如果有寄存器操作数，则根据寄存器的名字（比如rax, eax, ax, al分别代表64，32，16和8位寄存器）就可以确定操作数到底是多少位（8，16，32还是64位）。


##    寄存器
应用层代码一般会用到三类 19 个寄存器：

1.  `通用寄存器`（64 位）：`rax`, `rbx`, `rcx`, `rdx`, `rsi`, `rdi`, `rbp`, `rsp`, `r8`, `r9`, `r10`, `r11`, `r12`, `r13`, `r14`, `r15` 寄存器。CPU 对这 16 个通用寄存器的用途没有做特殊规定，程序员和编译器可以自定义其用途（`rsp/rbp`寄存器其实是有特殊用途的）；<br/>

2.  程序计数寄存器（64 位，PC寄存器，有时也叫 IP 寄存器）：`rip` 寄存器。它用来存放下一条即将执行的指令的地址，这个寄存器决定了程序的执行流程；
3.  `段寄存器`：`fs` 和 `gs` 寄存器（两个都是 16 位）。一般用它来实现`线程本地存储（TLS）`，比如 AMD64 linux 平台下 go 语言和 pthread 都使用 fs 寄存器来实现系统线程的 TLS。
4.  有4个核心的`伪寄存器`，这4个寄存器是编译器用来维护上下文、特殊标识等作用的：
   
    `FP(Frame pointer)`: arguments and locals

    `PC(Program counter)`: jumps and branches

    `SB(Static base pointer)`: global symbols

    `SP(Stack pointer)`: top of stack

<br/>
&emsp;&emsp;上面16个通用寄存器还可以作为32/16/8位寄存器使用，只是使用时需要换一个名字，比如可以用eax这个名字来表示一个32位的寄存器，它使用的是rax寄存器的低32位。

为了便于查阅，下表列出这些64通用寄存器对应的32/16/8位寄存器的名字：
![universally register.png](https://i.loli.net/2020/12/30/h96UQZNBfCE8oWR.png)

<br/>
&emsp;&emsp;两个特殊的通用寄存器`rsp栈顶寄存器`和`rbp栈基址寄存器`

&emsp;&emsp;这两个寄存器都跟函数调用栈有关，其中rsp寄存器一般用来存放函数调用栈的栈顶地址，而rbp寄存器通常用来存放函数的栈帧起始地址，编译器一般使用这两个寄存器加一定偏移的方式来访问函数局部变量或函数参数，比如：

```
mov 0x8(%rsp),%rdx
```

&emsp;&emsp;这条指令把地址为`0x8(%rsp)`的内存中的值拷贝到rdx寄存器，这里的`0x8(%rsp)`就利用了`rsp寄存器`加偏移8的方式来读取内存中的值(函数的传参)。


##   Plan9 Go汇编

&emsp;**1**. Plan9 中使用寄存器不需要带`r`或`e`的前缀，例如`rax`，只要写`AX`即可: 

```
MOVQ $101, AX = mov $101, %rax
```

&emsp;**2**. AT&T格式的寄存器操作码一般使用小写且寄存器的名字前面有个%符号，而go汇编使用大写而且寄存器名字前没有%符号，比如:

```
#AT&T格式
mov %rbp,%rsp

#go汇编格式
MOVQ BP,SP
```

&emsp;&emsp;下面是通用通用寄存器的名字在AMD64和PLAN9中的对应关系:
![IA64和plan9.png](https://i.loli.net/2021/01/01/JVwCdEuq5BPQSGU.png)

&emsp;**3**. 与内存相关的一些指令的操作码会加上 `b`，`w`，`l` 和 `q` 字母分别表示操作的内存是 `1`，`2`，`4` 还是 `8` 个字节，比如指令 `movl $0x0,-0x8(%rbp)` ，操作码 `movl` 的后缀字母 `l `说明我们要把从 `-0x8(%rbp)` 这个地址开始的 4 个内存单元赋值为 0。

&emsp;**4**.  LEA 和 MOV，其中LEA用于操作地址；而MOV用于操作数据。例如：

```
LEAQ 8(SP), SI // argv 把 8(SP)地址放入 SI 寄存器中
MOVQ 0(SP), DI // argc 把0(SP)内容放入 DI 寄存器中
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

&emsp;&emsp;1. 指定生成liunx64位系统架构下汇编代码
   
&emsp;&emsp;GOOS=linux GOARCH=amd64 go tool compile -S compliation_add.go 

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

&emsp;&emsp;FUNCDATA和PCDATA指令包含用于通过垃圾收集器的使用信息,由编译器引入。

<br/>
&emsp;&emsp;2.查看二进制文件的汇编

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
&emsp;&emsp;有关go汇编的简易入门知识就介绍到这里，本篇文章也是在借鉴大神的文章下整理出来的,相信读者看到这里对汇编还有很多疑问。<br/>
<br/>
&emsp;&emsp;本人也在继续学习中，后续我会继续介绍整理go汇编的更深次的知识，比如:

&emsp;&emsp;&emsp;&emsp;`伪寄存器`:`FP(Frame pointer)`,`PC(Program counter)`,`SB(Static base pointer)`,`SP(Stack pointer)`的作用？<br/>
&emsp;&emsp;&emsp;&emsp;`rsp栈顶寄存器`和`rbp栈基址寄存器`两个关键寄存器的详细描述？<br/>
&emsp;&emsp;&emsp;&emsp;`main协程`是如何创建并调度启动的？<br/>
&emsp;&emsp;&emsp;&emsp;...<br/>

&emsp;&emsp;我将在之后的文章中继续解读这些问题，与君共勉！


# 扩展知识
<br/>
&emsp;&emsp;AT&T汇编与Intel汇编指令区别

![AT&T汇编与Intel汇编指令区别:.png](https://i.loli.net/2020/12/30/M4wXpDlL5j1yPTF.png)

# 参考资料
[(进程的内存布局三)Linux进程在内存中的布局](http://m.blog.chinaunix.net/uid-69961881-id-5829403.html)

[go语言调度器源代码情景分析之二：CPU寄存器](https://www.cnblogs.com/abozhang/p/10766689.html)

[Golang汇编](https://www.jianshu.com/p/47422b239f8b?utm_campaign=studygolang.com&utm_medium=studygolang.com&utm_source=studygolang.com)

[A Quick Guide to Go's Assembler](https://golang.org/doc/asm)