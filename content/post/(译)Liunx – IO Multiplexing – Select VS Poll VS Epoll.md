---
title: （译）Liunx – IO Multiplexing – Select VS Poll VS Epoll
categories: [network,翻译]
date: 2021-02-11 09:45:47  +0800 
---

### 导读
&emsp;&emsp;读这篇文章前可以先了解下Liunx5种I/O模型

&emsp;&emsp;参考文献: [I/O Models](http://www.masterraghu.com/subjects/np/introduction/unix_network_programming_v1.3/ch06lev1sec2.html)  --Richard Stevens的《UNIX® Network Programming Volume 1, Third Edition: The Sockets Networking》6.2节

<blockquote class="blockquote-center">
以下为文章正文 <br/>
<!--&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;——郑燮-->
<!-- 右对齐 -->
</blockquote>

&emsp;&emsp;Linux(实际上是Unix)的一个基本概念是Unix/Linux中的所有内容都是文件。每个进程都有一个文件描述符表，该表指向进程有关的文件，套接字，设备和其他操作系统对象。

&emsp;&emsp;惯例上涉及IO资源相关的系统都会有一个初始化阶段,然后加入某种待机模式--等待任一客户端发送请求并对其进行响应。

![_01_typic system.png](https://i.loli.net/2021/02/11/dGflJxjXE3wsOVW.png)

### IO Multiplexing
&emsp;&emsp;解决方法是使用内核机制来轮训一组文件描述符,在Liunx中你可以有3种选择:

*   select(2)
*   poll(2)
*   epoll
  
&emsp;&emsp;上面3种方法都基于同一种思想,创建一组文件描述符,告知内核你想对每个文件描述符做什么(读,写,...),并用一个线程阻塞一个函数调用直到至少有一个文件描述符请求的操作可用。

### Select

#### Select系统调用
&emsp;&emsp;select系统调用提供一种实现同步多路复用I/O的机制。
```
int select(int nfds, fd_set *readfds, fd_set *writefds, fd_set *exceptfds, struct timeval *timeout);
```
&emsp;&emsp;对select的调用将一直阻塞,直到监视的文件描述符允许执行I/O操作,或指定的执行时间已超时。

&emsp;&emsp;监视的文件描述符分为三组:

    *   监视readfds集合中列出的文件描述符,以查看是否有数据可读取。
  
    *   监视writefds集合中列出的文件描述符,以查看写操作是否将完成而不会阻塞。
  
    *   监视exceptionfds集合中的文件描述符以查看是否发生了异常，或者是否有[带外数据(Out-of-band data)](https://en.wikipedia.org/wiki/Out-of-band_data)可用（这些状态仅适用于sockets）。

&emsp;&emsp;给定的集合可以传NULL,这种情况下select不会监视集合对应的事件。

&emsp;&emsp;成功返回后,将修改每个集合,使其仅包含准备好执行集合对应类型的I/O事件的文件描述符。 

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
  	n = write(sockfd, msg, strlen(msg));	/* Send message */
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
&emsp;&emsp;我们创建5个子进程,每个进程都连接到服务器并发送消息到服务器。服务器进程使用accept()为每个客户端创建一个不同的文件描述符。

&emsp;&emsp;select的第一个参数应该是三组集合中编号最高的文件描述符,加1所以我们可以遍历到编号最大的fd。(select需要知道最高的描述符值，以便它可以遍历这些位并知道在哪一位停止。)

&emsp;&emsp;main函数while循环创建一组文件描述符,调用select函数,在for循环中检查哪个文件描述符已经准备好数据可以读取。为简单起见,我没有添加异常检查。

&emsp;&emsp;每次返回时,select将集合更改为仅包含已准备好读取/写入数据的文件描述符,因此我们每次迭代都需要重新构建集合。

&emsp;&emsp;因为fd_set的内部实现,我们必须告诉最大的文件描述符编号是多少。每个fd用一个bit表示,
fd_set是一个元素为int,长度为32的数组(32 *32bit=1024bits,每一位代表了一个描述符,可表示1024个文件描述符）。

&emsp;&emsp;select函数检查任一位直到到达最大值max+1,这意味着如果我们只监听5个文件描述符但最高位数是900,这个函数将会检查从0到900之间的文件描述符。在posix标准下可以将select替换成pselect(增加了一个指向信号掩码的指)

#### Select总结

&emsp;&emsp;每次调用前需要创建每个集合

&emsp;&emsp;函数监听从0位到最高位N - O(n)

&emsp;&emsp;我们需要遍历文件描述符以检查它是否存在于select返回的集合中

&emsp;&emsp;select的主要优点是它具有很高的可移植性-具有一样的实现在每个unix系统

### Poll

#### Poll系统调用
&emsp;&emsp;与select不同，因为select的文件描述符基于三个位掩码的集合效率低下,poll使用一个数组长度为nfds,元素为pollfd结构体的数组。原型更简单:

```
int poll (struct pollfd *fds, unsigned int nfds, int timeout);
```

&emsp;&emsp;pollfd结构的事件和返回事件具有不同的字段，因此我们不需要每次都构建它:

```
struct pollfd {
      int fd;
      short events; 
      short revents;
};
```

&emsp;&emsp;对于每个文件描述符,构建一个pollfd类型对象,并填充所期待的事件。在poll函数返回后,检查revents字段

&emsp;&emsp;上面例子改用poll:

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

&emsp;&emsp;像调用select一样，我们需要检查每个pollfd对象以查看其文件描述符是否准备就绪,但不需在每次迭代时都构建集合


#### Poll vs Select

* poll不需要用户计算编号最大的文件描述符的值+1

* poll对于大值文件描述符更有效。想象一下，通过select观察值为900的单个文件描述符—内核将必须检查每个传入集合的每个位，直到第900位。
  
* select的文件描述符集是静态大小的(1024)。
  
* 使用select,文件描述符集将在返回时重建，因此每个后续调用都必须重新初始化它们。poll系统调用将输入（事件字段）与输出（保留字段）分开，从而使pollfd数组可以重复使用而无需更改。
  
* select的超时参数在返回时未定义。可移植代码需要重新初始化它。pselect不存在这个问题
  
* 由于某些Unix系统不支持poll,因此select具有更高的可移植性。

### Epoll

#### Epoll系统调用

&emsp;&emsp;当使用select或poll时,我们自己管理用户空间,并在每次调用时发送集合并等待函数返回。每添加一个socket,我们都要将它加到集合中,然后再次调用select/poll。

&emsp;&emsp;epoll系统调用可帮助我们在内核中创建和管理上下文。我们将任务分为3个步骤:
*   使用epoll_create在内核中创建上下文
*   使用epoll_ctl向/从上下文中添加和删除文件描述符
*   使用epoll_wait等待上下文中的事件
  
&emsp;&emsp;上面例子改用epoll:
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

&emsp;&emsp;我们首先调用epoll_create创建一个上下文（参数忽略,但必须为正数）。当客户端连接时,我们调用epoll_ctl创建一个epoll_event对象并将其添加到上下文中,并且在while循环中，我们仅在上下文epfd中等待。


#### Epoll vs Select/Poll

*   我们可以在等待时添加和删除文件描述符
  
*   epoll_wait仅返回具有就绪文件描述符的对象
  
*   epoll具有更好的性能-O(1)代替O(n)
  
*   epoll可以表现为水平触发或边沿触发（请参见手册页）
  
*   epoll是特定于Linux的，因此不可移植

&emsp;&emsp;我meetup中有关Liunx IO的幻灯片[here](https://www.slideshare.net/liranbh/linux-io-72197884)

&emsp;&emsp;你可以查看所有代码[here](https://www.slideshare.net/liranbh/linux-io-72197884)