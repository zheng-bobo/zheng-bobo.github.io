---
title: "Inside Go's Channel Runtime"
date: 2020-01-05 11:19:10 +0800
slug: "inside-go-channel-runtime"
categories: ["Go"]
---


- Channel is a very important type in the Go language and is the first object in Go. Through channels, Go implements memory sharing through communication. Channel is an important means of transferring data and synchronizing between multiple goroutines.

Note: All source code analysis in this article is based on `Go1.13.3`. Different versions may have different implementations.
### channel syntax
The syntax for declaring a channel is as follows:
```
chan T // Declare a two-way channel
chan<- T // Declare a channel that can only be used for sending
<-chan T // Declare a channel that can only be used for reception
```

Its operator is the arrow `<-`.

```
ch <- v // Send value v to Channel ch
v := <-ch // Receive data from Channel ch and assign the data to v
```

Initialize Channel using `make`
```
// unbuffered channel
ch1 := make(chan int)
// There is a buffer channel
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

Use `go tool compile -N -l -S ` to generate assembly code. Both initialization chanel methods ultimately call the `CALL    runtime.makechan(SB)` assembly instruction. See the function code for details:

`src/runtime/chan.go`
```
func makechan(t *chantype, size int) *hchan {

        // Initialize, do some basic verification, check channel size, align code
    elem := t.elem

    //Element type size limit
    if elem.size >= 1<<16 {
        throw("makechan: invalid channel element type")
    }
        //Alignment constraints
    if hchanSize%maxAlign != 0 || elem.align > maxAlign {
        throw("makechan: bad alignment")
    }
       // Get the memory to be allocated
    mem, overflow := math.MulUintptr(elem.size, uintptr(size))
    if overflow || mem > maxAlloc-hchanSize || size < 0 {
        panic(plainError("makechan: size out of range"))
    }
    var c *hchan
    switch {
    case mem == 0:
        // When size is 0 (no cache channel), allocate memory of the hchan structure size, which is 96 Byte for 64-bit systems.
        c = (*hchan)(mallocgc(hchanSize, nil, true))
        // Race detector uses this location for synchronization.
        c.buf = c.raceaddr()
    case elem.ptrdata == 0:
        // The data item is not a pointer type. Call mallocgc to allocate the memory size at one time. The hchan structure size + the total data size
        c = (*hchan)(mallocgc(hchanSize+mem, nil, true))
        c.buf = add(unsafe.Pointer(c), hchanSize)
    default:
            // The data item is a pointer type, hchan and buf allocate memory separately, and the pointer type in GC is judged reachable and unreadchable.
        c = new(hchan)
        c.buf = mallocgc(mem, elem, true)
    }
        // chan assignment attribute, data item size, data item type, cache data capacity
    c.elemsize = uint16(elem.size)
    c.elemtype = elem
    c.dataqsiz = uint(size)

    if debugChan {
        print("makechan: chan=", c, "; elemsize=", elem.size, "; elemalg=", elem.alg, "; dataqsiz=", size, "\n")
    }
    return c
}
```
As for why we need to distinguish between containing pointers and not containing pointers, makechan's comment gives an explanation:
`Hchan does not contain pointers interesting for GC when elements stored in buf do not contain pointers.`
If buf does not contain pointers, a large memory can be used to store hchan objects and buffers, so that when the hchan structure is not referenced, it can be recycled directly. If the actual element type contains pointers, mallocgc must be used to tell gc what type of data is allocated. When recycling, gc needs to determine whether the data in this memory has no references.



`hchan` is the structure of chan
```
type hchan struct {
    qcount uint //The total number of data in the buffer
    dataqsiz uint // buffer capacity
    buf unsafe.Pointer //The start pointer of the buffer
    elemsize uint16 //The size of the data in the channel
    closed uint32 // Whether the channel is closed, 0 => false, others are true
    elemtype *_type // channel data type
    sendx uint //The index of the element being sent in the buffer
    recvx uint //The index of the element being received in the buffer
    recvq waitq // The goroutine queue blocked on the channel by recv behavior (that is, <-ch)
    sendq waitq // goroutine queue blocked on channel by send behavior (i.e. ch<-)

    lock mutex // mutex lock
}
```
`buf` points to the underlying circular array, which is only available for buffered channels.
`sendx`, `recvx` all point to the underlying circular array, indicating the element position index value that can currently be sent and received (relative to the underlying array).
`sendq`, `recvq` respectively represent blocked goroutines. These goroutines are blocked due to trying to read `channel` or send data to `channel`.
`waitq` is a doubly linked list of `sudog`, and `sudog` is actually a package of `goroutine`:
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
`lock` is used to ensure that each operation of reading `channel` or writing `channel` is atomic.

For example, create a channel data structure with a capacity of 6 and elements of type int as follows:

![hchan.png](https://upload-images.jianshu.io/upload_images/12457267-13c5c27b0f056fa1.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

chan memory is allocated on the heap:
![allocate.png](https://upload-images.jianshu.io/upload_images/12457267-864e84c71e16a053.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)
ch is a pointer to the hchan structure, so we can pass the channel directly between functions without passing the channel pointer.

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

Entry function:
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
    // Omit debug content …………

        // If it is a nil channel
    if c == nil {
        if !block {
                         // If not blocking, return directly (false, false)
            return
        }
               // Otherwise, receive a nil channel and the goroutine hangs
        gopark(nil, nil, waitReasonChanReceiveNilChan, traceEvGoStop, 2)
               // Will not be executed here
        throw("unreachable")
    }

    // In non-blocking mode, failure is quickly detected without acquiring a lock and returns quickly
    // When we observe that the channel is not ready to receive:
    // 1. Non-buffered, there is no goroutine waiting in sendq queue
    // 2. Buffer type, but there are no elements in buf
    // Later, it was observed that closed == 0, that is, the channel was not closed.
    // Because the channel cannot be opened repeatedly, the channel was not closed during the previous observation.
    // Therefore, in this case, you can directly declare the reception failure and return (false, false)
    if !block && (c.dataqsiz == 0 && c.sendq.first == nil ||
        c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0) &&
        atomic.Load(&c.closed) == 0 {
        return
    }

    var t0 int64
    if blockprofilerate > 0 {
        t0 = cputicks()
    }
       // lock
    lock(&c.lock)
         // The channel is closed and there are no elements in the loop array buf
    // This can handle non-buffered closing and buffered closing but buf has no elements.
    // That is to say, even if it is closed, in the buffered channel,
    // You can still receive elements even if there are elements in buf
    if c.closed != 0 && c.qcount == 0 {
        if raceenabled {
            raceacquire(c.raceaddr())
        }
               // Unlock
        unlock(&c.lock)
        if ep != nil {
                         // Perform a receive operation from a closed channel without ignoring the return value
            // Then the received value will be a zero value of this type
            // typedmemclr cleans the memory of the corresponding address according to the type
            typedmemclr(c.elemtype, ep)
        }
                // Receive from a closed channel, selected will return true
        return true, false
    }
         // There is a goroutine in the waiting queue, indicating that buf is full.
    // This could be:
    // 1. Non-buffered channel
    // 2. Buffered channel, but buf is full
    // For 1, perform memory copy directly (from sender goroutine -> receiver goroutine)
    // For 2, receive the element at the head of the loop array and put the sender's element at the end of the loop array
    if sg := c.sendq.dequeue(); sg != nil {
        recv(c, sg, ep, func() { unlock(&c.lock) }, 3)
        return true, true
    }
  // Buffer type, there are elements in buf and can be received normally
    if c.qcount > 0 {
         // Find the element to be received directly from the loop array
        qp := chanbuf(c, c.recvx)
          // …………

              // In the code, the value to be received is not ignored, it is not "<- ch", but "val <- ch", ep ​​points to val
        if ep != nil {
            typedmemmove(c.elemtype, ep, qp)
        }
                // Clean up the values ​​at the corresponding positions in the loop array
        typedmemclr(c.elemtype, qp)
                //Receive cursor moves forward
        c.recvx++
                 //Receive cursor reset to zero
        if c.recvx == c.dataqsiz {
            c.recvx = 0
        }
                 // Decrease the number of elements in the buf array by 1
        c.qcount--
                 // Unlock
        unlock(&c.lock)
        return true, true
    }

    if !block {
                // Non-blocking reception, unlocking. selected returns false because no value was received
        unlock(&c.lock)
        return false, false
    }

     //The next step is to be blocked.
        // Construct a sudog
    gp := getg()
    mysg := acquireSudog()
    mysg.releasetime = 0
    if t0 != 0 {
        mysg.releasetime = -1
    }
     // Save the address of the data to be received
    mysg.elem = ep
    mysg.waitlink = nil
    gp.waiting = mysg
    mysg.g = gp
    mysg.isSelect = false
    mysg.c = c
    gp.param = nil
         //Enter the channel's waiting receive queue
    c.recvq.enqueue(mysg)
        // Suspend the current goroutine
    goparkunlock(&c.lock, waitReasonChanReceive, traceEvGoBlockRecv, 3)

     // Awakened, then continue to perform some finishing work from here
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
**1. For non-blocking situations, if there is currently no data to receive, then (false, false) is returned. **
```
if !block && (c.dataqsiz == 0 && c.sendq.first == nil ||c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0) &&
    atomic.Load(&c.closed) == 0 {
    return
}
```
Let’s first take a look at the following code:
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
From the semantics of go, default should not be executed at any time: if select occurs before close, then the data taken out from c should be 1. If select occurs after close but before <-c, then 1 should also be taken from c. If select occurs after <-c, the data taken out from c is 0, and receiving the data fails, but default will not be executed.

Then, if the judgment of closed is placed before the judgment of whether the channel has data to receive, like this:
```
if !block && atomic.Load(&c.closed) == 0 && (c.dataqsiz == 0 && c.sendq.first == nil ||
    c.dataqsiz > 0 && atomic.Loaduint(&c.qcount) == 0)  {
    return
}
```
This means that immediately after the if test passes, there are two situations:

* The channel is not closed, but there is no data to receive and no sender is waiting. For this case, (false,false) should be returned. Execute the code in the default section.
* The channel is closed and there is no data to receive and no sender is waiting. In this case, according to go semantics, (true, false) should be returned and the code in the case section executed. But our implementation is obviously wrong, it returns (false,false). As far as the above receiving example is concerned, close(c) and <-c occur exactly after the execution of atomic.Load(&c.closed) == 0 is completed, but the subsequent judgment has not been executed. Then if if executes the subsequent judgment, it will obviously pass. So the problem arises.

Let's take a look at the correct implementation. It will also have two situations at the moment after the if test passes:

* There is no data to receive and the channel is not closed. Returns (false,false) at this time
* There is data to receive and the channel is not closed. This should return (true,true). However, this situation means that the previous situation existed, and at least it existed for the moment before if was executed. So we think it's reasonable that it returns (false,false).

In addition, atomic is here to ensure the correctness of the memory order.
**2. Lock, and then determine if the channel has been closed and there is no remaining data to read, then return (true, false). **
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
The function of typedmemclr is to set the memory block of type elemtype pointed to by ep to a value of 0.

**3. If there is a sender waiting in the queue, extract the data directly from the sender and wake up the sender. Of course, for chan with a buffer, it will first extract the data from the buffer, and then copy the waiting sender's data into the buffer. **
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
The recv function determines whether chan has a buffer. If it does not have a buffer, it copies the data directly from the sender to ep. If you have a buffer, you should be able to understand that since there is a sender waiting, the buffer must be full. It copies the first data of the buffer to ep and then copies the sender's data to the buffer. This is to try to meet the needs of first come first served (of course, due to the existence of concurrency, this is not actually completely certain).
Next, wake up the sender via goready.

**4. If there is data in the buffer, copy the data from the buffer to ep, and modify the next receiving position and qcount**
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
**5. After completing the above process, there is still no return, indicating that there is no data in the buffer and there is no sender waiting. So if it is a non-blocking reception, then (false, false) is returned directly. **
```
if !block {
    unlock(&c.lock)
    return false, false
}
```
**6. For blocking reception, you need to hang the current goroutine into the channel's read queue and call the goparkunlock function to block the goroutine and wait to be awakened. **
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
    mcall(park_m) //Switch to the g0 stack to execute the park_m function
}
```
The `goparkunlock` function directly calls the `gopark` function, and `gopark` calls `mcall` to switch from the current `main goroutine` to `g0` to execute the `park_m` function (the main function of `mcall` is to save the current goroutine scene, and then switch to the `g0` stack to call the function passed to it as a parameter).
```
runtime/proc.go
// park continuation on g0.
func park_m(gp *g) {
    _g_ := getg()

    if trace.enabled {
        traceGoPark(_g_.m.waittraceev, _g_.m.waittraceskip)
    }

    casgstatus(gp, _Grunning, _Gwaiting)
    dropg() //Resolve the relationship between g and m

    ......

    schedule()
}
```
`park_m` first sets the current goroutine status to `_Gwaiting` (because it is waiting for other `goroutine` to write data to `channel`), then calls the dropg function to release the relationship between g and m, and finally calls The `schedule` function enters the scheduling loop. The `schedule` function will first select a `goroutine` from the run queue, and then call the `gogo` function to switch to the selected `goroutine` for running. In our demo example, `main goroutine` has put the created `g2` into the run queue before reading `channel` is blocked, so here `schedule` will `g2` is scheduled to run. Here, a schedule from `main goroutine` to `g2` is completed (we assume that only one worker thread is scheduling), and the ` send to channel` process is entered.

