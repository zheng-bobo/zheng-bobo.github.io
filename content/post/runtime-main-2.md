---
title: main goroutine调度源码分析(2)
categories: [go]
date: 2019-11-13 22:20:10 +0800
---
### 9.进入到runtime/proc.go,调度器初始化

```
func schedinit() {
	// raceinit must be the first call to race detector.
	// In particular, it must be done before mallocinit below calls racemapshadow.
    // getg函数由编译器实现，类似执行下面两行代码
    // get_tls(CX)
    // MOVQ g(cx), BX; BX寄存器 = tls[0] = 当前g结构体对象的地址

	_g_ := getg()           // 调度器初始化过程中, _g_ = &g0
	if raceenabled {
		_g_.racectx, raceprocctx0 = raceinit()
	}

	sched.maxmcount = 10000 // 最多启动10000个操作系统线程，也是最多10000个M

	tracebackinit()
	moduledataverify()

	// 内存相关初始化
	stackinit()
	mallocinit()
	// M相关初始化
	mcommoninit(_g_.m)
	cpuinit()       // must run before alginit
	alginit()       // maps must not be used before this call
	modulesinit()   // provides activeModules
	typelinksinit() // uses maps, activeModules
	itabsinit()     // uses activeModules

	msigsave(_g_.m)
	initSigmask = _g_.m.sigmask
	// 存储命令行参数和环境变量
	goargs()
	goenvs()
	// 解析GODEBUG的调试参数
	parsedebugvars()
	// 初始化垃圾回收器
	gcinit()
	// 初始化 poll时间
	sched.lastpoll = uint64(nanotime())
	// 设置 GOMAXPROCS
	procs := ncpu
	if n, ok := atoi32(gogetenv("GOMAXPROCS")); ok && n > 0 {
		procs = n
	}
	if procresize(procs) != nil {
		throw("unknown runnable goroutine during bootstrap")
	}

	// For cgocheck > 1, we turn on the write barrier at all times
	// and check all pointer writes. We can't do this until after
	// procresize because the write barrier needs a P.
	if debug.cgocheck > 1 {
		writeBarrier.cgo = true
		writeBarrier.enabled = true
		for _, p := range allp {
			p.wbBuf.reset()
		}
	}

	if buildVersion == "" {
		// Condition should never trigger. This code just serves
		// to ensure runtime·buildVersion is kept in the resulting binary.
		buildVersion = "unknown"
	}
}

```

