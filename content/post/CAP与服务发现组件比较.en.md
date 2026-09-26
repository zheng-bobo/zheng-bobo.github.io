---
title: "CAP and a Comparison of Service Discovery Systems"
date: 2020-02-29 09:41:00 +0800
slug: "cap-and-service-discovery-systems"
categories: ["Architecture"]
---

### Overview of CAP theory
**A distributed system can only satisfy at most two of the three requirements of consistency (consistency), availability (Availability) and partition tolerance (Partition tolerance) at the same time. **

### Introduction
Overview of CAP theory: [CAP theory of distributed systems](http://www.hollischuang.com/archives/666)

### Consistency model

﻿ Consistency refers to `all nodes see the same data at the same time`, that is, after the update operation is successful and returned to the client, the data of all nodes at the same time is completely consistent. Therefore, consistency refers to data consistency.

  Consistency can be divided into the following three consistency strategies: <br/>
1.`Linearizability (Strong consistency or Atomic consistency)` Strong consistency, linear consistency <br/>
2.`Sequential consistency` Sequential consistency <br/>
3.`Causal consistency` Causal consistency <br/>
4.`Eventual consistency` final consistency, if after a period of time it is required to access the updated data <br/>

In CAP, the consistency that cannot be satisfied at the same time refers to strong consistency/linear consistency. Here we mainly introduce strong consistency and sequential consistency

#### Linearizability
 Linear consistency is also called strong consistency or atomic consistency.

![linearizability.png](https://i.loli.net/2020/02/29/NufGsnqXiO9j3xC.png)

  1.Referee: Update the final result of the competition, first insert it into the database leader copy, and then the leader copies it to the two follower copies.

  2.Alice: Found the latest game scores from Follower 1

  3.Bob: The latest game score was indeed not found from Follower 2, but it does show that the game is in progress.

﻿﻿If Alice and Bob are in the same room, each staring at their mobile phones to watch the game, Alice refreshes the page, cashback Germany wins the game, and then tells Bob the result of the game, and Bob refreshes the page, confirming that the game is in progress. Obviously this result is not in line with expectations, and in fact it is not linearly consistent. For Bob, the result he wants to see should be the latest match result like Alice, rather than an old result.

> The basic idea of ​​Linearizability is to make a system appear as if there is only one copy of data, and all operations are atomic. With this guarantee, applications don't need to worry about them even though there may actually be multiple replicas.

> Linearizability requires the system to behave like a single copy, executing read and write operations of threads serially in actual time order. This is where the definition of "linear" comes from. However, a system that satisfies linear consistency is not only difficult to implement, but also difficult to provide high performance.

#### ·Sequential consistency

The definition of Sequential consistency actually imposes two constraints on the system when accessing shared objects:

  1. From the perspective of a single processor (thread or process), the execution order of its instructions is subject to the order in programming;

  2. From the perspective of all processors (threads or processes), the execution of instructions maintains a single order;

Constraint 1 ensures that all instructions of a single process are executed in the order in the program; while constraint 2 ensures that all memory operations are atomic or real-time. From a programmer's perspective, sequential consistency provides an abstraction as shown below. We can think of shared memory as a service desk, and multiple processes as queuing queues to receive services: the internal read and write instructions of each process are first-come-first-served in the programming order, and the service desk is constantly switching between multiple queues.

![sequential.png](https://i.loli.net/2020/02/29/F97LkONPQ4KSilX.png)

It can be seen that compared with linearizability, Sequential consistency relaxes the consistency requirements. First of all, it does not require that the execution order of operations strictly follows the real time sequence; secondly, it does not have any requirements for the execution sequence of read and write operations between different threads, and only needs to ensure that the execution is atomic.

### Comparison of the two
  A brief summary of the two is as follows:

| linearizability| Sequential consistency|
| ---- | ---- |---- |
| A single process requires time sequence | A single process requires programming |
| Different processes are required to follow the time sequence | There is no requirement for the reading and writing order of different processes |
| Can be achieved through active backup | Can be achieved through passive backup |

### Availability

Suppose there are replicas of the database in two different data centers. The requirement for replicas is that when data is written in one data center, the data must be written to the replica in another data center. Assuming that the client is only connected to one data center, then when data is copied, it must rely on the network link between the two data centers.

Now suppose the network connection goes down - that's what a network partition means. Guess what happens?

![available.png](https://i.loli.net/2020/02/29/sDUk3ZPXjr19Oi7.png)

 Obviously you can only choose one of the two:

　　1. The program can continue to write to the database, so the databases in both data centers are fully available. But as long as the connection on which data replication depends is interrupted, changes to the database in one data center will not be synchronized to the other data center. This violates linearizability (in the previous example, Alice may be connected to data center 1, and Bob is connected to data center 2).

　　2. If you do not want to lose linearizability, you must ensure that all read and write operations are performed in one data center (can be called the leader), and in another data center (which cannot be updated to the latest due to the interruption of the connection that data replication depends on), you must stop accepting read and write operations before the network partition returns to normal and the data synchronization is completed. Although the non-leader database has not failed, it cannot handle requests, so it is not CAP-available.


Note, in the theoretical "unavailable" situation in option 2, we are still happily serving requests in one data center. So if the system chooses linearizability (i.e. it is not cap available), this does not necessarily mean that network partitions will automatically cause application downtime. If you can move all client requests to the leader data center, then the client will actually not feel the downtime at all.

 In actual engineering, availability is not entirely consistent with CAP-availability. Application availability may be measured by SLA (for example, 99.9% of legitimate requests must successfully return a response within 1 second)



| Availability Classification | Availability Level (%) | Yearly Tolerable Downtime |
| ---- | ---- |---- |
| Fault-tolerant availability| 99.9999| <1 min|
| Extremely High Availability| 99.999| <5 min
| Availability with automatic fault recovery | 99.99| <53 min|
| High Availability | 99.9| <8.8h|
| Product Availability| 99| <43.8 min|

  Usually when we describe the availability of a system, we say that Taobao's system availability can reach five nines, which means that its availability level is 99.999%, that is, the annual downtime does not exceed (1-0.99999)*365*24*60 = 5.256 minutes, which is an extremely high requirement.

### Partition Tolerance
 Partition fault tolerance refers to `the system continues to operate despite arbitrary message loss or failure of part of the system`, that is, when a distributed system encounters a node or network partition failure, it can still provide external services that meet the consistency and availability.

### Service registration discovery component
 After understanding CAP, let’s take a look at the comparison of service registration discovery components <br/>

|Feature|Consul|zookeeper|etcd| euerka|
| ---- | ---- |---- |---- |---- |
|Service health check| Service status, memory, hard disk, etc.| (Weak) long connection, keepalive| Connection heartbeat| Configurable support|
|Multiple Data Centers| Support| —| —| —|
|kv storage service| support| support| support| —|
|Consistency| raft| paxos| raft| —|
|cap| cp| cp| cp| ap|
|Using interface (multi-language capability)| Support http and dns| Client| http/grpc| http (sidecar)|
|watch support| Full/support long polling| Support| Support long polling| Support long polling/most increments|
|Self-monitoring| metrics| —| metrics| metrics|
|Security| acl /https| acl| https support (weak) | — |
|spring| cloud integration| Supported| Supported| Supported| Supported|


Problems caused by ZooKeeper strong consistency (C):

 At any time, access requests to Zookeeper can obtain consistent data results, and the system is fault-tolerant to network segmentation, but Zookeeper cannot guarantee that every service request is reachable. Judging from the actual application of Zookeeper, when using Zookeeper to obtain the service list, if the Leader in the Zookeeper cluster is down at this time, the cluster will conduct Leader election, or more than half of the server nodes in the Zookeeper cluster are unavailable (for example, there are three nodes, if node one detects that node three is down, and node two also detects that node three is down, then this node is really down), then the request will not be processed. Therefore, Zookeeper cannot guarantee service availability.

Of course, in most distributed environments, especially scenarios involving data storage, data consistency should be guaranteed first, which is another reason why Zookeeper is designed to adhere to the CP principle. But for service discovery, the situation is different. For the same service, even if the service provider information stored in different nodes in the registration center is different, it will not cause catastrophic consequences. Because for service consumers, being able to consume is the most important thing. Although consumers get the service instance information that may be incorrect and try to consume it, it is better than not consuming it because they cannot obtain the instance information, causing system exceptions (Taobao's Double Eleven and JD.com's Yaoliuba are the best references for adhering to AP).

 When the master node loses contact with other nodes due to network failure, the remaining nodes will re-elect the leader. The problem is that the leader election takes too long, 30 to 120 seconds, and the entire ZooKeeper cluster is unavailable during the election, which causes the registration service to be paralyzed during the election. In a cloud deployment environment, it is a high probability event that the zk cluster loses the master node due to network problems. Although the service can eventually be restored, long-term election events that cause registration to be unavailable for a long time are intolerable.


What consul,etcd strong consistency (C) brings is:

 Service registration will be slightly slower than Eureka. Because the raft protocol of consul, etcd requires that more than half of the nodes must be successfully written before the registration is considered successful <br/>
  When Leader hangs up, the entire consul, etcd will be unavailable during the re-election period. Strong consistency is ensured but availability is sacrificed.


Euerka guarantees high availability (A) and eventual consistency:

﻿ Service registration is relatively fast because there is no need to wait for the registration information to be replicated to other nodes, and there is no guarantee whether the registration information is replicated successfully <br/>
﻿﻿When data is inconsistent, although the registration information on A and B is not exactly the same, each Eureka node can still provide services to the outside world normally. This will cause the service information to be queried if the request A cannot be found, but the request B can be found. This ensures availability but sacrifices consistency.


### References
[CAP Theory of Distributed Systems](https://www.hollischuang.com/archives/666)

[Linear consistency: What is linear consistency? ](https://zhuanlan.zhihu.com/p/42239873)

[Distributed system consistency Linearizability vs. Sequential consistency](http://kaiyuan.me/2018/04/21/consistency-concept/)

[Stop referring to databases as CP or AP](https://zhuanlan.zhihu.com/p/55053121)

[why-you-shouldnt-use-zookeeper-for-service-discovery](https://medium.com/knerd/eureka-why-you-shouldnt-use-zookeeper-for-service-discovery-4932c5c7e764)

[Why you shouldn’t use ZooKeeper for service discovery (translation)](https://blog.csdn.net/vtopqx/article/details/81537004)

[Service discovery comparison: Consul vs Zookeeper vs Etcd vs Eureka](https://www.cnblogs.com/duanxz/p/7048090.html?utm_source=itdadao&utm_medium=referral)
