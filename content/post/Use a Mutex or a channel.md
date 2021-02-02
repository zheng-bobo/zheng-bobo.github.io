---
title: Use a Mutex or a channel ?
categories: [go]
date: 2020-01-16 11:27:00 +0800
---

[Use a sync.Mutex or a channel?](https://github.com/golang/go/wiki/MutexOrChannel)

&emsp;&emsp;分别给了我们3个channel使用场景:

![场景.png](https://i.loli.net/2020/01/16/DX19RyqIOSBCg7j.png)

* 1.传递数据的所有权
* 2.分配工作单元
* 3.传达异步结果

**2个mutex的使用场景:**

* 1.缓存
* 2.状态

**《Concurrency In Go》书中第二章 “Go's Philosophy on Concurrency” 里对此也有一张决策树和详细的论述**

![决策.png](https://i.loli.net/2020/01/16/YzUad5ct4byTLiN.png)

**总结**

&emsp;&emsp;Go 通过 channel 实现 CSP 通信模型，主要用于 goroutine 之间的消息传递和事件通知。而对于一些性能要求较高，或防止并发修改内部状态等场景，通过mutex来实现会更为合适。

*  1.  关注数据的流动，就可以使用channel解决并发问题。
*  2.  不流动的数据，如果存在并发访问，尝试使用sync.Mutex保护数据。
*  3.  如果sync.Mutex实现流程复杂，可以改用channel实现

**参考资料**

[https://github.com/golang/go/wiki/MutexOrChannel](https://github.com/golang/go/wiki/MutexOrChannel)
