---
title: "Implementing the Raft Protocol in Go (1)"
date: 2019-12-22 17:13:00 +0800
slug: "implementing-raft-in-go-1"
categories: ["Go"]
---

### Introduction
 The implementation idea comes from: [MIT 6.824 course Lab 2: Raft](https://pdos.csail.mit.edu/6.824/labs/lab-raft.html)

 Before doing the experiment, you should read the raft paper carefully, here it is:
[raft paper](https://pdos.csail.mit.edu/6.824/papers/raft-extended.pdf)
[raft translation](https://github.com/maemual/raft-zh_cn/blob/master/raft-zh_cn.md)

Recommended reading:
[Students' Guide to Raft](https://thesquareplanet.com/blog/students-guide-to-raft/) [Raft Understandable Distributed Consensus](http://thesecretlivesofdata.com/raft/)


### lab content
 In this lab, you will implement most of the Raft design described in [Extended Paper](https://pdos.csail.mit.edu/6.824/papers/raft-extended.pdf), including saving persistent state and reading it after a node fails and then restarts. You will not implement cluster membership changes (Section 6) or log compression/snapshots (Section 7).


### Part 2A
﻿ Implement leader election and heartbeat functionality (AppendEntries RPC requests without log entries)
```
const (
    LEADER = iota + 1
    CANDIDATE
    FOLLOWER
)

const (
    RPC_CALL_TIMEOUT = 1 * time.Second         // 1s
    HEARTBEAT_INTERVAL = 50 * time.Millisecond // 50ms, limit per second
)

//LogEntry log entry
type LogEntry struct {
    LogIndex int // Index value of log entry
    LogTerm int //Term number of log entry
    LogCommand interface{} // Execution instructions for log entries
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

    state int // state

    // Persistent on all servers
    currentTerm int64 //The last term number known to the server (initialized to 0, continuously increasing)
    votedFor int64 //The Id of the candidate currently receiving votes
    log []LogEntry // Set of log entries; each entry contains an instruction executed by the user state machine, and the term number when received

    // Frequently changed on all servers
    commitIndex int64 //The index value of the largest known log entry that has been committed
    lastApplied int64 //The index value of the log entry last applied to the state machine (initialized to 0, continuously increasing)

    // frequently changed in leaders (reinitialized after election)
    nextIndex []int64 // For each server, the index value of the next log entry that needs to be sent to him (initialized to the last index value of the leader plus one)
    matchIndex []int64 // For each server, the highest index value of the log that has been copied to him

    // timer
    eTimer *time.Timer // Election timeout timer
    voteCh chan struct{} // Signal of successful voting
    heartCh chan struct{} // Heartbeat signal
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


// Request a vote RPC
type RequestVoteArgs struct {
    // Your data here (2A, 2B).
    Term int64 // Candidate’s term number
    CandidateID int64 // ID of candidate requesting votes
    LastLogIndex int64 // Index value of the candidate’s last log entry
    LastLogTerm int64 // The term number of the candidate’s last log entry
}

//
// example RequestVote RPC reply structure.
// field names must start with capital letters!
//
//Request voting RPC return value
type RequestVoteReply struct {
    // Your data here (2A).
    Term int64 //The current term number, so that candidates can update their term number
    VoteGranted bool // true if the candidate wins this vote
}

//AppendEntriesArgs append log RPC
// Called by the leader to copy log instructions; also used as heartbeat
type AppendEntriesArgs struct {
    Term int64 //The leader’s term number
    LEADERID int64 // The ID of the leader to facilitate follower redirect requests
    PrevLogIndex int64 // The new log entry follows the previous index value
    PrevLogTerm int64 // The term number of the prevLogIndex entry
    Entries []LogEntry // Prepare log entries for storage (null when indicating heartbeat; sending multiple at one time is to improve efficiency)
    LEADERCommit int64 //The index value of the log that the leader has submitted
}

//AppendEntriesReply append log RPC return value
type AppendEntriesReply struct {
    Term int64 //The current term number, used by leaders to update themselves
    Success bool // True when the follower contains logs matching prevLogIndex and prevLogTerm
}
//
// example RequestVote RPC handler.
// RequestVote handles request voting RPC
// Receiver implementation:
// If term < currentTerm return false (Section 5.2 of the paper)
// If votedFor is empty or CANDIDATEId, and the candidate's log is at least as new as your own, then vote for him (Section 5.2, Section 5.4 of the paper)
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
        // The vote is successful, reset the election timer
        rf.voteCh <- struct{}{}
    }
}


//AppendEntries append log RPC:
// Called by the leader to copy log instructions; also used as heartbeat
// Receiver implementation:
// Return false if term < currentTerm (section 5.1)
// If the term number of the log entry at prevLogIndex does not match prevLogTerm, return false (Section 5.3)
// If an existing log entry conflicts with a new one (same index value but different term number), delete this entry and all subsequent ones (section 5.3)
//Append any new entries that don't already exist in the log
// If LEADERCommit > commitIndex, let commitIndex equal the smaller of LEADERCommit and the index of the new log entry
func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {
    rf.mu.Lock()
    defer rf.mu.Unlock()
    reply.Success = false

    if args.Term < rf.currentTerm {
        reply.Term = rf.currentTerm
        return
    }
    //Reset election timer
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


// election process
// 1. When the follower does not receive the leader's heartbeat before the election timeout expires, the election process starts immediately after converting to a candidate:
//increment the current term number (currentTerm)
// Vote for yourself
//Reset the election timeout timer
// Send RPC requesting votes to all other servers
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
        //The number of votes is less than the majority and becomes a follower
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
    //     <-ch
    // }
}


// Make create a new Raft server instance:
// peers: array of all network nodes
// me: its own index position in the node array
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
                rf.heartbeat() //Heartbeat mechanism
                time.Sleep(HEARTBEAT_INTERVAL)
            }
        }
    }()
    // initialize from state persisted before a crash
    rf.readPersist(persister.ReadRaftState())

    return rf
}

// randElectionDuration randomly selects the timeout from a fixed interval (e.g. 150-300 milliseconds)
func randElectionDuration(rd *rand.Rand) time.Duration {
    //var electimemax, electimemin int64
    //electimemax = 300
    //electimemin = 150
    //return time.Millisecond * time.Duration(rd.Int63n(electimemax-electimemin)+electimemin)
    return  time.Duration(rand.Intn(300)+500) * time.Millisecond
}
```


`Run the test code`
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
 The implementation calls Start() to begin the process of adding new operations to the log; the leader sends new operations to other servers in AppendEntries RPCs.
```
// start agreement on a new log entry:
// start starts the process of appending the command to the log and must return immediately without waiting for the log append to be completed.
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

//AppendEntries append log RPC:
// Called by the leader to copy log instructions; also used as heartbeat
// Receiver implementation:
// Return false if term < currentTerm (section 5.1)
// If the term number of the log entry at prevLogIndex does not match prevLogTerm, return false (Section 5.3)
// If an existing log entry conflicts with a new one (same index value but different term number), delete this entry and all subsequent ones (section 5.3)
//Append any new entries that don't already exist in the log
// If LEADERCommit > commitIndex, let commitIndex equal the smaller of LEADERCommit and the index of the new log entry
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
    //Reset election timer
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


    // If a follower's log is inconsistent with the leader's, then the consistency check will fail during the next append log RPC.
    // After being rejected by a follower, the leader decrements the nextIndex value and tries again.
    // Eventually nextIndex will make the leader and follower logs agree at a certain position.
    // When this happens, the append log RPC will succeed, and all the follower conflicting log entries will be deleted and the leader's log will be added.
    // Once the append log RPC is successful, the follower's log will be consistent with the leader's and will continue to be maintained for subsequent terms.
    // If necessary, the algorithm can be optimized by reducing the number of appended log RPCs that are rejected.
    // For example, when an append log RPC request is denied, the follower can include the term number of the conflicting entry and the earliest index address of that term that it stores.
    // With this information, the leader can decrement nextIndex past all log entries that conflict for that term;
    // This results in an additional entry RPC being required once per term rather than once per entry.
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

// After the node is elected to become the leader, broadcastAppendEntries() needs to be called to broadcast heartbeats or append logs.
// Receiver implementation:
// Return false if term < currentTerm (section 5.1)
// If the term number of the log entry at prevLogIndex does not match prevLogTerm, return false (Section 5.3)
// If an existing log entry conflicts with a new one (same index value but different term number), delete this entry and all subsequent ones (section 5.3)
//Append any new entries that don't already exist in the log
// If leaderCommit > commitIndex, let commitIndex equal the smaller of leaderCommit and the index value of the new log entry
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
// peers: array of all network nodes
// me: its own index position in the node array
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
                rf.broadcastAppendEntries() //Heartbeat or append log
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

`Run the test code`
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
 Implement Raft’s persistent state so that services can be restored in the event of a server restart.
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

`Run the test code`
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
