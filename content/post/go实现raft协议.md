---
title: Go实现raft协议(1)
categories: [go]
date: 2019-12-22 17:13:00 +0800
---
### 导读
&emsp;&emsp;实现思路来自于:[MIT 6.824课程 Lab 2: Raft](https://pdos.csail.mit.edu/6.824/labs/lab-raft.html)

&emsp;&emsp;做实验前，你应该熟读raft论文，这里是:
[raft论文](https://pdos.csail.mit.edu/6.824/papers/raft-extended.pdf)
[raft译文](https://github.com/maemual/raft-zh_cn/blob/master/raft-zh_cn.md)

&emsp;&emsp;推荐阅读：
[Students' Guide to Raft](https://thesquareplanet.com/blog/students-guide-to-raft/)&emsp;[Raft Understandable Distributed Consensus](http://thesecretlivesofdata.com/raft/)


### lab内容
&emsp;&emsp;在本实验中，您您将实现[扩展论文](https://pdos.csail.mit.edu/6.824/papers/raft-extended.pdf)中描述的大多数Raft设计，包括保存持久状态并在节点发生故障然后重新启动后读取它。您将不会实现群集成员身份更改（第6节）或日志压缩/快照（第7节）。


### Part 2A
&emsp;&emsp;实现领导人选举和心跳功能(没有日志条目的AppendEntries RPC请求)
```
const (
	LEADER = iota + 1
	CANDIDATE
	FOLLOWER
)

const (
	RPC_CALL_TIMEOUT = 1 * time.Second         // 1s
	HEARTBEAT_INTERVAL = 50 * time.Millisecond // 50ms，限制每秒
)

// LogEntry 日志条目
type LogEntry struct {
	LogIndex   int			// 日志条目的索引值
	LogTerm    int			// 日志条目的任期号
	LogCommand interface{}	// 日志条目的执行指令
}


//
// A Go object implementing a single Raft peer.
//
type Raft struct {
	mu        sync.Mutex          // Lock to protect shared access to this peer's state
	peers     []*labrpc.ClientEnd // RPC end points of all peers
	persister *Persister          // Object to hold this peer's persisted state
	me        int                 // this peer's index into peers[]
	rd        *rand.Rand
	
	state     int			      // 状态

	// 所有服务器上持久存在的
	currentTerm int64     		  // 服务器最后一次知道的任期号（初始化为 0，持续递增）
	votedFor    int64     		  // 在当前获得选票的候选人的 Id
	log 		[]LogEntry		  // 日志条目集；每一个条目包含一个用户状态机执行的指令，和收到时的任期号

	// 所有服务器上经常变的
	commitIndex	int64			  // 已知的最大的已经被提交的日志条目的索引值
	lastApplied	int64			  // 最后被应用到状态机的日志条目索引值（初始化为 0，持续递增）

	// 在领导人里经常改变的 （选举后重新初始化）
	nextIndex	[]int64			  // 对于每一个服务器，需要发送给他的下一个日志条目的索引值（初始化为领导人最后索引值加一）
	matchIndex  []int64			  // 对于每一个服务器，已经复制给他的日志的最高索引值

	// timer
	eTimer    *time.Timer 	 // 选举超时定时器
	voteCh     chan struct{} // 成功投票的信号
	heartCh    chan struct{} // 心跳的信号
	// Your data here (2A, 2B, 2C).
	// Look at the paper's Figure 2 for a description of what
	// state a Raft server must maintain.

}


func (rf *Raft) getLastTerm()(lastLogTerm int64){
	if len(rf.log) <= 0 {
		return
	}
	return rf.log[len(rf.log)-1].LogTerm
}

func (rf *Raft) getLastIndex()(lastLogIndex int64){
	if len(rf.log) <= 0 {
		return
	}
	return rf.log[len(rf.log)-1].LogIndex
}

func (rf *Raft) isLEADER() bool {
	return rf.state == LEADER
}

func (rf *Raft) resetElectTimer() {
	rf.eTimer.Reset(randElectionDuration(rf.rd))
}

// return currentTerm and whether this server
// believes it is the LEADER.
func (rf *Raft) GetState() (int, bool) {
	return int(rf.currentTerm), rf.state == LEADER
}


// 请求投票 RPC
type RequestVoteArgs struct {
	// Your data here (2A, 2B).
	Term         int64  // 候选人的任期号
	CandidateID  int64 // 请求选票的候选人的 Id
	LastLogIndex int64  // 候选人的最后日志条目的索引值
	LastLogTerm  int64  // 候选人最后日志条目的任期号
}

//
// example RequestVote RPC reply structure.
// field names must start with capital letters!
//
// 请求投票 RPC 返回值
type RequestVoteReply struct {
	// Your data here (2A).
	Term        int64 // 当前任期号，以便于候选人去更新自己的任期号
	VoteGranted bool  // 候选人赢得了此张选票时为真
}

// AppendEntriesArgs 附加日志 RPC
// 由领导人负责调用来复制日志指令；也会用作heartbeat
type AppendEntriesArgs struct {
	Term 		 int64     	// 领导人的任期号
	LEADERID 	 int64     	// 领导人的 Id，以便于跟随者重定向请求
	PrevLogIndex int64 	   	// 新的日志条目紧随之前的索引值
	PrevLogTerm  int64     	// prevLogIndex 条目的任期号
	Entries      []LogEntry	// 准备存储的日志条目（表示心跳时为空；一次性发送多个是为了提高效率）
	LEADERCommit int64      // 领导人领导人已经提交的日志的索引值
}

// AppendEntriesReply 附加日志 RPC 返回值
type AppendEntriesReply struct {
	Term 		 int64     	// 当前的任期号，用于领导人去更新自己
	Success      bool       // 跟随者包含了匹配上 prevLogIndex 和 prevLogTerm 的日志时为真
}
//
// example RequestVote RPC handler.
// RequestVote 处理请求投票RPC
// 接收者实现：
// 如果term < currentTerm返回 false （论文 5.2 节）
// 如果 votedFor 为空或者为 CANDIDATEId，并且候选人的日志至少和自己一样新，那么就投票给他（论文  5.2 节，5.4 节）
func (rf *Raft) RequestVote(args *RequestVoteArgs, reply *RequestVoteReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	reply.Term = rf.currentTerm
	reply.VoteGranted = false

	if args.Term < rf.currentTerm { 
		return // CANDIDATE expired
	}
	//If RPC request or response contains term T > currentTerm: set currentTerm = T, convert to follower
	if args.Term > rf.currentTerm {
		rf.currentTerm = args.Term
		rf.state = FOLLOWER
		rf.votedFor = -1
	}
	// now the term are same
	if rf.votedFor == -1 || rf.votedFor == args.CandidateID {
		newestlog := false
		if args.LastLogTerm > rf.getLastTerm() {
			newestlog = true
		}
		if args.LastLogTerm == rf.getLastTerm() && args.LastLogIndex >= rf.getLastIndex() {
			// at least up to date
			newestlog = true
		}
		if newestlog {
			rf.state = FOLLOWER
			reply.VoteGranted = true
			rf.votedFor = args.CandidateID
		}
	}
	if reply.VoteGranted {
		// 投票成功，重置选举定时器
		rf.voteCh <- struct{}{}
	}
}


// AppendEntries 附加日志 RPC：
// 由领导人负责调用来复制日志指令；也会用作heartbeat
// 接收者实现：
// 如果 term < currentTerm 就返回 false （5.1 节）
// 如果日志在 prevLogIndex 位置处的日志条目的任期号和 prevLogTerm 不匹配，则返回 false （5.3 节）
// 如果已经存在的日志条目和新的产生冲突（索引值相同但是任期号不同），删除这一条和之后所有的 （5.3 节）
// 附加日志中尚未存在的任何新条目
// 如果 LEADERCommit > commitIndex，令 commitIndex 等于 LEADERCommit 和 新日志条目索引值中较小的一个
func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	reply.Success = false
	
	if args.Term < rf.currentTerm {
		reply.Term = rf.currentTerm
		return
	}
	// 重置选举定时器
	rf.heartCh <- struct{}{}

	if args.Term > rf.currentTerm {

		rf.currentTerm = args.Term
		reply.Term = rf.currentTerm
		rf.state = FOLLOWER
		rf.votedFor = -1
	}
}


func (rf *Raft) sendRequestVote(server int, args *RequestVoteArgs, reply *RequestVoteReply) bool {
	ok := rf.peers[server].Call("Raft.RequestVote", args, reply)
	return ok
}

func (rf *Raft) sendAppendEntries(server int, args *AppendEntriesArgs, reply *AppendEntriesReply) bool {
	ok := rf.peers[server].Call("Raft.AppendEntries", args, reply)
	return ok
}


// 选举过程
// 1.当跟随者在超过选举超时时间的情况之前都没有收到领导人的心跳，转变成候选人后就立即开始选举过程:
//	自增当前的任期号（currentTerm）
//	给自己投票
//	重置选举超时计时器
//	发送请求投票的 RPC 给其他所有服务器
func (rf *Raft) vote() {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	rf.currentTerm++
	rf.state = CANDIDATE

	args := RequestVoteArgs{
		Term:        rf.currentTerm,
		CandidateID: int64(rf.me),
		LastLogIndex:rf.getLastIndex(),
		LastLogTerm: rf.getLastTerm(),
	}
	replyCh := make(chan RequestVoteReply,len(rf.peers)-1)
	var wg sync.WaitGroup
	for server := range rf.peers {
		if server == rf.me {
			continue
		} 
		wg.Add(1)
		go func(server int){
			defer wg.Done()
			var reply RequestVoteReply 
			respCh := make(chan struct{})
			go func() {
				rf.sendRequestVote(server,&args,&reply)
				respCh<- struct{}{}
			}()
			select {
				case <-time.After(RPC_CALL_TIMEOUT): // 1s
					return
				case <-respCh:
					replyCh <- reply
			}
		}(server);
	}
	go func() {
		wg.Wait()
		close(replyCh) // avoid goroutine leak
	}()
	votes := 1 // vote by self
	needvotes := len(rf.peers)/2 + 1
	for reply := range replyCh { 
		if reply.Term > rf.currentTerm { // higher term LEADER
			rf.state = FOLLOWER
			rf.currentTerm = reply.Term
			rf.votedFor = -1
		}
		if reply.VoteGranted {
			votes++
		}
		if votes >= needvotes{
			rf.state = LEADER
			//DPrintf("candidated:%d become leader ,votes:%d need:%d", rf.me, votes,needvotes)
			for i := range rf.peers {
				rf.nextIndex[i] = rf.getLastIndex() + 1
				rf.matchIndex[i] = 0
			}
			break
		}
	}
	if votes < needvotes {
		// 票数小于大多数,成为follower
		rf.state = FOLLOWER
		rf.votedFor = -1
	}
}

// send heartbeat
func (rf *Raft) heartbeat() {
	// ch := time.Tick(HEARTBEAT_INTERVAL)
	// for {
		if !rf.isLEADER() {
			return
		}

		for i := range rf.peers {
			if i == rf.me {
				continue
			}
			go func(server int) {
				rf.mu.Lock()
				args := AppendEntriesArgs{
					Term:         rf.currentTerm,
					LEADERID:     int64(rf.me),
					PrevLogIndex: 0,
					PrevLogTerm:  0,
					Entries:      nil, // heartbeat entries are empty
				}
				rf.mu.Unlock()
				var reply AppendEntriesReply
				rf.sendAppendEntries(server, &args, &reply)
			}(i)
		}
	// 	<-ch
	// }
}


// Make create a new Raft server instance:
// peers : 所有网络节点的数组
// me : 自身在节点数组中的索引位置
func Make(peers []*labrpc.ClientEnd, me int,
	persister *Persister, applyCh chan ApplyMsg) *Raft {
	rf := &Raft{}
	rf.peers = peers
	rf.persister = persister
	rf.me = me

	rf.state = FOLLOWER
	rf.votedFor = -1
	rf.log = append(rf.log, LogEntry{LogTerm: 0})
	rf.currentTerm = 0
	rf.nextIndex = make([]int64,len(rf.peers))
	rf.matchIndex = make([]int64,len(rf.peers))
	rf.heartCh = make(chan struct{}, 1)
	rf.voteCh = make(chan struct{}, 1)
	rf.rd = rand.New(rand.NewSource(time.Now().UnixNano()))
	timer := randElectionDuration(rf.rd)
	rf.eTimer = time.NewTimer(timer)

	go func() {
		for {
			switch rf.state {
			case FOLLOWER:
				select {
				case <-rf.voteCh:
				case <-rf.heartCh:
				case <-time.After(time.Duration(rand.Intn(300)+500) * time.Millisecond):
					{
						rf.vote()
					}
				}
			case LEADER:
				rf.heartbeat() // 心跳机制
				time.Sleep(HEARTBEAT_INTERVAL)
			}
		}
	}()
	// initialize from state persisted before a crash
	rf.readPersist(persister.ReadRaftState())

	return rf
}

// randElectionDuration 从一个固定的区间（例如 150-300 毫秒）随机选择超时时间
func randElectionDuration(rd *rand.Rand) time.Duration {
	//var electimemax, electimemin int64
	//electimemax = 300
	//electimemin = 150
	//return time.Millisecond * time.Duration(rd.Int63n(electimemax-electimemin)+electimemin)
	return  time.Duration(rand.Intn(300)+500) * time.Millisecond
}
```


`执行测试代码`
```
zhengxuzhangde-MacBook-Pro:raft zhengxuzhang$ go test  -run  2A 
Test (2A): initial election ...
  ... Passed --   3.6  3  116    0
Test (2A): election after network failure ...
  ... Passed --   5.5  3  196    0
PASS
ok      _/Users/zhengxuzhang/6.824/src/raft     9.133s
```


### Part 2B
&emsp;&emsp;实现对Start()的调用开始向日志添加新操作的过程；领导人将新操作发送到AppendEntries RPC中的其他服务器。
```
// start agreement on a new log entry:
// start 开始将command追加到日志中的处理，必须马上返回，而不需要等待日志追加完成.
func (rf *Raft) Start(command interface{}) (int, int, bool) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	index := -1
	term, isLEADER := rf.GetState()
	if isLEADER {
		index = int(rf.getLastIndex() + 1)
		rf.log = append(rf.log, LogEntry{LogTerm: int(term),LogIndex:index, LogCommand: command})
	}
	if isLEADER {
		//DPrintf("leader:%d start,index:%d term:%d,command:%v", rf.me, index,term,command)
	}

	return index, term, isLEADER 
}

// AppendEntries 附加日志 RPC：
// 由领导人负责调用来复制日志指令；也会用作heartbeat
// 接收者实现：
// 如果 term < currentTerm 就返回 false （5.1 节）
// 如果日志在 prevLogIndex 位置处的日志条目的任期号和 prevLogTerm 不匹配，则返回 false （5.3 节）
// 如果已经存在的日志条目和新的产生冲突（索引值相同但是任期号不同），删除这一条和之后所有的 （5.3 节）
// 附加日志中尚未存在的任何新条目
// 如果 LEADERCommit > commitIndex，令 commitIndex 等于 LEADERCommit 和 新日志条目索引值中较小的一个
func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	reply.Success = false

	if args.Term < rf.currentTerm {
		reply.Term = rf.currentTerm
		reply.NextIndex = rf.getLastIndex() + 1
		//DPrintf("follower:%d appendentries,args term :%d,cur term:%d ",rf.me, args.Term, rf.currentTerm)
		return
	}
	// 重置选举定时器
	rf.heartCh <- struct{}{}

	if args.Term > rf.currentTerm {
		rf.currentTerm = args.Term
		reply.Term = rf.currentTerm
		rf.state = FOLLOWER
		rf.votedFor = -1
		//DPrintf("follower:%d appendentries2,args term :%d,cur term:%d ",rf.me, args.Term, rf.currentTerm)
	} 
	reply.Term = args.Term

	if args.PrevLogIndex > rf.getLastIndex() {
		reply.NextIndex = rf.getLastIndex() + 1
		//DPrintf("append entries timeout,raft :%d, term:%d ", args.PrevLogIndex, rf.getLastIndex())
		return
	}
	baseIndex := rf.log[0].LogIndex


	// 如果一个跟随者的日志和领导人不一致，那么在下一次的附加日志 RPC 时的一致性检查就会失败。
	// 在被跟随者拒绝之后，领导人就会减小 nextIndex 值并进行重试。
	// 最终 nextIndex 会在某个位置使得领导人和跟随者的日志达成一致。
	// 当这种情况发生，附加日志 RPC 就会成功，这时就会把跟随者冲突的日志条目全部删除并且加上领导人的日志。
	// 一旦附加日志 RPC 成功，那么跟随者的日志就会和领导人保持一致，并且在接下来的任期里一直继续保持。
	// 如果需要的话，算法可以通过减少被拒绝的附加日志 RPCs 的次数来优化。
	// 例如，当附加日志 RPC 的请求被拒绝的时候，跟随者可以包含冲突的条目的任期号和自己存储的那个任期的最早的索引地址。
	// 借助这些信息，领导人可以减小 nextIndex 越过所有那个任期冲突的所有日志条目；
	// 这样就变成每个任期需要一次附加条目 RPC 而不是每个条目一次。
	if args.PrevLogIndex > baseIndex {
		term := rf.log[args.PrevLogIndex].LogTerm
		if args.PrevLogTerm != term {
			for i := args.PrevLogIndex - 1; i >= baseIndex; i-- {
				if rf.log[i- baseIndex].LogTerm != term {
					reply.NextIndex = i + 1
					return
				}
			}
		}
	}

	// Failure case is at above
	reply.Success = true
	if args.Entries != nil {
		rf.log = rf.log[:args.PrevLogIndex+1]
		rf.log = append(rf.log, args.Entries...)
		reply.NextIndex = rf.getLastIndex() + 1
	}
	//If leaderCommit > commitIndex, set commitIndex =min(leaderCommit, index of last new entry)
	if args.LeaderCommit > rf.commitIndex {
		last := rf.getLastIndex()
		if args.LeaderCommit > last {
			rf.commitIndex = last
		} else {
			rf.commitIndex = args.LeaderCommit
		}
		rf.appendCh <- struct{}{}
	}
	reply.NextIndex = rf.getLastIndex() + 1
}

// 当节点选举成为leader之后，需要调用broadcastAppendEntries()用来广播发送心跳或者追加日志。
// 接收者实现：
// 如果 term < currentTerm 就返回 false （5.1 节）
// 如果日志在 prevLogIndex 位置处的日志条目的任期号和 prevLogTerm 不匹配，则返回 false （5.3 节）
// 如果已经存在的日志条目和新的产生冲突（索引值相同但是任期号不同），删除这一条和之后所有的 （5.3 节）
// 附加日志中尚未存在的任何新条目
// 如果 leaderCommit > commitIndex，令 commitIndex 等于 leaderCommit 和 新日志条目索引值中较小的一个
func (rf *Raft) broadcastAppendEntries() {
	if rf.state != LEADER {
		return
	}
	//If there exists an N such that N > commitIndex, a majority of matchIndex[i] ≥ N, and log[N].term == currentTerm: set commitIndex = N
	N := rf.commitIndex
	baseIndex := rf.log[0].LogIndex
	for i := rf.commitIndex + 1; i <= rf.getLastIndex(); i++ {
		num := 1
		for j := range rf.peers {
			if j != rf.me && rf.matchIndex[j] >= i && rf.log[i - baseIndex].LogTerm == rf.currentTerm {
				num++
			}
		}
		if 2 * num > len(rf.peers) {
			N = i
		}
	}
	if N != rf.commitIndex {
		rf.commitIndex = N
		rf.appendCh <- struct{}{}
	}
	for i := range rf.peers {
		if i == rf.me {
			continue
		}
		go func(server int){
			rf.mu.Lock()
			if rf.state != LEADER {
				rf.mu.Unlock()
				return
			}
			if rf.nextIndex[server] > rf.getLastIndex() {
				rf.nextIndex[server] = rf.getLastIndex() + 1
			}
			nextIndex := rf.nextIndex[server]
			entries := make([]LogEntry, 0)
			entries = append(entries, rf.log[nextIndex:]...)

			//DPrintf("----- entries:%v ", entries)

			args := AppendEntriesArgs{
				Term:         rf.currentTerm,
				LeaderID:     rf.me,
				PrevLogIndex: nextIndex-1,
				PrevLogTerm:  rf.log[nextIndex-1].LogTerm,
				Entries:      entries,
				LeaderCommit: rf.commitIndex,
			}
			rf.mu.Unlock()
			reply := &AppendEntriesReply{}
			ok := rf.sendAppendEntries(server, &args, reply)
			if !ok {
				//DPrintf("sendAppendEntries fail,request args Term:%d, LeaderId:%d ", args.Term, args.LeaderID)
				return
			}
			rf.mu.Lock()
			if rf.state != LEADER || rf.currentTerm != args.Term {
				rf.mu.Unlock()
				return
			}
			rf.mu.Unlock()
			if reply.Success {
				rf.mu.Lock()
				rf.nextIndex[server] += int(len(args.Entries))
				rf.matchIndex[server] = rf.nextIndex[server] - 1
				rf.mu.Unlock()
			}else {
				if rf.currentTerm < reply.Term {
					rf.mu.Lock()
					rf.currentTerm = reply.Term
					rf.state = FOLLOWER
					rf.votedFor = -1
					rf.mu.Unlock()
				}else {
					rf.nextIndex[server] = reply.NextIndex
				}
			}
		}(i)
	}
}

// Make create a new Raft server instance:
// peers : 所有网络节点的数组
// me : 自身在节点数组中的索引位置
func Make(peers []*labrpc.ClientEnd, me int,
	persister *Persister, applyCh chan ApplyMsg) *Raft {
	rf := &Raft{}
	rf.peers = peers
	rf.persister = persister
	rf.me = me

	rf.state = FOLLOWER
	rf.lastApplied = 0
	rf.votedFor = -1
	rf.log = append(rf.log, LogEntry{LogTerm: 0})
	rf.currentTerm = 0
	rf.nextIndex = make([]int,len(rf.peers))
	rf.matchIndex = make([]int,len(rf.peers))
	rf.heartCh = make(chan struct{}, 10)
	rf.voteCh = make(chan struct{}, 10)
	rf.appendCh = make(chan struct{}, 10)

	go func() {
		for {
			switch rf.state {
			case FOLLOWER:
				select {
				case <-rf.voteCh:
					//DPrintf("follower:%d get vote cancle ", rf.me)
				case <-rf.heartCh:
					//DPrintf("follower:%d get herat cancle ", rf.me)
				case <-time.After(time.Duration(rand.Intn(300)+500) * time.Millisecond):
					{
						//DPrintf("follower:%d vote timeout,term:%d ", rf.me, rf.currentTerm)
						rf.vote()
					}
				}
			case LEADER:
				rf.broadcastAppendEntries() // 心跳或追加日志
				time.Sleep(HEARTBEAT_INTERVAL)
			}
		}
	}()

	go func(){
		for {
			select {
			case <-rf.appendCh:
				rf.mu.Lock()
				commitIndex := rf.commitIndex
				baseIndex := rf.log[0].LogIndex
				for i := rf.lastApplied + 1; i <= commitIndex; i++ {
					msg := ApplyMsg{CommandIndex: i, Command: rf.log[i - baseIndex].LogCommand,CommandValid :true}
					applyCh <- msg
					//DPrintf("follower:%d appendCh index:%d,msg:%v ",rf.me, rf.commitIndex,msg)
					rf.lastApplied = i
				}
				rf.mu.Unlock()
			}
		}
	}()
	// initialize from state persisted before a crash
	rf.readPersist(persister.ReadRaftState())

	return rf
}
```

`执行测试代码`
```
go test -run 2B
Test (2B): basic agreement ...
  ... Passed --   0.9  5   32    3
Test (2B): agreement despite follower disconnection ...
^Csignal: interrupt
FAIL    _/Users/zhengxuzhang/6.824/src/raft     4.485s
zhengxuzhangde-MacBook-Pro:raft zhengxuzhang$ go test -run 2B
Test (2B): basic agreement ...
  ... Passed --   0.9  5   32    3
Test (2B): agreement despite follower disconnection ...
  ... Passed --   6.1  3  198    7
Test (2B): no agreement if too many followers disconnect ...
  ... Passed --   4.5  5  288    4
Test (2B): concurrent Start()s ...
  ... Passed --   1.0  3   24    6
Test (2B): rejoin of partitioned leader ...
  ... Passed --   4.7  3  262    4
Test (2B): leader backs up quickly over incorrect follower logs ...
  ... Passed --  15.8  5 2153  102
Test (2B): RPC counts aren't too high ...
  ... Passed --   2.7  3   86   12
PASS
ok      _/Users/zhengxuzhang/6.824/src/raft     35.714s
```

### Part 2C
&emsp;&emsp;实现Raft的持久状态，以便在服务器重启的情况下恢复服务。
```
func (rf *Raft) persist() {
	w := new(bytes.Buffer)
	e := gob.NewEncoder(w)
	e.Encode(rf.currentTerm)
	e.Encode(rf.votedFor)
	e.Encode(rf.log)
	data := w.Bytes()
	rf.persister.SaveRaftState(data)
}

//
// restore previously persisted state.
//
func (rf *Raft) readPersist(data []byte) {
	if data == nil || len(data) < 1 {
		return
	}
	r := bytes.NewBuffer(data)
	d := gob.NewDecoder(r)
	d.Decode(&rf.currentTerm)
	d.Decode(&rf.votedFor)
	d.Decode(&rf.log)
}


func (rf *Raft) Start(command interface{}) (int, int, bool) {
       ...
	if isLEADER {
		 ...
		rf.persist()
	}

	return index, term, isLEADER 
}

func (rf *Raft) broadcastAppendEntries() {
	defer rf.persist()
        ...
}

func (rf *Raft) vote() {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	defer rf.persist()
         ...
}

func (rf *Raft) RequestVote(args *RequestVoteArgs, reply *RequestVoteReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	defer rf.persist()
        ...
}

func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	defer rf.persist()
       ...
}
func Make(peers []*labrpc.ClientEnd, me int,
	persister *Persister, applyCh chan ApplyMsg) *Raft {
        rf := &Raft{}
	rf.peers = peers
	rf.persister = persister
	rf.me = me

	rf.state = FOLLOWER
	rf.lastApplied = 0
	rf.votedFor = -1
	rf.log = append(rf.log, LogEntry{LogTerm: 0})
	rf.currentTerm = 0
	rf.nextIndex = make([]int,len(rf.peers))
	rf.matchIndex = make([]int,len(rf.peers))
	rf.heartCh = make(chan struct{}, 10)
	rf.voteCh = make(chan struct{}, 10)
	rf.appendCh = make(chan struct{}, 10)
	// initialize from state persisted before a crash
	rf.readPersist(persister.ReadRaftState())
	for i := range rf.peers {
	  rf.nextIndex[i] = len(rf.log) // initialized to leader last log index + 1
	}
         ...
}
```

`执行测试代码`
```
go test -run 2C
Test (2C): basic persistence ...
  ... Passed --   4.7  3  430    6
Test (2C): more persistence ...
  ... Passed --  35.2  5 3690   18
Test (2C): partitioned leader and one follower crash, leader restarts ...
  ... Passed --   2.0  3   72    4
Test (2C): Figure 8 ...
  ... Passed --  107.5  5 176193   23
Test (2C): unreliable agreement ...
  ... Passed --   5.6  5  408  246
Test (2C): Figure 8 (unreliable) ...
  ... Passed --  13.8  5 1827   50
Test (2C): churn ...
  ... Passed --  16.2  5 1728  117
Test (2C): unreliable churn ...
  ... Passed --  17.0  5 1396  189
PASS
ok      _/Users/zhengxuzhang/6.824/src/raft     202.041s
```

