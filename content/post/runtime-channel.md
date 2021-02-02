---
title: channel runtime源码分析
categories: [go]
date: 2020-01-05 11:19:10 +0800 
---

&emsp;&emsp;Channel 是 Go 语言中一个非常重要的类型，是 Go 里的第一对象。通过 channel，Go 实现了通过通信来实现内存共享。Channel 是在多个 goroutine 之间传递数据和同步的重要手段。

注意：本文所有的源码分析基于`Go1.13.3`，版本不同实现可能会有出入
### channel 语法
声明 channel 的语法如下：
```
chan T // 声明一个双向通道
chan<- T // 声明一个只能用于发送的通道
<-chan T // 声明一个只能用于接收的通道
```

它的操作符是箭头 `<-` 。

```
ch <- v    // 发送值v到Channel ch中
v := <-ch  // 从Channel ch中接收数据，并将数据赋值给v
```

使用`make`初始化Channel
```
// 无缓冲通道
ch1 := make(chan int)
// 有缓冲通道
ch2 := make(chan int, 10)
```
unbuffered channe example :
```
package main

import "fmt"

func main() {

    messages := make(chan string)

    go func() { messages <- "ping" }()

    msg := <-messages
    fmt.Println(msg)
}
```
buffered channe example :
```
package main

import "fmt"

func main() {

    messages := make(chan string, 2)

    messages <- "buffered"
    messages <- "channel"

    fmt.Println(<-messages)
    fmt.Println(<-messages)
}
```

### make channel

  使用`go tool compile -N -l -S `生成汇编代码, 两种初始化chanel方式最终都是调用`CALL	runtime.makechan(SB)`汇编指令,具体看函数代码:

`src/runtime/chan.go`
```
func makechan(t *chantype, size int) *hchan {

        // 初始化，做一些基本校验,检查 channel size，align 的代码
	elem := t.elem

	// 元素类型大小限制
	if elem.size >= 1<<16 {
		throw("makechan: invalid channel element type")
	}
        // 对齐限制
	if hchanSize%maxAlign != 0 || elem.align > maxAlign {
		throw("makechan: bad alignment")
	}
       // 获取要分配的内存
	mem, overflow := math.MulUintptr(elem.size, uintptr(size))
	if overflow || mem > maxAlloc-hchanSize || size < 0 {
		panic(plainError("makechan: size out of range"))
	}
	var c *hchan
	switch {
	case mem == 0:
		// size 为 0 的情况(无缓存channel)，分配 hchan 结构体大小的内存，64位系统为 96 Byte.
		c = (*hchan)(mallocgc(hchanSize, nil, true))
		// Race detector uses this location for synchronization.
		c.buf = c.raceaddr()
	case elem.ptrdata == 0:
		// 数据项不为指针类型，调用 mallocgc 一次性分配内存大小，hchan 结构体大小 + 数据总量大小
		c = (*hchan)(mallocgc(hchanSize+mem, nil, true))
		c.buf = add(unsafe.Pointer(c), hchanSize)
	default:
	        // 数据项为指针类型，hchan 和 buf 分开分配内存，GC 中指针类型判断 reachable and unreadchable.
		c = new(hchan)
		c.buf = mallocgc(mem, elem, true)
	}
        // chan 赋值属性, 数据项大小、数据项类型、缓存数据的容量
	c.elemsize = uint16(elem.size)
	c.elemtype = elem
	c.dataqsiz = uint(size)

	if debugChan {
		print("makechan: chan=", c, "; elemsize=", elem.size, "; elemalg=", elem.alg, "; dataqsiz=", size, "\n")
	}
	return c
}
```
&emsp;&emsp;至于为什么要区分包含指针和不包含指针这两种情况，makechan 的注释给出了一段解释：
`Hchan does not contain pointers interesting for GC when elements stored in buf do not contain pointers.`
假如buf 不包含指针，可以用一块大的内存来存储 hchan 对象和缓冲区，这样当hchan结构体不被引用时可以直接回收，而如果实际元素类型里面包含指针，就要通过 mallocgc 将分配什么类型的数据告诉 gc,gc回收时需要判断这块内存的数据是否已没有引用。



