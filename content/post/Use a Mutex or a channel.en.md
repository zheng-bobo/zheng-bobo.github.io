---
title: "Use a Mutex or a Channel?"
date: 2020-01-16 11:27:00 +0800
slug: "use-a-mutex-or-a-channel"
categories: ["Go"]
---


[Use a sync.Mutex or a channel?](https://github.com/golang/go/wiki/MutexOrChannel)

  Gives us 3 channel usage scenarios respectively:

![scene.png](https://i.loli.net/2020/01/16/DX19RyqIOSBCg7j.png)

* 1. Transfer ownership of data
* 2. Assign work units
* 3. Convey asynchronous results

**Usage scenarios of 2 mutex:**

* 1. Cache
* 2. Status

**Chapter 2 "Go's Philosophy on Concurrency" in the book "Concurrency In Go" also has a decision tree and detailed discussion**

![Decision.png](https://i.loli.net/2020/01/16/YzUad5ct4byTLiN.png)

**Summary**

﻿Go implements the CSP communication model through channels, which are mainly used for message passing and event notification between goroutines. For some scenarios with high performance requirements, or to prevent concurrent modification of internal states, it would be more appropriate to implement it through mutex.

* 1. Pay attention to the flow of data, and you can use channels to solve concurrency problems.
* 2. For non-flowing data, if there are concurrent accesses, try to use sync.Mutex to protect the data.
* 3. If the sync.Mutex implementation process is complicated, you can use channel implementation instead

**References**

[https://github.com/golang/go/wiki/MutexOrChannel](https://github.com/golang/go/wiki/MutexOrChannel)