### send to channel

Entry function:
```
func chansend1(c *hchan, elem unsafe.Pointer) {
    chansend(c, elem, true, getcallerpc())
}

func chansend(c *hchan, ep unsafe.Pointer, block bool, callerpc uintptr) bool {
    // if channel is nil
    if c == nil {
        // Cannot block, return false directly, indicating that the sending was not successful.
        if !block {
            return false
        }
        //The current goroutine is suspended
        gopark(nil, nil, "chan send (nil chan)", traceEvGoStop, 2)
        throw("unreachable")
    }

    // Omit debug related...

    // For non-blocking send, quickly detect failure scenarios
    //
    // If the channel is not closed and the channel has no extra buffer space. This could be:
    // 1. The channel is non-buffered and there is no goroutine in the waiting receiving queue.
    // 2. The channel is buffered, but the loop array is already full of elements.
    if !block && c.closed == 0 && ((c.dataqsiz == 0 && c.recvq.first == nil) ||
        (c.dataqsiz > 0 && c.qcount == c.dataqsiz)) {
        return false
    }

    var t0 int64
    if blockprofilerate > 0 {
        t0 = cputicks()
    }

    //Lock the channel, concurrency safety
    lock(&c.lock)

    // If channel is closed
    if c.closed != 0 {
        // Unlock
        unlock(&c.lock)
        // panic directly
        panic(plainError("send on closed channel"))
    }

    // If there is a goroutine in the receiving queue, directly copy the data to be sent to the receiving goroutine
    if sg := c.recvq.dequeue(); sg != nil {
        send(c, sg, ep, func() { unlock(&c.lock) }, 3)
        return true
    }

    // For buffered channels, if there is still buffer space
    if c.qcount < c.dataqsiz {
        // qp points to the sendx location of buf
        qp := chanbuf(c, c.sendx)

        // ……

        //Copy data from ep to qp
        typedmemmove(c.elemtype, qp, ep)
        //Send cursor value plus 1
        c.sendx++
        // If the sent cursor value is equal to the capacity value, the cursor value returns to 0
        if c.sendx == c.dataqsiz {
            c.sendx = 0
        }
        //Increase the number of elements in the buffer by one
        c.qcount++

        // Unlock
        unlock(&c.lock)
        return true
    }

    // If blocking is not required, return an error directly
    if !block {
        unlock(&c.lock)
        return false
    }

    // When the channel is full, the sender will be blocked. Next, a sudog will be constructed

    // Get the pointer of the current goroutine
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

    //The current goroutine enters the sending waiting queue
    c.sendq.enqueue(mysg)

    //The current goroutine is suspended
    goparkunlock(&c.lock, waitReasonChanSend, traceEvGoBlockSend, 3)

    // It is awakened from here (the channel has a chance to send)
    if mysg != gp.waiting {
        throw("G waiting list is corrupted")
    }
    gp.waiting = nil
  if gp.param == nil {
        if c.closed == 0 {
            throw("chansend: spurious wakeup")
        }
        //After being awakened, the channel is closed. What a scam, panic
        panic(plainError("send on closed channel"))
    }
    gp.param = nil
    if mysg.releasetime > 0 {
        blockevent(mysg.releasetime-t0, 2)
    }
    // Remove the channel bound to mysg
    mysg.c = nil
    releaseSudog(mysg)
    return true
}
```
**1. If the channel is empty, for non-blocking sending, return false directly. For blocked channels, the goroutine is suspended and never returns**
```
if c == nil {
        if !block {
            return false
        }
        gopark(nil, nil, waitReasonChanSendNilChan, traceEvGoStop, 2)
        throw("unreachable")
    }
```
**2. In the case of non-blocking, if the channel is not closed and there is currently no receiver, the buffer is full or there is no buffer (that is, data cannot be sent). Then return false** directly
```
if !block && c.closed == 0 && ((c.dataqsiz == 0 && c.recvq.first == nil) || (c.dataqsiz > 0 && c.qcount == c.dataqsiz)) {
    return false
}
```
The comments mainly talk about why this area can be unlocked. I will explain it in detail. Two variables are first read in the `if ` condition: `block` and `c.closed`. `block` is a parameter of the function and will not change; `c.closed` may be changed by other `goroutine` because it is not locked. These are the first two expressions of the "AND" condition.