`hchan`为chan的结构体
```
type hchan struct {
	qcount   uint           // buffer中数据总数
	dataqsiz uint           // buffer的容量
	buf      unsafe.Pointer // buffer的开始指针
	elemsize uint16         // channel中数据的大小
	closed   uint32         // channel是否关闭，0 => false，其他都是true
	elemtype *_type       // channel数据类型
	sendx    uint              // buffer中正在send的element的index
	recvx    uint              // buffer中正在recieve的element的index
	recvq    waitq           // 由 recv 行为（也就是 <-ch）阻塞在 channel 上的 goroutine 队列
	sendq    waitq          // 由 send 行为 (也就是 ch<-) 阻塞在 channel 上的 goroutine 队列

	lock     mutex          // 互斥锁
}
```
`buf` 指向底层循环数组，只有缓冲型的channel才有。
`sendx`,`recvx`均指向底层循环数组，表示当前可以发送和接受的元素位置索引值(相对于底层数组)。
`sendq`,`recvq`分别表示被阻塞的goroutine，这些goroutine由于尝试读取`channel`或向`channel`发送数据而被阻塞。
`waitq` 是 `sudog` 的一个双向链表，而 `sudog` 实际上是对 `goroutine` 的一个封装：
```
type waitq struct {
    first *sudog
    last  *sudog
}

type sudog struct {
    // The following fields are protected by the hchan.lock of the
    // channel this sudog is blocking on. shrinkstack depends on
    // this for sudogs involved in channel ops.

    g          *g
    selectdone *uint32 // CAS to 1 to win select race (may point to stack)
    next       *sudog
    prev       *sudog
    elem       unsafe.Pointer // data element (may point to stack)

    // The following fields are never accessed concurrently.
    // For channels, waitlink is only accessed by g.
    // For semaphores, all fields (including the ones above)
    // are only accessed when holding a semaRoot lock.

    acquiretime int64
    releasetime int64
    ticket      uint32
    parent      *sudog // semaRoot binary tree
    waitlink    *sudog // g.waiting list or semaRoot
    waittail    *sudog // semaRoot
    c           *hchan // channel
}
```
`lock` 用来保证每个读 `channel` 或写 `channel` 的操作都是原子的。

例如，创建一个容量为 6 的，元素为 int 型的 channel 数据结构如下 ：

