---
title: "Translation: Linux I/O Multiplexing - select vs. poll vs. epoll"
date: 2021-02-11 09:45:47  +0800
slug: "linux-io-multiplexing-select-poll-epoll"
categories: ["Network", "Translation"]
---


### Introduction
 Before reading this article, you can first understand the five I/O models of Liunx

 References: [I/O Models](http://www.masterraghu.com/subjects/np/introduction/unix_network_programming_v1.3/ch06lev1sec2.html) --Section 6.2 of "UNIX® Network Programming Volume 1, Third Edition: The Sockets Networking" by Richard Stevens

<blockquote class="blockquote-center">
The following is the text of the article <br/>
<!--                 Zheng Xie -->
<!-- Right aligned -->
</blockquote>

 One of the basic concepts of Linux (actually Unix) is that everything in Unix/Linux is a file. Each process has a file descriptor table that points to files, sockets, devices, and other operating system objects related to the process.

  Conventionally, systems involving IO resources will have an initialization phase, and then enter some kind of standby mode - waiting for any client to send a request and respond to it.

![_01_typic system.png](https://i.loli.net/2021/02/11/dGflJxjXE3wsOVW.png)

### IO Multiplexing
 The solution is to use the kernel mechanism to poll a set of file descriptors. In Linux you have 3 options:

*select(2)
* poll(2)
*epoll

﻿﻿The above 3 methods are all based on the same idea, create a set of file descriptors, tell the kernel what you want to do with each file descriptor (read, write,...), and use a thread to block a function call until at least one file descriptor requests the operation available.

### Select

#### Select system call
The select system call provides a mechanism to implement synchronous multiplexed I/O.
```
int select(int nfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds, struct timeval *timeout);
```
 Calls to select will block until the monitored file descriptor allows I/O operations, or the specified execution time has expired.

 The monitored file descriptors are divided into three groups:

    *   Monitor the file descriptors in `readfds` to determine whether data is available to read.

    *   Monitor the file descriptors in `writefds` to determine whether a write can complete without blocking.

    *   Monitor the file descriptors in `exceptionfds` for exceptions or available [out-of-band data](https://en.wikipedia.org/wiki/Out-of-band_data). These conditions apply only to sockets.

 The given collection can be passed NULL, in which case select will not monitor the events corresponding to the collection.

 After successful return, each collection will be modified so that it contains only file descriptors that are ready to perform I/O events of the corresponding type of collection.

&emsp;&emsp;Example:
```
#include <stdio.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <wait.h>
#include <signal.h>
#include <errno.h>
#include <sys/select.h>
#include <sys/time.h>
#include <unistd.h>

#define MAXBUF 256

void child_process(void)
{
  sleep(2);
  char msg[MAXBUF];
  struct sockaddr_in addr = {0};
  int n, sockfd,num=1;
  srandom(getpid());
  /* Create socket and connect to server */
  sockfd = socket(AF_INET, SOCK_STREAM, 0);
  addr.sin_family = AF_INET;
  addr.sin_port = htons(2000);
  addr.sin_addr.s_addr = inet_addr("127.0.0.1");

  connect(sockfd, (struct sockaddr*)&addr, sizeof(addr));

  printf("child {%d} connected \n", getpid());
  while(1){
        int sl = (random() % 10 ) +  1;
        num++;
         sleep(sl);
      sprintf (msg, "Test message %d from client %d", num, getpid());
      n = write(sockfd, msg, strlen(msg));    /* Send message */
  }

}

int main()
{
  char buffer[MAXBUF];
  int fds[5];
  struct sockaddr_in addr;
  struct sockaddr_in client;
  int addrlen, n,i,max=0;;
  int sockfd, commfd;
  fd_set rset;
  for(i=0;i<5;i++)
  {
      if(fork() == 0)
      {
          child_process();
          exit(0);
      }
  }

  sockfd = socket(AF_INET, SOCK_STREAM, 0);
  memset(&addr, 0, sizeof (addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(2000);
  addr.sin_addr.s_addr = INADDR_ANY;
  bind(sockfd,(struct sockaddr*)&addr ,sizeof(addr));
  listen (sockfd, 5);

  for (i=0;i<5;i++)
  {
    memset(&client, 0, sizeof (client));
    addrlen = sizeof(client);
    fds[i] = accept(sockfd,(struct sockaddr*)&client, &addrlen);
    if(fds[i] > max)
        max = fds[i];
  }

  while(1){
    FD_ZERO(&rset);
      for (i = 0; i< 5; i++ ) {
          FD_SET(fds[i],&rset);
      }

       puts("round again");
    select(max+1, &rset, NULL, NULL, NULL);

    for(i=0;i<5;i++) {
        if (FD_ISSET(fds[i], &rset)){
            memset(buffer,0,MAXBUF);
            read(fds[i], buffer, MAXBUF);
            puts(buffer);
        }
    }
  }
  return 0;
}
```
 We create 5 child processes, each process connects to the server and sends messages to the server. The server process uses accept() to create a different file descriptor for each client.

The first parameter of select should be the file descriptor with the highest number among the three sets, plus 1 so we can traverse to the fd with the highest number. (select needs to know the highest descriptor value so that it can iterate through the bits and know which bit to stop at.)

The main function while loop creates a set of file descriptors, calls the select function, and checks which file descriptor is ready for data to be read in the for loop. For simplicity, I didn't add exception checking.

 Each time it returns, select changes the collection to only contain file descriptors that are ready to read/write data, so we need to rebuild the collection every iteration.

 Because of the internal implementation of fd_set, we must tell what the maximum file descriptor number is. Each fd is represented by a bit,
fd_set is an array with int elements and a length of 32 (32 *32bit=1024bits, each bit represents a descriptor, which can represent 1024 file descriptors).

The select function checks any bit until it reaches the maximum value max+1, which means if we only listen to 5 file descriptors but the highest number of bits is 900, this function will check the file descriptors from 0 to 900. Under the POSIX standard, select can be replaced by pselect (a pointer to the signal mask is added)

#### SelectSummary

 Each collection needs to be created before each call

˜The function monitors from bit 0 to the highest bit N - O(n)

﻿﻿We need to iterate over the file descriptor to check if it exists in the set returned by select

 The main advantage of select is that it is highly portable - has the same implementation on every unix system

### Poll

#### Poll system call
 Different from select, because the file descriptor of select is based on a set of three bit masks and is inefficient, poll uses an array whose length is nfds and whose elements are pollfd structures. Prototype is simpler:

```
int poll (struct pollfd *fds, unsigned int nfds, int timeout);
```

The pollfd structure has different fields for events and return events, so we don’t need to build it every time:

```
struct pollfd {
      int fd;
      short events;
      short revents;
};
```

 For each file descriptor, construct an object of type pollfd and populate it with the expected events. After the poll function returns, check the revents field

﻿The above example uses poll instead:

```
  for (i=0;i<5;i++)
  {
    memset(&client, 0, sizeof (client));
    addrlen = sizeof(client);
    pollfds[i].fd = accept(sockfd,(struct sockaddr*)&client, &addrlen);
    pollfds[i].events = POLLIN;
  }
  sleep(1);
  while(1){
      puts("round again");
    poll(pollfds, 5, 50000);

    for(i=0;i<5;i++) {
        if (pollfds[i].revents & POLLIN){
            pollfds[i].revents = 0;
            memset(buffer,0,MAXBUF);
            read(pollfds[i].fd, buffer, MAXBUF);
            puts(buffer);
        }
    }
  }
```

﻿Like calling select, we need to check each pollfd object to see if its file descriptor is ready, but do not need to build the collection on each iteration


#### Poll vs Select

* poll does not require the user to calculate the value of the highest numbered file descriptor + 1

* poll is more efficient for large value file descriptors. Imagine observing a single file descriptor with value 900 via select — the kernel would have to check every bit of every incoming set, up to the 900th bit.

* The file descriptor set of select is statically sized (1024).

* With select, the file descriptor set will be rebuilt on return, so each subsequent call must reinitialize them. The poll system call separates input (event fields) from output (reserved fields), allowing pollfd arrays to be reused without changes.

* The timeout parameter of select is undefined on return. Portable code needs to reinitialize it. pselect does not have this problem

* Since some Unix systems do not support poll, select is more portable.

### Epoll

#### Epoll system call

 When using select or poll, we manage the user space ourselves and send the collection on each call and wait for the function to return. Each time a socket is added, we add it to the collection and then call select/poll again.

  The epoll system call helps us create and manage contexts in the kernel. We divide the task into 3 steps:

* Use epoll_create to create a context in the kernel
* Use epoll_ctl to add and remove file descriptors to/from the context
* Use epoll_wait to wait for events in the context

﻿The above example uses epoll instead:
```
  int epfd = epoll_create(10);
  ...
  ...
  for (i=0;i<5;i++)
  {
    static struct epoll_event ev;
    memset(&client, 0, sizeof (client));
    addrlen = sizeof(client);
    ev.data.fd = accept(sockfd,(struct sockaddr*)&client, &addrlen);
    ev.events = EPOLLIN;
    epoll_ctl(epfd, EPOLL_CTL_ADD, ev.data.fd, &ev);
  }

  while(1){
      puts("round again");
      nfds = epoll_wait(epfd, events, 5, 10000);

    for(i=0;i<nfds;i++) {
            memset(buffer,0,MAXBUF);
            read(events[i].data.fd, buffer, MAXBUF);
            puts(buffer);
    }
  }
```

 We first call epoll_create to create a context (the parameter is ignored, but must be a positive number). When the client connects, we call epoll_ctl to create an epoll_event object and add it to the context, and in the while loop we only wait in the context epfd.


#### Epoll vs Select/Poll

* We can add and remove file descriptors while waiting

* epoll_wait only returns objects with ready file descriptors

* epoll has better performance - O(1) instead of O(n)

* epoll can behave as level trigger or edge trigger (EPOLLLT and EPOLLET two trigger modes) (see man page)

* epoll is Linux specific and therefore not portable

 Slides about Liunx IO in my meetup[here](https://www.slideshare.net/liranbh/linux-io-72197884)

 You can view all codes [here](https://www.slideshare.net/liranbh/linux-io-72197884)

<blockquote class="blockquote-center">
End of article text <br/>
<!--                 Zheng Xie -->
<!-- Right aligned -->
</blockquote>

### Personal understanding

1. Select, poll, and epoll are all synchronization models (the process of copying data from the kernel to the user state is blocked);

2. Each time select/poll returns, it must perform rotation training to check whether the monitored file descriptor has the expected IO operation, and the time complexity is O(N); epoll does not need rotation training and directly returns the file descriptor structure with the expected IO operation, and the time complexity is O(1);

3. There is a limit on the file descriptors monitored by select (usually 1024), but there is no limit on poll and epoll (the maximum value is 65535);

4. Each time select returns, it only returns the expected fd, so fd_set needs to be re-created every time. Poll separates the pollfd structure events and revents, so there is no need to create it every time;

5. epoll has two modes: ET and LT, while select/poll only has LT mode.

### Further reading

 [Detailed explanation of I/O reuse and epoll under Linux](https://www.cnblogs.com/lojunren/p/3856290.html)

 [Learn to use epoll thoroughly (1)—Analysis of ET mode implementation](http://blog.chinaunix.net/uid-28541347-id-4273856.html)

 [Comprehensive disclosure of the source code of Go netpoller’s native network model](https://strikefreedom.top/go-netpoll-io-multiplexing-reactor)