The last item involves three variables: `c.dataqsiz`, `c.recvq.first`, `c.qcount`. `c.dataqsiz == 0 && c.recvq.first == nil ` refers to the non-buffered `channel`, and there is no ` goroutine` waiting to be received in `recvq`; `c.dataqsiz > 0 && c.qcount == c.dataqsiz ` refers to the buffered channel, but the loop array is full. Here c.dataqsiz will not actually be modified, it has been determined when it was created. The real impact of not locking is ` c.qcount` and `c.recvq.first`.

In other words, the moment the ` if` test here passes, there may be two situations:

The channel is not closed and is full. Then this logic runs ok and should return false.
The channel is closed and full. According to the semantics of sending data, you should panic at this time. But in actual implementation of this logic, it will return false.
But we also need to note that the occurrence of the second situation must mean that the first situation has occurred. And it depends on when the channel's close is called, at least before the if close has not completed the call. So we think the logic of case 2 is also correct.

When `c.closed == 0` is true, the channel has not been closed. We then inspect the third part of the condition: if `c.recvq.first == nil` or `c.qcount == c.dataqsiz` (ignoring `c.dataqsiz == 0` here), the send cannot proceed and returns `false` immediately.

In fact, the purpose of doing this is to obtain one less lock and improve performance.

**3. Call lock to lock the channel. If the channel is closed at this time, a panic will occur**
```
// Step 3, lock
lock(&c.lock)

// Step 4, if the channel has been closed, then panic
if c.closed != 0 {
    unlock(&c.lock)
    panic(plainError("send on closed channel"))
}
```

