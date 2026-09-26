---
title: "Translation: Contiguous Stacks"
date: 2019-11-30 13:14:00 +0800
slug: "contiguous-stacks"
categories: ["Translation"]
---


[Contiguous stacks original address](https://docs.google.com/document/d/1wAaf1rYoM4S4gtnPh0zOlGzWtrZFQ5suE8qr2sD8uWQ/pub)

 Allocate a continuous stack memory space for each go coroutine. When the memory is used up, it will be reallocated/copied and grown.

#### Why?
  * The current stack splitting mechanism has a "hot split" problem - if the stack space is almost full, calling the function will trigger the forced allocation of a new stack block. When the calling function returns, the new stack block will be released. If a calling function is called closely within a loop, alloc/free overhead can cause significant overhead.
  * Since stack splitting does not perform reallocation and recycling of stack blocks, some additional work is required when the stack block size exceeds the threshold.

For continuous stacks, we avoid both problems. The stack block is expanded to the required size and no additional work is required (modulo shrinking, see below).

#### How to do it?
How to move the stack? It turns out that our compiler's escape analysis provides a very important uncertainty: pointers to data on the stack are only passed up the call tree. Any other escaping (writing to a global variable, returning to a parent object, writing to the heap, etc.) avoids allocating data on the stack. This ensures that pointers to data on the stack are themselves on the stack. This makes it easy to find and update them if we copy the stack.

#### Overflow check
 Stack overflow checking is very similar to split stack overflow checking. The only difference is that we no longer need to know the size of the parameters because they no longer need to be copied to a new stack segment. This somewhat simplifies the proliferation of more stacked routine families and eliminates the need for most `NOSPLIT` instructions.

 We don’t even need to know the stack frame size. Just double the stack size and try again, if it still doesn't fit we'll check for overflow again and double the stack size again. Repeat until fit.

#### Copy
When the stack overflow check triggers:

* Allocate a new stack that is larger than the old stack. We should allocate at a multiple of the size (to limit the number of jobs to complete the copy), and probably round up to a multiple of a nice size (so that the allocation is more efficient). I'm currently planning on using a power of two sizes and doubling each reallocation.

* Copy the old stack to the new stack. The stack is treated as an array of `*byte`. Each `*byte` is copied from the old stack to the new stack. Compare each `*byte` to the bounds of the old stack, and if it is in range, adjust it to point to the same offset in the new stack as the TOS.

* Only real pointers can be adjusted, we need to avoid integers that look like pointers. Therefore, we need a data structure that tells us, for each pointer on the stack, the size and whether it is a pointer. Fortunately, Carl is designing this data structure for precise GC.

* Any pointers brought onto the stack from outside need to be adjusted. Despite escape analysis, there are some omissions, including:
> a. Delayed function object called
    b. Parameters for delayed call
    c. The closing parameter of the function object that is delayed in calling
    d. Passed to the function object that has overflowed the stack frame (in x86, it is passed through the register, not the stack)
    e. Pass the closure function to the function object that overflows the stack frame, using the same rules when copying - we need to know whether the data is indeed a pointer, and whether it points to the old stack.

#### Reflection call processing

  Reflect.call calls a function given a pointer to a parameter area and a parameter size. The old stack splitting mechanism forces a new stack block so variable-sized parameter regions can be allocated at the top of the stack. The new mechanism requires these args to be allocated anywhere on the stack. The implementation would be simpler if all stack frames were of fixed size, so to "simulate" variable-sized stack frames we define a set of fixed-size power-of-two stack frame functions that can be used as trampolines

```
reflect.call(function, args, argsize)

        if argsize <= 16: jump reflect.call16(function, args, argsize)

        if argsize <= 32: jump reflect.call32(function, args, argsize)

        if argsize <= 64: jump reflect.call64(function, args, argsize)

…


reflect.call16(function, args, argsize)

        sp -= 16

        copy [args, args+argsize] to [sp, sp+argsize]

        call function

        copy [sp, sp+argsize] to [args, args+argsize](for return values)

        sp += 16

        return


```

  I recommend that the maximum reflect.call arg size is 64K.


 The stack replicator needs to know what pointers are and what these frames are not. This information can be derived by looking at the signature of the called function. (For vararg also calls the size of the argument?

#### Stack Trace

﻿ Stack tracing code is somewhat simplified as it does not need to deal with splitting on the stack

#### GC

  Simplified GC traversal of G's stack as in the stack trace.

#### Defer/panic/recover

﻿The implementation of these mechanisms has changed slightly and in most cases has been simplified. The old mechanism used stack split locations to mark where panics occurred.

#### Testing

 For testing purposes, all stacks will be allocated somewhere outside the heap. After the stack is copied, the old stack is mapped so that any erroneous access to the old stack is caught.

#### CGo

 To be determined, I don’t know what the problem is.

#### Shrinking

﻿﻿If a Go routine uses a large amount of stack at the beginning of its life cycle, but uses less stack for the remainder of its life cycle, a large amount of stack space will remain free. We need to restore that space somehow. Thoughts:

﻿At GC time, if a go routine uses no more than X% of the stack space, copy it to a smaller stack. It will regrow later if needed.

﻿At GC time, if a go routine uses no more than X% of stack space, lower its stack protection to a smaller value. If the next GC fails to reach the target, it is copied to a smaller stack.

﻿﻿My current plan is to free the bottom ½ of the stack when a go routine is using up to 1/4 of its stack during GC. If the stack is big enough, I'll just release it, otherwise copy.


#### Starting stacks

 By default, all G's start with a minimum size stack. When a G completes, we deallocate its stack, since it may be larger than is required by the next go routine starting just on that G (or maybe we let the shrinking code handle this?)


﻿﻿We can keep some statistics about how much stack is used by each go routine (specified by the function address) and how much stack is pre-allocated before starting that go routine. Statistics can be updated at the end of each execution of a go routine. It's not perfect, like go routines whose stack usage depends on the data. But this might be an appropriate starting point.


﻿﻿This mechanism can also be used in the split stack world if we are willing to log maximum stack usage in Go routines. However, it must be more conservative. In a split-stack world, allocating an initial stack that is too large cannot be undone.

#### Disadvantages

* More virtual memory pressure/fragmentation. Especially with large stacks, finding contiguous memory to place the stack becomes more difficult. Some hybrid scenario might be better, like copying to 1 MB size and splitting after that. While this might help, I don't think it's worth the additional implementation complexity of retaining these two mechanisms.

* Pointer to stack limit. All pointers into the stack area must be strictly declared. Currently, our escape analysis ensures that there are no stray pointers on the stack. There may be situations in the future where we want to allow pointers onto the stack and this implementation will exclude them. I'm not sure what happens in these cases, but the limitation is worth mentioning.

* The runtime C/asm code may need to be audited to ensure nothing tricky happens with the stack pointer.

#### Experiments so far

 I'm running a [prototype implementation](https://codereview.appspot.com/9029047/)
. It's not finished yet, but simple examples can be compiled.


﻿Peano (test/peano.go) has been modified to run up to 11! 10% faster However, it is very sensitive to the growth rate, so take it with a pinch of salt. (Doubling the stack size per replica is 10% faster. Growing the stack per replica by 50% is only 2% faster. Growing the stack by 25% is 20% slower.)


 “Hot split” test case [stacksplit.go](https://play.golang.org/p/YVRi8hzZt1). Compile with -gcflags -l to disable inlining.

```
segmented stacks:

no split: 1.25925147s
with split: 5.372118558s   <- triggers hot split problem
both split: 1.293200571s


contiguous stacks:

no split: 1.261624848s
with split: 1.262939769s
both split: 1.29008309s

```

#### Benchmark examples

﻿﻿I modified the implementation of segmented stacks and continuous stacks to use environment variables to configure their stack segment size/initial stack size. We can use this feature to test the sensitivity of the benchmark to stack segment size. (For these experiments, contiguous stack sizes were limited to powers of 2.)

 encoding/json/BenchmarkEncode: People have complained about this historically. See bug 3787.

![josn-benchmnark.png](https://i.loli.net/2019/12/28/MoAntO7sNzp5jIq.png))

Approximately the maximum stack usage is around 19KB, and below that poor segmentation will cause downward spikes.

﻿html/template/BenchmarkEscapedExecute: This benchmark has a particular problem at 4096 bytes/segment (the default size, which is how I found it).

![html/template benchmark.png](https://i.loli.net/2019/12/28/TMlB6n1Dow9Xp37.png))


  (I don’t understand why continuous stacks are implicitly asymptotically better.)