以下摘自[Go语言内幕（6）：启动和内存分配初始化](https://studygolang.com/articles/7212)


**runtime.tracebackinit**
&emsp;&emsp;runtime.tracebackinit 负责初始化 traceback。
&emsp;&emsp;traceback 是一个函数栈。这些函数会在我们到达当前执行点之前被调用。举个例子，每次产生一个 panic 时我们都可以看到它们。
&emsp;&emsp;Traceback 是通过调用 runtime.gentraceback 函数产生的。要让这个函数工作， 我们需要知道一些内置函数的地址(例如，因为我们不希望它们被包含到 traceback 中）。runtime.traceback 就负责初始化这些地址。

**runtime.moduledataverify**
&emsp;&emsp;链接器符号是由链接器产生输出到可执行目标文件中的数据。其中大部分数据已经在[Go语言内幕（3）：链接器、链接器、重定位](https://studygolang.com/articles/7208)中讨论过了。
&emsp;&emsp;在运行时包中，链接器符号被映射到 moduledata 结构体。 runtime.moduledataverify 函数负责检查这些数据，以确保所有结构体的正确性。


**runtime.stackinit**
```
func stackinit() {
	if _StackCacheSize&_PageMask != 0 {
		throw("cache size must be a multiple of page size")
	}
	for i := range stackpool {
		stackpool[i].init()
	}
	for i := range stackLarge.free {
		stackLarge.free[i].init()
	}
}
```
&emsp;&emsp;Go中栈增长的实现方法:当一个新的goroutine被生成时，系统会为其分配一个2k-8k大小的栈。当栈达到某个阈值时，栈的大小会增大一倍并将原来栈中的数据全部拷贝到新的栈中。

&emsp;&emsp;还有许多细节，比如如何判断是否达到阈值，Go 如何调整栈中的指针等。在前面的博客中介绍 stackguard0 与函数元数据时，我已经介绍了部分相关的内容。更多的内容，你可以参考这篇[文档](https://docs.google.com/document/d/1wAaf1rYoM4S4gtnPh0zOlGzWtrZFQ5suE8qr2sD8uWQ/pub)

&emsp;&emsp;runtime调度器初始化时,通过 runtime.stackinit 函数初始化stackpool 数组。这个数组中的每一项是一个包含相同大小栈的链表。

&emsp;&emsp;这一步还初始化了另外一个变量stackLarge.free，如果分配的内容是大对象(size > 32k)，则直接从stackLarge这里进行分配。

&emsp;&emsp;不同操作系统中初始化栈空间大小及栈池大小：

| OS      | FixedStack | NumStackOrders|
| :-------: |:-------------:| :-----:|
|linux/darwin/bsd   | 2KB| 4
|windows/32     | 4KB|   3
| windows/64   | 8KB|    2
| plan9   | 4KB|   2


**runtime.mallocinit**

```
func mallocinit() {
    // 错误检查
    ...
      // 1.初始化堆内容空间mheap，mcentral，及mcache
      // Initialize the heap.
	mheap_.init()  、
	_g_ := getg()
	_g_.m.mcache = allocmcache()
}
```

`mHeap 结构体`
&emsp;&emsp;代表Go程序持有的所有堆内存，Go程序使用一个 mheap 的全局对象 _mheap 来管理堆内存。
```
type mheap struct {
      lock      mutex
      free      mTreap  // 空闲span集合 (树形结构)
     allspans []*mspan // 所有的span
     // mcentral 内存分配中心，mcache没有足够的内存分配的时候，会从mcentral分配
    central [numSpanClasses]struct {
        mcentral mcentral
        pad      [sys.CacheLineSize - unsafe.Sizeof(mcentral{})%sys.CacheLineSize]byte
    }
    spanalloc             fixalloc // span分配器
   cachealloc            fixalloc // mcache分配器
}
```


`有关Go内存分配的更多细节，可查看文章，此处不多细讲：`
深入理解Go-内存分配：[https://www.tuicool.com/articles/2uAZBrM](https://www.tuicool.com/articles/2uAZBrM)
图解Golang的内存分配:[https://i6448038.github.io/2019/05/18/golang-mem/](https://i6448038.github.io/2019/05/18/golang-mem/)


**runtime.mcommoninit**
&emsp;&emsp;初始化m0,m0完成基本的初始化后，把m0放入全局链表allm之中
```

func mcommoninit(mp *m) {
	_g_ := getg() // 调度器初始化过程中_g_ = g0

	// g0 stack won't make sense for user (and is not necessary unwindable).
	if _g_ != _g_.m.g0 {    //函数调用栈traceback，不需要关心
		callers(1, mp.createstack[:])
	}

	lock(&sched.lock)
	if sched.mnext+1 < sched.mnext {
		throw("runtime: thread ID overflow")
	}
	mp.id = sched.mnext
	sched.mnext++
	checkmcount() //检查已创建系统线程是否超过了数量限制（10000）

	mp.fastrand[0] = 1597334677 * uint32(mp.id)
	mp.fastrand[1] = uint32(cputicks())
	if mp.fastrand[0]|mp.fastrand[1] == 0 {
		mp.fastrand[1] = 1
	}
   //创建用于信号处理的gsignal，只是简单的从堆上分配一个g结构体对象,然后把栈设置好就返回了

	mpreinit(mp)
	if mp.gsignal != nil {
		mp.gsignal.stackguard1 = mp.gsignal.stack.lo + _StackGuard
	}

	//把m挂入全局链表allm之中
	mp.alllink = allm

	// NumCgoCall() iterates over allm w/o schedlock,
	// so we need to publish it safely.
	atomicstorep(unsafe.Pointer(&allm), unsafe.Pointer(mp))
	unlock(&sched.lock)

	// Allocate memory to hold a cgo traceback if the cgo call crashes.
	if iscgo || GOOS == "solaris" || GOOS == "illumos" || GOOS == "windows" {
		mp.cgoCallers = new(cgoCallers)
	}
}
```

**runtime.procresize**
&emsp;&emsp;这个函数代码比较长，但并不复杂，这里总结一下这个函数的主要流程：
1.  使用make([]*p, nprocs)初始化全局变量allp，即allp = make([]*p, nprocs)
2.  循环创建并初始化nprocs个p结构体对象并依次保存在allp切片之中
3.  把m0和allp[0]绑定在一起，即m0.p = allp[0], allp[0].m = m0
4.  把除了allp[0]之外的所有p放入到全局变量sched的pidle空闲队列之中
```
func procresize(nprocsint32) *p {
    old := gomaxprocs//系统初始化时 gomaxprocs = 0
 
    ......
 
    // Grow allp if necessary.
   if nprocs > int32(len(allp)) { //初始化时 len(allp) == 0
        // Synchronize with retake, which could be running
        // concurrently since it doesn't run on a P.
        lock(&allpLock)
        if nprocs <= int32(cap(allp)) {
            allp = allp[:nprocs]
        } else { //初始化时进入此分支，创建allp 切片
            nallp:=make([]*p, nprocs)
            // Copy everything up to allp's cap so we
            // never lose old allocated Ps.
            copy(nallp, allp[:cap(allp)])
            allp=nallp
        }
        unlock(&allpLock)
    }
 
    // initialize new P's
   //循环创建nprocs个p并完成基本初始化
    for i := int32(0); i<nprocs; i++{
        pp := allp[i]
        if pp == nil{
            pp=new(p)//调用内存分配器从堆上分配一个struct p
            pp.id=i
            pp.status=_Pgcstop
            ......
            atomicstorep(unsafe.Pointer(&allp[i]), unsafe.Pointer(pp))
        }
 
       ......
    }
 
    ......
 
    _g_:=getg()  // _g_ = g0
    if _g_.m.p != 0 && _g_.m.p.ptr().id < nprocs {//初始化时m0->p还未初始化，所以不会执行这个分支
        // continue to use the current P
        _g_.m.p.ptr().status=_Prunning
        _g_.m.p.ptr().mcache.prepareForSweep()
    } else {//初始化时执行这个分支
        // release the current P and acquire allp[0]
        if _g_.m.p != 0 {//初始化时这里不执行
            _g_.m.p.ptr().m=0
        }
        _g_.m.p=0
        _g_.m.mcache = nil
        p := allp[0]
        p.m = 0
        p.status = _Pidle
        acquirep(p) //把p和m0关联起来，其实是这两个strct的成员相互赋值
        if trace.enabled {
            traceGoStart()
        }
    }
    
   //下面这个for 循环把所有空闲的p放入空闲链表
    var runnablePs *p
    for i := nprocs-1; i >= 0; i-- {
        p := allp[i]
        if _g_.m.p.ptr() == p {//allp[0]跟m0关联了，所以是不能放任
            continue
        }
        p.status = _Pidle
        if runqempty(p) {//初始化时除了allp[0]其它p全部执行这个分支，放入空闲链表
            pidleput(p)
        } else {
            ......
        }
    }
 
    ......
    
    return runnablePs
}
```

&emsp;&emsp;执行至此，调度器初始化完成，m0，allp创建完成，下一步开始创建新的goroutine用于执行mainPC所对应的runtime·main函数。

### 10.创建main goroutine
&emsp;&emsp;继续返回ams_amd64.s文件runtime·rt0_go往下

```
	// create a new goroutine to start program
	MOVQ	$runtime·mainPC(SB), AX		// entry runtime.main 函数地址
	// newproc的第二个参数入栈，也就是新的goroutine需要执行的函数
	PUSHQ	AX							// AX = &funcval{runtime·main}
	// newproc的第一个参数入栈，该参数表示runtime.main函数需要的参数大小，因为runtime.main没有参数，所以这里是0
	PUSHQ	$0			// arg size
	CALL	runtime·newproc(SB)         // proc.go 创建main goroutine
	POPQ	AX 
	POPQ	AX

	// start this M
	CALL	runtime·mstart(SB)   // 主线程进入调度循环，运行刚刚创建的goroutine

      // 上面的mstart永远不应该返回的，如果返回了，一定是代码逻辑有问题，直接abort
	CALL	runtime·abort(SB)	// mstart should never return
	RET

	// Prevent dead-code elimination of debugCallV1, which is
	// intended to be called by debuggers.
	MOVQ	$runtime·debugCallV1(SB), AX
	RET
```
**runtime.newproc**
```
func newproc(siz int32, fn *funcval) {
	// 函数调用参数入栈顺序是从右向左，而且栈是从高地址向低地址增长的，支持可变参数的编译器是从右向左入栈的
	// 注意:argp指向fn函数的第一个参数，而不是newproc函数的参数
	// 函数fn在栈上地址+8位置存放的是fn函数的第一个参数，因为被调用函数的参数是放在调用函数的栈上的
	argp := add(unsafe.Pointer(&fn), sys.PtrSize)
	gp := getg() // 获取正在运行的g，初始化时是m0.g0
	// pc寄存器存的是下一条执行指令的地址
	// getcallerpc()返回一个地址，也就是调用newproc时由call指令压栈的函数返回地址，
	// 对于asm_amd64.s runtime·rt0_go函数这个场景来说，pc就是CALLruntime·newproc(SB)指令后面的POPQ AX这条指令的地址
	pc := getcallerpc()
	// systemstack asm_amd64.s runtime·systemstack(SB) 切回到g0栈执行作为参数的函数，然后再切换到curg
	systemstack(func() {
		newproc1(fn, (*uint8)(argp), siz, gp, pc)
	})
}

func newproc1(fn *funcval, argp *uint8, narg int32, callergp *g, callerpc uintptr) {
	// 因为已经切换到g0栈，所以无论什么场景都有 _g_ = g0，当然这个g0是指当前工作线程的g0
	_g_ := getg()

	if fn == nil {
		_g_.m.throwing = -1 // do not dump full stacks
		throw("go of nil func value")
	}
	acquirem() // disable preemption because it can be holding p in a local var
	siz := narg
	siz = (siz + 7) &^ 7

	// We could allocate a larger initial stack if necessary.
	// Not worth it: this is almost always an error.
	// 4*sizeof(uintreg): extra space added below
	// sizeof(uintreg): caller's LR (arm) or return address (x86, in gostartcall).
	if siz >= _StackMin-4*sys.RegSize-sys.RegSize {
		throw("newproc: function arguments too large for new goroutine")
	}
	// 初始化时_p_ = g0.m.p，从前面的分析可以知道其实就是allp[0]
	_p_ := _g_.m.p.ptr()
	// 从p的本地缓存里获取一个没有使用的g,初始化时没有，返回nil
	newg := gfget(_p_)
	if newg == nil {
		// new一个g结构体对象，然后从堆上为其分配栈，并设置g的stack成员和两个stackgard成员
		newg = malg(_StackMin)
		// 初始化g的状态为_Gdead
		casgstatus(newg, _Gidle, _Gdead)
		// 放入全局变量allgs，并更新allglen
		allgadd(newg) // publishes with a g->status of Gdead so GC scanner doesn't look at uninitialized stack.
	}
	if newg.stack.hi == 0 {
		throw("newproc1: newg missing stack")
	}

	if readgstatus(newg) != _Gdead {
		throw("newproc1: new g is not Gdead")
	}
	// 调整g的栈顶置针，无需关注
	totalSize := 4*sys.RegSize + uintptr(siz) + sys.MinFrameSize // extra space in case of reads slightly beyond frame
	totalSize += -totalSize & (sys.SpAlign - 1)                  // align to spAlign
	sp := newg.stack.hi - totalSize
	spArg := sp
	if usesLR {
		// caller's LR
		*(*uintptr)(unsafe.Pointer(sp)) = 0
		prepGoExitFrame(sp)
		spArg += sys.MinFrameSize
	}
	if narg > 0 {
		// 把参数从执行newproc函数的栈（初始化时是g0栈）拷贝到新g的栈
		// 从argp地址开始，拷贝nrag个字节到spArg
		memmove(unsafe.Pointer(spArg), unsafe.Pointer(argp), uintptr(narg))
		// This is a stack-to-stack copy. If write barriers
		// are enabled and the source stack is grey (the
		// destination is always black), then perform a
		// barrier copy. We do this *after* the memmove
		// because the destination stack may have garbage on
		// it.
		if writeBarrier.needed && !_g_.m.curg.gcscandone {
			f := findfunc(fn.fn)
			stkmap := (*stackmap)(funcdata(f, _FUNCDATA_ArgsPointerMaps))
			if stkmap.nbit > 0 {
				// We're in the prologue, so it's always stack map index 0.
				bv := stackmapdata(stkmap, 0)
				bulkBarrierBitmap(spArg, spArg, uintptr(bv.n)*sys.PtrSize, 0, bv.bytedata)
			}
		}
	}
	// 把newg.sched结构体成员的所有成员设置为0
	memclrNoHeapPointers(unsafe.Pointer(&newg.sched), unsafe.Sizeof(newg.sched))
	// 设置newg的sched成员，调度器需要依靠这些字段才能把goroutine调度到CPU上运行。
	newg.sched.sp = sp // 栈顶
	newg.stktopsp = sp
	// newg.sched.pc表示当newg被调度起来运行时从这个地址开始执行指令
	// 把pc设置成了goexit这个函数偏移1（sys.PCQuantum等于1）的位置，
	// 至于为什么要这么做需要等到分析完gostartcallfn函数才知道
	// 正常该gorutine下一步指令应该是fn函数
	newg.sched.pc = funcPC(goexit) + sys.PCQuantum // +PCQuantum so that previous instruction is in same function
	newg.sched.g = guintptr(unsafe.Pointer(newg))
	gostartcallfn(&newg.sched, fn)
	newg.gopc = callerpc
	newg.ancestors = saveAncestors(callergp)
	// 设置newg的startpc为fn.fn，该成员主要用于函数调用栈的traceback和栈收缩
	// newg真正从哪里开始执行并不依赖于这个成员，而是sched.pc
	newg.startpc = fn.fn
	if _g_.m.curg != nil {
		newg.labels = _g_.m.curg.labels
	}
	if isSystemGoroutine(newg, false) {
		atomic.Xadd(&sched.ngsys, +1)
	}
	newg.gcscanvalid = false
	// 设置g的状态为_Grunnable，表示这个g代表的goroutine可以运行了
	casgstatus(newg, _Gdead, _Grunnable)

	if _p_.goidcache == _p_.goidcacheend {
		// Sched.goidgen is the last allocated id,
		// this batch must be [sched.goidgen+1, sched.goidgen+GoidCacheBatch].
		// At startup sched.goidgen=0, so main goroutine receives goid=1.
		_p_.goidcache = atomic.Xadd64(&sched.goidgen, _GoidCacheBatch)
		_p_.goidcache -= _GoidCacheBatch - 1
		_p_.goidcacheend = _p_.goidcache + _GoidCacheBatch
	}
	newg.goid = int64(_p_.goidcache)
	_p_.goidcache++
	if raceenabled {
		newg.racectx = racegostart(callerpc)
	}
	if trace.enabled {
		traceGoCreate(newg, newg.startpc)
	}
	// 把newg放入_p_的运行队列，初始化的时候一定是p的本地运行队列，其它时候可能因为本地队列满了而放入全局队列
	runqput(_p_, newg, true)

	if atomic.Load(&sched.npidle) != 0 && atomic.Load(&sched.nmspinning) == 0 && mainStarted {
		wakep()
	}
	releasem(_g_.m)
}
```
这部分逻辑比较难理解，具体可以参考文章 [https://www.cnblogs.com/abozhang/p/10825342.html](https://www.cnblogs.com/abozhang/p/10825342.html)

**runtime·mstart**

```
func mstart() {
    _g_ := getg() //_g_ = g0
 
        //对于启动过程来说，g0的stack.lo早已完成初始化，所以onStack = false
    osStack := _g_.stack.lo == 0
    if osStack {
        // Initialize stack bounds from system stack.
        // Cgo may have left stack size in stack.hi.
        // minit may update the stack bounds.
        size := _g_.stack.hi
        if size == 0 {
            size = 8192 * sys.StackGuardMultiplier
        }
        _g_.stack.hi = uintptr(noescape(unsafe.Pointer(&size)))
        _g_.stack.lo = _g_.stack.hi - size + 1024
    }
    // Initialize stack guards so that we can start calling
    // both Go and C functions with stack growth prologues.
    _g_.stackguard0 = _g_.stack.lo + _StackGuard
    _g_.stackguard1 = _g_.stackguard0
     
    mstart1()
 
    // Exit this thread.
    if GOOS == "windows" || GOOS == "solaris" || GOOS == "plan9" || GOOS == "darwin" || GOOS == "aix" {
        // Window, Solaris, Darwin, AIX and Plan 9 always system-allocate
        // the stack, but put it in _g_.stack before mstart,
        // so the logic above hasn't set osStack yet.
        osStack = true
    }
    mexit(osStack)
}
```
mstart函数本身没啥说的，它继续调用mstart1函数。

```
func mstart1() {
    _g_ := getg()  //启动过程时 _g_ = m0的g0
 
    if _g_ != _g_.m.g0 {
        throw("bad runtime·mstart")
    }
 
    // Record the caller for use as the top of stack in mcall and
    // for terminating the thread.
    // We're never coming back to mstart1 after we call schedule,
    // so other calls can reuse the current frame.
        //getcallerpc()获取mstart1执行完的返回地址
        //getcallersp()获取调用mstart1时的栈顶地址
    save(getcallerpc(), getcallersp())
    asminit()  //在AMD64 Linux平台中，这个函数什么也没做，是个空函数
    minit()    //与信号相关的初始化，目前不需要关心
 
    // Install signal handlers; after minit so that minit can
    // prepare the thread to be able to handle the signals.
    if _g_.m == &m0 { //启动时_g_.m是m0，所以会执行下面的mstartm0函数
        mstartm0() //也是信号相关的初始化，现在我们不关注
    }
 
    if fn := _g_.m.mstartfn; fn != nil { //初始化过程中fn == nil
        fn()
    }
 
    if _g_.m != &m0 {// m0已经绑定了allp[0]，不是m0的话还没有p，所以需要获取一个p
        acquirep(_g_.m.nextp.ptr())
        _g_.m.nextp = 0
    }
     
        //schedule函数永远不会返回
    schedule()
}
```
mstart1首先调用save函数来保存g0的调度信息，`save这一行代码非常重要，是我们理解调度循环的关键点之一`。这里首先需要注意的是代码中的getcallerpc()返回的是mstart调用mstart1时被call指令压栈的返回地址，getcallersp()函数返回的是调用mstart1函数之前mstart函数的栈顶地址，其次需要看看save函数到底做了哪些重要工作。
```
// save updates getg().sched to refer to pc and sp so that a following
// gogo will restore pc and sp.
//
// save must not have write barriers because invoking a write barrier
// can clobber getg().sched.
//
//go:nosplit
//go:nowritebarrierrec
func save(pc, sp uintptr) {
    _g_ := getg()
 
    _g_.sched.pc = pc //再次运行时的指令地址
    _g_.sched.sp = sp //再次运行时到栈顶
    _g_.sched.lr = 0
    _g_.sched.ret = 0
    _g_.sched.g = guintptr(unsafe.Pointer(_g_))
    // We need to ensure ctxt is zero, but can't have a write
    // barrier here. However, it should always already be zero.
    // Assert that.
    if _g_.sched.ctxt != nil {
        badctxt()
    }
}
```
继续分析代码，save函数执行完成后，返回到mstart1继续其它跟m相关的一些初始化，完成这些初始化后则调用调度系统的核心函数schedule()完成goroutine的调度，之所以说它是核心，原因在于每次调度goroutine都是从schedule函数开始的。

```
// One round of scheduler: find a runnable goroutine and execute it.
// Never returns.
func schedule() {
	_g_ := getg() //_g_ = m.g0

	if _g_.m.locks != 0 {
		throw("schedule: holding locks")
	}

	if _g_.m.lockedg != 0 {
		stoplockedm()
		execute(_g_.m.lockedg.ptr(), false) // Never returns.
	}

	// We should not schedule away from a g that is executing a cgo call,
	// since the cgo call is using the m's g0 stack.
	if _g_.m.incgo {
		throw("schedule: in cgo")
	}

top:
	if sched.gcwaiting != 0 {
		gcstopm()
		goto top
	}
	if _g_.m.p.ptr().runSafePointFn != 0 {
		runSafePointFn()
	}

	var gp *g
	var inheritTime bool

	// Normal goroutines will check for need to wakeP in ready,
	// but GCworkers and tracereaders will not, so the check must
	// be done here instead.
	tryWakeP := false
	if trace.enabled || trace.shutdown {
		gp = traceReader()
		if gp != nil {
			casgstatus(gp, _Gwaiting, _Grunnable)
			traceGoUnpark(gp, 0)
			tryWakeP = true
		}
	}
	if gp == nil && gcBlackenEnabled != 0 {
		gp = gcController.findRunnableGCWorker(_g_.m.p.ptr())
		tryWakeP = tryWakeP || gp != nil
	}
	if gp == nil {
		// Check the global runnable queue once in a while to ensure fairness.
		// Otherwise two goroutines can completely occupy the local runqueue
		// by constantly respawning each other.
		// 为了保证调度的公平性，每个工作线程每进行61次调度就需要优先从全局运行队列中获取goroutine出来运行，
		// 因为如果只调度本地运行队列中的goroutine，则全局运行队列中的goroutine有可能得不到运行
		if _g_.m.p.ptr().schedtick%61 == 0 && sched.runqsize > 0 {
			lock(&sched.lock)                  // 所有工作线程都能访问全局运行队列，所以需要加锁
			gp = globrunqget(_g_.m.p.ptr(), 1) // 从全局运行队列中获取1个goroutine
			unlock(&sched.lock)
		}
	}
	if gp == nil {
		// 从与m关联的p的本地运行队列中获取goroutine
		gp, inheritTime = runqget(_g_.m.p.ptr())
		if gp != nil && _g_.m.spinning {
			throw("schedule: spinning with local work")
		}
	}
	if gp == nil {
		// 如果从本地运行队列和全局运行队列都没有找到需要运行的goroutine，
		// 则调用findrunnable函数从其它工作线程的运行队列中偷取，如果偷取不到，则当前工作线程进入睡眠，
		// 直到获取到需要运行的goroutine之后findrunnable函数才会返回。
		gp, inheritTime = findrunnable() // blocks until work is available
	}

	// This thread is going to run a goroutine and is not spinning anymore,
	// so if it was marked as spinning we need to reset it now and potentially
	// start a new spinning M.
	if _g_.m.spinning {
		resetspinning()
	}

	if sched.disable.user && !schedEnabled(gp) {
		// Scheduling of this goroutine is disabled. Put it on
		// the list of pending runnable goroutines for when we
		// re-enable user scheduling and look again.
		lock(&sched.lock)
		if schedEnabled(gp) {
			// Something re-enabled scheduling while we
			// were acquiring the lock.
			unlock(&sched.lock)
		} else {
			sched.disable.runnable.pushBack(gp)
			sched.disable.n++
			unlock(&sched.lock)
			goto top
		}
	}

	// If about to schedule a not-normal goroutine (a GCworker or tracereader),
	// wake a P if there is one.
	if tryWakeP {
		if atomic.Load(&sched.npidle) != 0 && atomic.Load(&sched.nmspinning) == 0 {
			wakep()
		}
	}
	if gp.lockedm != 0 {
		// Hands off own p to the locked m,
		// then blocks waiting for a new p.
		startlockedm(gp)
		goto top
	}
	// 当前运行的是runtime的代码，函数调用栈使用的是g0的栈空间
	// 调用execte切换到gp的代码和栈空间去运行
	execute(gp, inheritTime)
}

// Schedules gp to run on the current M.
// If inheritTime is true, gp inherits the remaining time in the
// current time slice. Otherwise, it starts a new time slice.
// Never returns.
//
// Write barriers are allowed because this is called immediately after
// acquiring a P in several places.
//
//go:yeswritebarrierrec
func execute(gp *g, inheritTime bool) {
    _g_ := getg() //g0
 
        //设置待运行g的状态为_Grunning
    casgstatus(gp, _Grunnable, _Grunning)
     
        //......
     
        //把g和m关联起来
    _g_.m.curg = gp
    gp.m = _g_.m
 
    //......
 
        //gogo完成从g0到gp真正的切换
    gogo(&gp.sched)
}
```

execute函数的第一个参数gp即是需要调度起来运行的goroutine，这里首先把gp的状态从_Grunnable修改为_Grunning，然后把gp和m关联起来，这样通过m就可以找到当前工作线程正在执行哪个goroutine，反之亦然。

完成gp运行前的准备工作之后，execute调用gogo函数完成从g0到gp的的切换：CPU执行权的转让以及栈的切换。

gogo函数也是通过汇编语言编写的，这里之所以需要使用汇编，是因为goroutine的调度涉及不同执行流之间的切换，前面我们在讨论操作系统切换线程时已经看到过，执行流的切换从本质上来说就是CPU寄存器以及函数调用栈的切换，然而不管是go还是c这种高级语言都无法精确控制CPU寄存器的修改，因而高级语言在这里也就无能为力了，只能依靠汇编指令来达成目的。

```
# func gogo(buf *gobuf)
# restore state from Gobuf; longjmp
TEXT runtime·gogo(SB), NOSPLIT, $16-8
    #buf = &gp.sched
    MOVQ    buf+0(FP), BX        # BX = buf
    
    #gobuf->g --> dx register
    MOVQ    gobuf_g(BX), DX  # DX = gp.sched.g
    
    #下面这行代码没有实质作用，检查gp.sched.g是否是nil，如果是nil进程会crash死掉
    MOVQ    0(DX), CX        # make sure g != nil
    
    get_tls(CX) 
    
    #把要运行的g的指针放入线程本地存储，这样后面的代码就可以通过线程本地存储
    #获取到当前正在执行的goroutine的g结构体对象，从而找到与之关联的m和p
    MOVQ    DX, g(CX)
    
    #把CPU的SP寄存器设置为sched.sp，完成了栈的切换
    MOVQ    gobuf_sp(BX), SP    # restore SP
    
    #下面三条同样是恢复调度上下文到CPU相关寄存器
    MOVQ    gobuf_ret(BX), AX
    MOVQ    gobuf_ctxt(BX), DX
    MOVQ    gobuf_bp(BX), BP
    
    #清空sched的值，因为我们已把相关值放入CPU对应的寄存器了，不再需要，这样做可以少gc的工作量
    MOVQ    $0, gobuf_sp(BX)    # clear to help garbage collector
    MOVQ    $0, gobuf_ret(BX)
    MOVQ    $0, gobuf_ctxt(BX)
    MOVQ    $0, gobuf_bp(BX)
    
    #把sched.pc值放入BX寄存器
    MOVQ    gobuf_pc(BX), BX
    
    #JMP把BX寄存器的包含的地址值放入CPU的IP寄存器，于是，CPU跳转到该地址继续执行指令，
    JMP    BX
```

现在已经从g0切换到了gp这个goroutine，对于我们这个场景来说，gp还是第一次被调度起来运行，它的入口函数是runtime.main，所以接下来CPU就开始执行runtime.main函数：

```
// The main goroutine.
func main() {
    g := getg()  // g = main goroutine，不再是g0了
 
    // ......
 
    // Max stack size is 1 GB on 64-bit, 250 MB on 32-bit.
    // Using decimal instead of binary GB and MB because
    // they look nicer in the stack overflow failure message.
    if sys.PtrSize == 8 { //64位系统上每个goroutine的栈最大可达1G
        maxstacksize = 1000000000
    } else {
        maxstacksize = 250000000
    }
 
    // Allow newproc to start new Ms.
    mainStarted = true
 
    if GOARCH != "wasm" { // no threads on wasm yet, so no sysmon
        //现在执行的是main goroutine，所以使用的是main goroutine的栈，需要切换到g0栈去执行newm()
        systemstack(func() {
            //创建监控线程，该线程独立于调度器，不需要跟p关联即可运行
            newm(sysmon, nil)
        })
    }
     
    //......
 
    //调用runtime包的初始化函数，由编译器实现
    runtime_init() // must be before defer
 
    // Record when the world started.
    runtimeInitTime = nanotime()
 
    gcenable()  //开启垃圾回收器
 
    //......
 
        //main 包的初始化函数，也是由编译器实现，会递归的调用我们import进来的包的初始化函数
    fn := main_init // make an indirect call, as the linker doesn't know the address of the main package when laying down the runtime
    fn()
 
    //......
     
        //调用main.main函数
    fn = main_main // make an indirect call, as the linker doesn't know the address of the main package when laying down the runtime
    fn()
     
    //......
 
        //进入系统调用，退出进程，可以看出main goroutine并未返回，而是直接进入系统调用退出进程了
    exit(0)
     
        //保护性代码，如果exit意外返回，下面的代码也会让该进程crash死掉
    for {
        var x *int32
        *x = 0
    }
}
```

runtime.main函数主要工作流程如下：

1.  启动一个sysmon系统监控线程，该线程负责整个程序的gc、抢占调度以及netpoll等功能的监控，在抢占调度一章我们再继续分析sysmon是如何协助完成goroutine的抢占调度的；

2.  执行runtime包的初始化；

3.  执行main包以及main包import的所有包的初始化；

4.  执行main.main函数；

5.  从main.main函数返回后调用exit系统调用退出进程；