**4. Take out a receiver from recvq, and if the receiver exists, send data directly to the receiver. **
```
if sg := c.recvq.dequeue(); sg != nil {
    send(c, sg, ep, func() { unlock(&c.lock) }, 3)
    return true
}
```
**5.send function passes ep as a parameter to the receiver's sg object, and then uses goready to wake it up. If sg.elem is not empty, copy the content of ep directly to the address pointed to by elem. **
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
    runqput(_g_.m.p.ptr(), gp, next) //Put into the run queue
    if atomic.Load(&sched.npidle) != 0 && atomic.Load(&sched.nmspinning) == 0 {
        //If there is an idle p and there is no worker thread stealing goroutine, you need to wake up p to work.
        wakep()
    }
    ......
}
```
In our demo, `main goroutine` is waiting for data in the channel's receive queue, so `send` delivers the value directly to it. The `send` function then calls `goready`, which switches to the `g0` stack and invokes `ready` to wake the goroutine associated with `sg`—the `main goroutine` waiting to receive from the channel.

The `ready` function first sets the status of `goroutine` that needs to be awakened to `_Grunnable`, and then puts it into the running queue to wait for scheduling by the scheduler.

For the running process of this demo, `main goroutine` has been put into the run queue but has not yet been scheduled to run. The `g2` goroutine returns and exits from the `ready` function after writing data to `channel`.

Next, analyze other situations
**6. If there is extra space in the buffer, write the data into the buffer. After writing to the buffer, move the sending position back one unit and then increase qcount by 1**
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

//The chanbuf function retrieves the storage address of the i-th element from buf:
func chanbuf(c *hchan, i uint) unsafe.Pointer {
    return add(c.buf, uintptr(i)*uintptr(c.elemsize))
}
```
**7. If all the previous steps have not been successfully sent, it means that there is no space in the buffer and there are no receivers waiting. So the goroutine must be suspended later and wait for the new receiver. But for non-blocking calls, you cannot wait, and returning false indicates that the data transmission was unsuccessful. **
```
if !block {
        unlock(&c.lock)
        return false
    }
```
**8. Create a sudog object, then enqueue it and let goroutine enter the waiting state. goparkunlock will not return until woken up. **
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
**9. After goparkunlock returns, it means that the data has been sent. At this time, some cleaning work should be done, such as releasing the sudog object, setting the waiting of g to empty, etc. **