![hchan.png](https://upload-images.jianshu.io/upload_images/12457267-13c5c27b0f056fa1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

chan 内存在堆上分配:
![allocate.png](https://upload-images.jianshu.io/upload_images/12457267-864e84c71e16a053.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
ch是指向hchan结构体的指针,所以我们能在函数之间直接传递channel，而不需要传递channel的指针

### recieve from channel
demo:
```
package main

func start(c chan int) {
    c <- 100
}

func main() {
    c := make(chan int)

    go start(c)

    <-c
}
```

入口函数：
```
// src/runtime/chan.go
func chanrecv1(c *hchan, elem unsafe.Pointer) {
	chanrecv(c, elem, true)
}

func chanrecv2(c *hchan, elem unsafe.Pointer) (received bool) {
	_, received = chanrecv(c, elem, true)
	return
}

func chanrecv(c *hchan, ep unsafe.Pointer, block bool) (selected, received bool) {
	// 省略 debug 内容 …………
    
        // 如果是一个 nil 的 channel
	if c == nil {
		if !block {
                         // 如果不阻塞，直接返回 (false, false)
			return
		}
               // 否则，接收一个 nil 的 channel，goroutine 挂起
		gopark(nil, nil, waitReasonChanReceiveNilChan, traceEvGoStop, 2)
               // 不会执行到这里
		throw("unreachable")
	}

	// 在非阻塞模式下，快速检测到失败，不用获取锁，快速返回
    // 当我们观察到 channel 没准备好接收：
    // 1. 非缓冲型，等待发送列队 sendq 里没有 goroutine 在等待
    // 2. 缓冲型，但 buf 里没有元素
    // 之后，又观察到 closed == 0，即 channel 未关闭。
    // 因为 channel 不可能被重复打开，所以前一个观测的时候 channel 也是未关闭的，
    // 因此在这种情况下可以直接宣布接收失败，返回 (false, false)
	if !block && (c.dataqsiz == 0 && c.sendq.first == nil ||
		c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0) &&
		atomic.Load(&c.closed) == 0 {
		return
	}

	var t0 int64
	if blockprofilerate > 0 {
		t0 = cputicks()
	}
       // 加锁
	lock(&c.lock)
         // channel 已关闭，并且循环数组 buf 里没有元素
    // 这里可以处理非缓冲型关闭 和 缓冲型关闭但 buf 无元素的情况
    // 也就是说即使是关闭状态，但在缓冲型的 channel，
    // buf 里有元素的情况下还能接收到元素
	if c.closed != 0 && c.qcount == 0 {
		if raceenabled {
			raceacquire(c.raceaddr())
		}
               // 解锁
		unlock(&c.lock)
		if ep != nil {
                         // 从一个已关闭的 channel 执行接收操作，且未忽略返回值
            // 那么接收的值将是一个该类型的零值
            // typedmemclr 根据类型清理相应地址的内存
			typedmemclr(c.elemtype, ep)
		}
                // 从一个已关闭的 channel 接收，selected 会返回true
		return true, false
	}
         // 等待发送队列里有 goroutine 存在，说明 buf 是满的
    // 这有可能是：
    // 1. 非缓冲型的 channel
    // 2. 缓冲型的 channel，但 buf 满了
    // 针对 1，直接进行内存拷贝（从 sender goroutine -> receiver goroutine）
    // 针对 2，接收到循环数组头部的元素，并将发送者的元素放到循环数组尾部
	if sg := c.sendq.dequeue(); sg != nil {
		recv(c, sg, ep, func() { unlock(&c.lock) }, 3)
		return true, true
	}
  // 缓冲型，buf 里有元素，可以正常接收
	if c.qcount > 0 {
		 // 直接从循环数组里找到要接收的元素
		qp := chanbuf(c, c.recvx)
		  // …………

              // 代码里，没有忽略要接收的值，不是 "<- ch"，而是 "val <- ch"，ep 指向 val
		if ep != nil {
			typedmemmove(c.elemtype, ep, qp)
		}
                // 清理掉循环数组里相应位置的值
		typedmemclr(c.elemtype, qp)
                // 接收游标向前移动
		c.recvx++
                 // 接收游标归零
		if c.recvx == c.dataqsiz {
			c.recvx = 0
		}
                 // buf 数组里的元素个数减 1
		c.qcount--
                 // 解锁
		unlock(&c.lock)
		return true, true
	}

	if !block {
                // 非阻塞接收，解锁。selected 返回 false，因为没有接收到值
		unlock(&c.lock)
		return false, false
	}

	 // 接下来就是要被阻塞的情况了
        // 构造一个 sudog
	gp := getg()
	mysg := acquireSudog()
	mysg.releasetime = 0
	if t0 != 0 {
		mysg.releasetime = -1
	}
	 // 待接收数据的地址保存下来
	mysg.elem = ep
	mysg.waitlink = nil
	gp.waiting = mysg
	mysg.g = gp
	mysg.isSelect = false
	mysg.c = c
	gp.param = nil
         // 进入channel 的等待接收队列
	c.recvq.enqueue(mysg)
        // 将当前 goroutine 挂起
	goparkunlock(&c.lock, waitReasonChanReceive, traceEvGoBlockRecv, 3)

	 // 被唤醒了，接着从这里继续执行一些扫尾工作
	if mysg != gp.waiting {
		throw("G waiting list is corrupted")
	}
	gp.waiting = nil
	if mysg.releasetime > 0 {
		blockevent(mysg.releasetime-t0, 2)
	}
	closed := gp.param == nil
	gp.param = nil
	mysg.c = nil
	releaseSudog(mysg)
	return true, !closed
}
```
**1.对于非阻塞的情况，如果当前没有数据可以接收了，那么返回 (false,false)。** 
```
if !block && (c.dataqsiz == 0 && c.sendq.first == nil ||c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0) &&
    atomic.Load(&c.closed) == 0 {
    return
}
```
我们先来看一下下面这段代码：
```
c := make(chan int, 1)
c <- 1

go func() {
    select {
    case <-c:
        println("recv from c")
    default:
        println("c is not ready - BUG!")
    }
}()

close(c)
<-c
```
从 go 的语义上来说，不论何时，default 都不应该被执行：如果 select 发生在 close 之前，那么从 c 中取出来的数据应该是 1。 如果 select 发生在 close 之后但是在 <-c 之前，那么也应该从 c 中取出 1。如果 select 发生在 <-c 之后，从 c 中取出的数据是 0 ，而且接收数据是失败的，但是不会执行 default。

那么，如果把对 closed 的判断放到通道是否有数据可接收的判断之前，像这样：
```
if !block && atomic.Load(&c.closed) == 0 && (c.dataqsiz == 0 && c.sendq.first == nil ||
    c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0)  {
    return
}
```
这意味着 if 测试通过后的一瞬间存在两种情况：

*  通道未关闭，但是不存在数据可接收，也没有发送者在等待。对于这种情况，应该返回 （false,false）。执行 default 段的代码。
*  通道已关闭，且不存在数据可接收，也没有发送者在等待。对于这种情况，根据 go 语义，应该返回 (true, false)，并且执行 case 段的代码。但是我们的这个实现显然是错误的，它返回了 (false,false)。就上面的接收例子而言, close(c) 和 <-c 正好发生在 atomic.Load(&c.closed) == 0 执行完成之后，但还没有执行后面的判断，那 if 再执行后面的判断，显然也是通过的。所以问题就出来了。

再来看一下正确的实现，它也会在 if 测试通过后的一瞬间存在两种情况：

*  不存在数据可接收，而且通道没有关闭。此时返回 (false,false)
*  存在数据可接收，而且通道没有关闭。此时应该返回 (true,true)。但是，这种情况意味着上一种情况曾今存在过, 而且至少在 if 执行前的那一瞬间还存在。所以我们认为它返回 (false,false) 是合理的。

另外 atomic 在这里是为了保证内存顺序的正确性。
**2.加锁，然后判断如果通道已经关闭而且没有剩余的数据可以读取了，那么就返回 (true,false)。**
```
lock(&c.lock)

if c.closed != 0 && c.qcount == 0 {
    unlock(&c.lock)
    if ep != nil {
        typedmemclr(c.elemtype, ep)
    }
    return true, false
}
```
typedmemclr 的作用是将 ep 指向的类型为 elemtype 的内存块置为 0 值。

**3.如果有发送者在队列等待，那么直接从发送者那里提取数据，并且唤醒这个发送者。当然对于带缓冲区的 chan，它会先将缓冲区的数据提取出来，然后将等待中的发送者的数据拷贝到缓冲区中。**
```
if sg := c.sendq.dequeue(); sg != nil {
    recv(c, sg, ep, func() { unlock(&c.lock) }, 3)
    return true, true
}

func recv(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func(), skip int) {
    if c.dataqsiz == 0 {
        if ep != nil {
            recvDirect(c.elemtype, sg, ep)
        }
    } else {
        qp := chanbuf(c, c.recvx)
        if ep != nil {
            typedmemmove(c.elemtype, ep, qp)
        }
        typedmemmove(c.elemtype, qp, sg.elem)
        c.recvx++
        if c.recvx == c.dataqsiz {
            c.recvx = 0
        }
        c.sendx = c.recvx 
    }
    sg.elem = nil
    gp := sg.g
    unlockf()
    gp.param = unsafe.Pointer(sg)
    goready(gp, skip+1)
}
```
recv 函数判断 chan 是否带有缓冲区，如果不带缓冲区，直接从发送者那里复制数据到 ep。如果带缓冲区，那么你应该能够理解，由于有发送者在等待，所以缓冲区一定是满的。它将缓冲区的第一个数据复制到 ep，然后将发送者的数据复制到缓冲区。这是为了尽量满足先来后到的需求（当然，由于并发的存在，这样做实际上不能完全确定）。
接下来，通过 goready 将发送者唤醒。

**4.如果缓冲区中有数据，那么从缓冲区复制数据到 ep，并且修改下次接收位置和 qcount**
```
if c.qcount > 0 {
    qp := chanbuf(c, c.recvx)
    if ep != nil {
        typedmemmove(c.elemtype, ep, qp)
    }
    typedmemclr(c.elemtype, qp)
    c.recvx++
    if c.recvx == c.dataqsiz {
        c.recvx = 0
    }
    c.qcount--
    unlock(&c.lock)
    return true, true
}
```
**5.在执行完成上面的流程后，仍然没有返回，说明缓冲区内已经没有数据了，而且也没有发送者在等待中。所以如果是非阻塞接收，那么直接返回 (false,false)。**
```
if !block {
    unlock(&c.lock)
    return false, false
}
```
**6.对于阻塞接收的情况，则需要把当前goroutine挂入channel的读取队列之中并调用goparkunlock函数阻塞该goroutine，并且等待被唤醒。**
```
gp := getg()
mysg := acquireSudog()
mysg.elem = ep
mysg.waitlink = nil
gp.waiting = mysg
mysg.g = gp
mysg.isSelect = false
mysg.c = c
gp.param = nil
c.recvq.enqueue(mysg)
goparkunlock(&c.lock, waitReasonChanReceive, traceEvGoBlockRecv, 3)
```
```
runtime/proc.go
// Puts the current goroutine into a waiting state and unlocks the lock.
// The goroutine can be made runnable again by calling goready(gp).
func goparkunlock(lock *mutex, reason waitReason, traceEv byte, traceskip int) {
    gopark(parkunlock_c, unsafe.Pointer(lock), reason, traceEv, traceskip)
}

func gopark(unlockf func(*g, unsafe.Pointer) bool, lock unsafe.Pointer, reason     waitReason, traceEv byte, traceskip int) {
    ......
    // can't do anything that might move the G between Ms here.
    mcall(park_m) //切换到g0栈执行park_m函数
}
```
`goparkunlock`函数直接调用`gopark`函数，`gopark`则调用`mcall`从当前`main goroutine`切换到`g0`去执行`park_m`函数（`mcall`其主要作用就是保存当前goroutine的现场，然后切换到`g0`栈去调用作为参数传递给它的函数）.
```
runtime/proc.go
// park continuation on g0.
func park_m(gp *g) {
    _g_ := getg()

    if trace.enabled {
        traceGoPark(_g_.m.waittraceev, _g_.m.waittraceskip)
    }

    casgstatus(gp, _Grunning, _Gwaiting)
    dropg()  //解除g和m之间的关系

    ......
   
    schedule()
}
```
`park_m`首先把当前goroutine的状态设置为`_Gwaiting`（因为它正在等待其它`goroutine`往`channel`里面写数据），然后调用dropg函数解除g和m之间的关系，最后通过调用`schedule`函数进入调度循环，`schedule`函数它首先会从运行队列中挑选出一个`goroutine`，然后调用`gogo`函数切换到被挑选出来的`goroutine`去运行。我们的demo例子中,`main goroutine`在读取`channel`被阻塞之前已经把创建好的`g2`放入了运行队列，所以在这里`schedule`会把`g2`调度起来运行，这里完成了一次从`main goroutine`到`g2`调度（我们假设只有一个工作线程在进行调度)，进入` send to channel`流程

### send to channel

入口函数:
```
func chansend1(c *hchan, elem unsafe.Pointer) {
	chansend(c, elem, true, getcallerpc())
}

func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
    // 如果 channel 是 nil
    if c == nil {
        // 不能阻塞，直接返回 false，表示未发送成功
        if !block {
            return false
        }
        // 当前 goroutine 被挂起
        gopark(nil, nil, "chan send (nil chan)", traceEvGoStop, 2)
        throw("unreachable")
    }

    // 省略 debug 相关……

    // 对于不阻塞的 send，快速检测失败场景
    //
    // 如果 channel 未关闭且 channel 没有多余的缓冲空间。这可能是：
    // 1. channel 是非缓冲型的，且等待接收队列里没有 goroutine
    // 2. channel 是缓冲型的，但循环数组已经装满了元素
    if !block && c.closed == 0 && ((c.dataqsiz == 0 && c.recvq.first == nil) ||
        (c.dataqsiz > 0 && c.qcount == c.dataqsiz)) {
        return false
    }

    var t0 int64
    if blockprofilerate > 0 {
        t0 = cputicks()
    }

    // 锁住 channel，并发安全
    lock(&c.lock)

    // 如果 channel 关闭了
    if c.closed != 0 {
        // 解锁
        unlock(&c.lock)
        // 直接 panic
        panic(plainError("send on closed channel"))
    }

    // 如果接收队列里有 goroutine，直接将要发送的数据拷贝到接收 goroutine
    if sg := c.recvq.dequeue(); sg != nil {
        send(c, sg, ep, func() { unlock(&c.lock) }, 3)
        return true
    }

    // 对于缓冲型的 channel，如果还有缓冲空间
    if c.qcount < c.dataqsiz {
        // qp 指向 buf 的 sendx 位置
        qp := chanbuf(c, c.sendx)

        // ……

        // 将数据从 ep 处拷贝到 qp
        typedmemmove(c.elemtype, qp, ep)
        // 发送游标值加 1
        c.sendx++
        // 如果发送游标值等于容量值，游标值归 0
        if c.sendx == c.dataqsiz {
            c.sendx = 0
        }
        // 缓冲区的元素数量加一
        c.qcount++

        // 解锁
        unlock(&c.lock)
        return true
    }

    // 如果不需要阻塞，则直接返回错误
    if !block {
        unlock(&c.lock)
        return false
    }

    // channel 满了，发送方会被阻塞。接下来会构造一个 sudog

    // 获取当前 goroutine 的指针
    gp := getg()
    mysg := acquireSudog()
    mysg.releasetime = 0
    if t0 != 0 {
        mysg.releasetime = -1
    }

    mysg.elem = ep
    mysg.waitlink = nil
    mysg.g = gp
    mysg.selectdone = nil
    mysg.c = c
    gp.waiting = mysg
    gp.param = nil

    // 当前 goroutine 进入发送等待队列
    c.sendq.enqueue(mysg)

    // 当前 goroutine 被挂起
    goparkunlock(&c.lock, waitReasonChanSend, traceEvGoBlockSend, 3)

    // 从这里开始被唤醒了（channel 有机会可以发送了）
    if mysg != gp.waiting {
        throw("G waiting list is corrupted")
    }
    gp.waiting = nil
  if gp.param == nil {
        if c.closed == 0 {
            throw("chansend: spurious wakeup")
        }
        // 被唤醒后，channel 关闭了。坑爹啊，panic
        panic(plainError("send on closed channel"))
    }
    gp.param = nil
    if mysg.releasetime > 0 {
        blockevent(mysg.releasetime-t0, 2)
    }
    // 去掉 mysg 上绑定的 channel
    mysg.c = nil
    releaseSudog(mysg)
    return true
}
```
**1.如果通道是空的，对于非阻塞的发送，直接返回 false。对于阻塞的通道，将 goroutine 挂起，并且永远不会返回**
```
if c == nil {
        if !block {
            return false
        }
        gopark(nil, nil, waitReasonChanSendNilChan, traceEvGoStop, 2)
        throw("unreachable")
    }
```
**2.非阻塞的情况下，如果通道没有关闭，而且当前没有接收者，缓冲区也已经满了或者没有缓冲区（即不可以发送数据）。那么直接返回 false**
```
if !block && c.closed == 0 && ((c.dataqsiz == 0 && c.recvq.first == nil) || (c.dataqsiz > 0 && c.qcount == c.dataqsiz)) {
    return false
}
```
注释里主要讲为什么这一块可以不加锁，我详细解释一下。`if `条件里先读了两个变量：`block` 和`c.closed`。`block` 是函数的参数，不会变；`c.closed` 可能被其他 `goroutine` 改变，因为没加锁嘛，这是“与”条件前面两个表达式。

最后一项，涉及到三个变量：`c.dataqsiz`，`c.recvq.first`，`c.qcount`。`c.dataqsiz == 0 && c.recvq.first == nil `指的是非缓冲型的 `channel`，并且 `recvq` 里没有等待接收的` goroutine`；`c.dataqsiz > 0 && c.qcount == c.dataqsiz `指的是缓冲型的 channel，但循环数组已经满了。这里 c.dataqsiz 实际上也是不会被修改的，在创建的时候就已经确定了。不加锁真正影响地是` c.qcount`和 `c.recvq.first`。

也就是说这里的` if` 测试通过的那一瞬间，可能有两种情况：

通道没有关闭，而且已经满了。那么这段逻辑运行 ok，应该返回 false。
通道已经关闭，而且已经满了。按照发送数据的语义来说，此时应该 panic。但实际上这段逻辑的实现，它会返回 false。
但我们还要注意到的是，第 2 种情况的发生，肯定意味着第 1 种情况发生过。而且它取决与通道的 close 是何时被调用的，至少在 if 之前 close 还没有完成调用。所以我们认为第 2 种情况的逻辑也是正确的。

当我们发现 `c.closed == 0` 为真，也就是` channel `未被关闭，再去检测第三部分的条件时，观测到 `c.recvq.first == nil 或者 c.qcount == c.dataqsiz `时（这里忽略` c.dataqsiz`），就断定要将这次发送操作作失败处理，快速返回 false。

其实这样做的目的就是少获取一次锁，提升性能。

**3.调用 lock 对通道加锁，如果此时通道被关闭，那么发生 panic**
```
// 第 3 步，加锁
lock(&c.lock)  

// 第 4 步，如果通道已经被关闭了，那么 panic
if c.closed != 0 {
    unlock(&c.lock)
    panic(plainError("send on closed channel"))
}
```

**4.从 recvq 中取出一个接收者，如果接收者存在，直接向该接收者发送数据。**
```
if sg := c.recvq.dequeue(); sg != nil {
    send(c, sg, ep, func() { unlock(&c.lock) }, 3)
    return true
}
```
**5.send 函数将 ep 作为参数传送给接收方的 sg 对象，然后使用 goready 将其唤醒。sg.elem 如果非空，则将 ep 的内容直接 copy 到 elem 指向的地址。**
```
func send(c *hchan, sg *sudog, ep unsafe.Pointer, unlockf func(), skip int) {
    // ...
    if sg.elem != nil {
        sendDirect(c.elemtype, sg, ep)
        sg.elem = nil
    }
    gp := sg.g
    unlockf()
    gp.param = unsafe.Pointer(sg)
    goready(gp, skip+1)
}

func sendDirect(t *_type, sg *sudog, src unsafe.Pointer) {
    dst := sg.elem
    memmove(dst, src, t.size)
}

// runtime/proc.go
func goready(gp *g, traceskip int) {
    systemstack(func() {
        ready(gp, traceskip, true)
    })
}

// Mark gp ready to run.
func ready(gp *g, traceskip int, next bool) {
    ......
    // Mark runnable.
    _g_ := getg()
    ......
    // status is Gwaiting or Gscanwaiting, make Grunnable and put on runq
    casgstatus(gp, _Gwaiting, _Grunnable)
    runqput(_g_.m.p.ptr(), gp, next) //放入运行队列
    if atomic.Load(&sched.npidle) != 0 && atomic.Load(&sched.nmspinning) == 0 {
        //有空闲的p而且没有正在偷取goroutine的工作线程，则需要唤醒p出来工作
        wakep()
    }
    ......
}
```
在我们这个demo中，因为`main goroutine`此时此刻正挂在`channel`的读取队列上等待数据，所以这里直接调用`send`函数发送给`main goroutine`，`send`函数则调用`goready`函数切换到`g0`栈并调用`ready`函数来唤醒`sg`对应的`goroutine`，即正在等待读`channel`的`main goroutine`。

`ready`函数首先把需要唤醒的`goroutine`的状态设置为`_Grunnable`，然后把其放入运行队列之中等待调度器的调度。

对于这个demo的运行流程,执行到这里`main goroutine`已经被放入了运行队列，但还未被调度起来运行，而`g2` goroutine在向`channel`写完数据之后就从这里的`ready`函数返回并退出了

接下来分析其他情况
**6.如果缓冲区还有多余的空间，那么将数据写入缓冲区。写入缓冲区后，将发送位置往后移动一个单位，然后将 qcount 加 1**
```
if c.qcount < c.dataqsiz {
    qp := chanbuf(c, c.sendx)
    typedmemmove(c.elemtype, qp, ep)
    c.sendx++
    if c.sendx == c.dataqsiz {
        c.sendx = 0
    }
    c.qcount++
    unlock(&c.lock)
    return true
}

// 其中 chanbuf 函数从 buf 中取出第 i 个元素的存放地址：
func chanbuf(c *hchan, i uint) unsafe.Pointer {
    return add(c.buf, uintptr(i)*uintptr(c.elemsize))
}
```
**7.如果执行前面的所有步骤还没有成功发送，那么就表示缓冲区没有空间了，而且也没有任何接收者在等待。所以后面必须要将 goroutine 挂起然后等待新的接收者了。但对于非阻塞的调用，不能等待，返回 false 表示数据发送不成功。**
```
if !block {
        unlock(&c.lock)
        return false
    }
```
**8.创建 sudog 对象，然后入队并且让 goroutine 进入等待状态。直到被唤醒时 goparkunlock 才会返回。**
```
gp := getg()

mysg := acquireSudog()
mysg.elem = ep
mysg.waitlink = nil
mysg.g = gp
mysg.isSelect = false
mysg.c = c

gp.waiting = mysg
gp.param = nil

c.sendq.enqueue(mysg)
goparkunlock(&c.lock, waitReasonChanSend, traceEvGoBlockSend, 3)
```
**9.goparkunlock 返回后，代表已经发送完数据了，此时做一些清理工作，如将 sudog 对象释放，将 g 的 waiting 置空等。**


### close channel
```
func closechan(c *hchan) {
    // 关闭一个 nil channel，panic
    if c == nil {
        panic(plainError("close of nil channel"))
    }

    // 上锁
    lock(&c.lock)
    // 判断如果通道早已关闭了，就 panic。（你不能对一个被关闭的通道再执行关闭操作）
    if c.closed != 0 {
        unlock(&c.lock)
        // panic
        panic(plainError("close of closed channel"))
    }

    // …………

    // 将关闭标志置为 1.
    c.closed = 1

    // 唤醒所有的接收者，并且将接收数据置为 0 值。唤醒所有发送者，令其 panic。 gList 就是一个 g 对象的列表。
    var glist *g

    // 将 channel 所有等待接收队列的里 sudog 释放
    for {
        // 从接收队列里出队一个 sudog
        sg := c.recvq.dequeue()
        // 出队完毕，跳出循环
        if sg == nil {
            break
        }

        // 如果 elem 不为空，说明此 receiver 未忽略接收数据
        // 给它赋一个相应类型的零值
        if sg.elem != nil {
            typedmemclr(c.elemtype, sg.elem)
            sg.elem = nil
        }
        if sg.releasetime != 0 {
            sg.releasetime = cputicks()
        }
        // 取出 goroutine
        gp := sg.g
        gp.param = nil
        if raceenabled {
            raceacquireg(gp, unsafe.Pointer(c))
        }
        // 相连，形成链表
        gp.schedlink.set(glist)
        glist = gp
    }

    // 将 channel 等待发送队列里的 sudog 释放
    // 如果存在，这些 goroutine 将会 panic
    for {
        // 从发送队列里出队一个 sudog
        sg := c.sendq.dequeue()
        if sg == nil {
            break
        }

        // 发送者会 panic
        sg.elem = nil
        if sg.releasetime != 0 {
            sg.releasetime = cputicks()
        }
        gp := sg.g
        gp.param = nil
        if raceenabled {
            raceacquireg(gp, unsafe.Pointer(c))
        }
        // 形成链表
        gp.schedlink.set(glist)
        glist = gp
    }
    // 解锁
    unlock(&c.lock)

    // Ready all Gs now that we've dropped the channel lock.
    // 遍历链表
    for glist != nil {
        // 取最后一个
        gp := glist
        // 向前走一步，下一个唤醒的 g
        glist = glist.schedlink.ptr()
        gp.schedlink = 0
        // 唤醒相应 goroutine
        goready(gp, 3)
    }
}
```
close 逻辑比较简单，对于一个 channel，recvq 和 sendq 中分别保存了阻塞的发送者和接收者。关闭 channel 后，对于等待接收者而言，会收到一个相应类型的零值。对于等待发送者，会直接 panic。所以，在不了解 channel 还有没有接收者的情况下，不能贸然关闭 channel。

close 函数先上一把大锁，接着把所有挂在这个 channel 上的 sender 和 receiver 全都连成一个 sudog 链表，再解锁。最后，再将所有的 sudog 全都唤醒。

唤醒之后，该干嘛干嘛。sender 会继续执行 chansend 函数里 goparkunlock 函数之后的代码，很不幸，检测到 channel 已经关闭了，panic。receiver 则比较幸运，进行一些扫尾工作后，返回。这里，selected 返回 true，而返回值 received 则要根据 channel 是否关闭，返回不同的值。如果 channel 关闭，received 为 false，否则为 true。这我们分析的这种情况下，received 返回 false。

### 参考资料
[Go by Example: Channel Buffering](https://gobyexample.com/channel-buffering)

[Kavya在Gopher Con 上关于 channel 的设计](https://speakerd.s3.amazonaws.com/presentations/10ac0b1d76a6463aa98ad6a9dec917a7/GopherCon_v10.0.pdf)

[Goroutine被动调度之一（18）](https://mp.weixin.qq.com/s/w3i5hVKmYW_M06nLaMlwvQ)

[深度解密Go语言之channel](https://segmentfault.com/a/1190000019839546)

[golang channel 源码剖析](https://zhuanlan.zhihu.com/p/62391727)