### close channel
```
func closechan(c *hchan) {
    // Close a nil channel, panic
    if c == nil {
        panic(plainError("close of nil channel"))
    }

    // lock
    lock(&c.lock)
    // Determine if the channel has already been closed, then panic. (You cannot perform a close operation on a closed channel)
    if c.closed != 0 {
        unlock(&c.lock)
        // panic
        panic(plainError("close of closed channel"))
    }

    // …………

    // Set the shutdown flag to 1.
    c.closed = 1

    // Wake up all receivers and set the received data to 0. Wake up all senders and cause them to panic. gList is a list of g objects.
    var glist *g

    // Release sudog of all channels waiting to receive queues
    for {
        // Dequeue a sudog from the receive queue
        sg := c.recvq.dequeue()
        // After dequeue is completed, jump out of the loop
        if sg == nil {
            break
        }

        // If elem is not empty, it means that this receiver does not ignore receiving data
        // Assign it a zero value of the corresponding type
        if sg.elem != nil {
            typedmemclr(c.elemtype, sg.elem)
            sg.elem = nil
        }
        if sg.releasetime != 0 {
            sg.releasetime = cputicks()
        }
        // Take out the goroutine
        gp := sg.g
        gp.param = nil
        if raceenabled {
            raceacquireg(gp, unsafe.Pointer(c))
        }
        // Connect to form a linked list
        gp.schedlink.set(glist)
        glist = gp
    }

    // Release the channel waiting for sudog in the send queue
    // If present, these goroutines will panic
    for {
        // Dequeue a sudog from the sending queue
        sg := c.sendq.dequeue()
        if sg == nil {
            break
        }

        // The sender will panic
        sg.elem = nil
        if sg.releasetime != 0 {
            sg.releasetime = cputicks()
        }
        gp := sg.g
        gp.param = nil
        if raceenabled {
            raceacquireg(gp, unsafe.Pointer(c))
        }
        // form a linked list
        gp.schedlink.set(glist)
        glist = gp
    }
    // Unlock
    unlock(&c.lock)

    // Ready all Gs now that we've dropped the channel lock.
    // Traverse the linked list
    for glist != nil {
        // Get the last one
        gp := glist
        // Take one step forward, the next awakened g
        glist = glist.schedlink.ptr()
        gp.schedlink = 0
        // Wake up the corresponding goroutine
        goready(gp, 3)
    }
}
```
The logic of close is relatively simple. For a channel, recvq and sendq store the blocked sender and receiver respectively. After closing the channel, waiting receivers will receive a zero value of the corresponding type. For the waiting sender, it will panic directly. Therefore, you cannot close the channel rashly without knowing whether there are any receivers on the channel.

The close function first acquires a big lock, then connects all senders and receivers hanging on this channel into a sudog linked list, and then unlocks it. Finally, wake up all sudogs.

After waking up, do whatever you have to do. The sender will continue to execute the code after the goparkunlock function in the chansend function. Unfortunately, it detects that the channel has been closed and panics. The receiver is luckier and returns after doing some finishing work. Here, selected returns true, and the return value received returns different values ​​depending on whether the channel is closed. received is false if the channel is closed, true otherwise. In the case we analyzed, received returns false.

### References
[Go by Example: Channel Buffering](https://gobyexample.com/channel-buffering)

[Kavya’s design on channel at Gopher Con](https://speakerd.s3.amazonaws.com/presentations/10ac0b1d76a6463aa98ad6a9dec917a7/GopherCon_v10.0.pdf)

[One of Goroutine passive scheduling (18)](https://mp.weixin.qq.com/s/w3i5hVKmYW_M06nLaMlwvQ)

[Deep decryption of Go language channel](https://segmentfault.com/a/1190000019839546)

[golang channel source code analysis](https://zhuanlan.zhihu.com/p/62391727)
