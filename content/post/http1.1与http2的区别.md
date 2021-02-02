---
title: http1.1与http2的区别
categories: [network]
date: 2020-01-16 10:25:00 +0800
---

# HTTP 1.1

&emsp;&emsp;1997 年 1 月，HTTP/1.1 版本发布，只比 1.0 版本晚了半年。它进一步完善了 HTTP 协议，一直用到了 20 年后的今天，直到现在还是最流行的版本。主要优化点:

* 默认支持长连接

&emsp;&emsp;HTTP 1.1 支持`长连接（PersistentConnection）`和请求的`流水线（Pipelining）`处理。HTTP1.1持久连接可以重用已建立的TCP连接，减少三次握手的RTT延迟。浏览器在请求时带上`connection: keep-alive`的头部，服务器收到后就要发送完响应后保持连接一段时间，浏览器在下一次对该服务器的请求时，就可以直接拿来用。

![长短连接.png](https://i.loli.net/2020/01/16/eRHhIT2qWFPnQfC.png)

![管线化.png](https://i.loli.net/2020/01/16/CyAdLxbFT13zwc9.png)

&emsp;&emsp;HTTP管线化可以克服同域并行请求限制带来的阻塞，它是建立在持久连接之上，是把所有请求一并发给服务器，但是服务器需要按照顺序一个一个响应，而不是等到一个响应回来才能发下一个请求，这样就节省了很多请求到服务器的时间。不过，HTTP管线化仍旧有阻塞的问题，若上一响应迟迟不回，后面的响应都会被阻塞到。

* 带宽优化

&emsp;&emsp;HTTP 1.1支持只发送header信息(不带任何body信息)，如果服务器认为客户端有权限请求服务器，则返回`100`，否则返回`401`。客户端如果接受到`100`，才开始把请求body发送到服务器。这样当服务器返回`401`的时候，客户端就可以不用发送请求body了，节约了带宽。

&emsp;&emsp;另外HTTP还支持支持``断点续传``功能。HTTP1.1 则在请求头引入了`range` 头域，它允许只请求资源的某个部分，即返回码是`206（Partial Content）`，这样就方便了开发者自由的选择以便于充分利用带宽和连接。

* Host 头处理

&emsp;&emsp;在 HTTP1.0 中认为每台服务器都绑定一个唯一的 IP 地址，因此，请求消息中的 URL 并没有传递主机名（hostname）。但随着虚拟主机技术的发展，在一台物理服务器上可以存在多个虚拟主机（Multi-homed Web Servers），并且它们共享一个 IP 地址。HTTP1.1 的请求消息和响应消息都应支持 Host 头域，且请求消息中如果没有 Host 头域会报告一个错误（400 Bad Request）。

# HTTP 2

## 1.1 二进制分帧

&emsp;&emsp;HTTP/1.x是一个文本协议，这注定它是非常冗余的协议，HTTP/2改变了这一点，在HTTP/1.x的语义上，将文本数据封装在帧里，并采用二进制编码。
&emsp;&emsp;下图中binary framing就是二进制分帧层，这里会将HTTP/1.x的header翻译成headers类型的帧，将body翻译成data类型的帧。

![二进制分帧.png](https://i.loli.net/2020/01/16/UPQdJKgnf1EwXOL.png)

## 1.2 多路复用 (Multiplexing)

在HTTP/2中，有两个非常重要的概念：帧（frame）和流（stream）。

### 1.2.1、帧（frame）

&emsp;&emsp;HTTP/2中数据传输的最小单位，因此帧不仅要细分表达HTTP/1.x中的各个部份，也优化了HTTP/1.x表达得不好的地方，同时还增加了HTTP/1.x表达不了的方式。
&emsp;&emsp;每一帧都包含几个字段，有length、type、flags、stream identifier、frame playload等，其中type代表帧的类型，在HTTP/2的标准中定义了10种不同的类型，包括:
* HEADERS (头部,相当于HEAD)
* DATA (数据,相当于BODY)
* PRIORITY（设置流的优先级）
* RST_STREAM（终止流）
* SETTINGS（设置此连接的参数）
* PUSH_PROMISE（服务器推送）
* PING（测量RTT）
* GOAWAY（终止连接）
* WINDOW_UPDATE（流量控制）
* CONTINUATION（继续传输头部数据）

### 1.2.2、流（stream）

&emsp;&emsp;“流”在HTTP/2中是一个逻辑上的概念，就是说在一个TCP连接上，我们可以向对方不断发送一个个的消息，这里每一个消息看成是一帧，而每一帧有个`stream identifier`的字段标明这一帧属于哪个“流”，然后在对方接收时，根据`stream identifier`拼接每个“流”的所有帧组成一整块数据。我们把HTTP/1.1每个请求都当作一个“流”，那么请求化成多个流，请求响应数据切成多个帧，不同流中的帧交错地发送给对方，这就是HTTP/2中的多路复用。

![多路复用.png](https://i.loli.net/2020/01/16/4KdxEB79ptghXoe.png)

&emsp;&emsp;从上图我们可以留意到：
* 不同的流在交错发送；
* HEADERS 帧在 DATA 帧前面；
* 流的ID都是奇数，说明是由客户端发起的，这是标准规定的，那么服务端发起的就是偶数了。

&emsp;&emsp;HTTP性能优化的`关键并不在于高带宽，而在于低延迟`。TCP连接会随着时间进行自我[调谐]，起初会限制连接的最大速度，如数据成功传输，会随着时间的推移提高传输的速度，这就是TCP的`慢启动`。由于这种原因，让原本就具有突发性和短时性的HTTP连接变得十分低效。
&emsp;&emsp;HTTP2通过多路复用让多个流共用同一个连接,可以更有效的使用TCP连接，让高带宽也能真正的服务于HTTP的性能提交。

## 1.3 请求优先级

&emsp;&emsp;把 HTTP 消息分解为很多独立的帧之后，就可以通过优化这些帧的交错和传输顺序，每个流都可以带有一个 31 比特的优先值：0 表示最高优先级；2 的 31 次方-1 表示最低优先级。
&emsp;&emsp;服务器可以根据流的优先级，控制资源分配（CPU、内存、带宽），而在响应数据准备好之后，优先将最高优先级的帧发送给客户端。
&emsp;&emsp;HTTP 2.0 一举解决了所有这些低效的问题：浏览器可以在发现资源时立即分派请求，指定每个流的优先级，让服务器决定最优的响应次序。这样请求就不必排队了，既节省了时间，也最大限度地利用了每个连接。

## 1.4 header 压缩

&emsp;&emsp;在HTTP/1.x中首部是没有压缩的，gzip只会压缩body，HTTP/2提供了首部压缩方案。一般轮询请求首部，特别是cookie占用很多大部份空间，首部压缩使得整个HTTP数据包小了很多，传输也就会更快。SPDY使用的DEFLATE算法，HTTP2则使用了专门为压缩而设计的HPACK算法。有关SPDY的来源与细节，详见:[https://jiaolonghuang.github.io/2015/08/17/http2&spdy/]

![首部压缩.jpg](https://i.loli.net/2020/01/16/wCVGZRTdrXJ4ANv.jpg)

## 1.5 服务端推送

&emsp;&emsp;Server Push 即服务端能通过 push 的方式将客户端需要的内容预先推送过去，也叫“cache push”。
服务器可以对一个客户端请求发送多个响应。服务器向客户端推送资源无需客户端明确地请求，服务端可以提前给客户端推送必要的资源，这样可以减少请求延迟时间，例如服务端可以主动把 JS 和 CSS 文件推送给客户端，而不是等到 HTML 解析到资源时发送请求，大致过程如下图所示：

![服务器推送.png](https://i.loli.net/2020/01/16/agm35vZYPS4nJF1.png)

# 参考资料：
[HTTP1.1与HTTP2性能比较](https://http2.akamai.com/demo)
[HTTP/2 相比 1.0 有哪些重大改进?](https://www.zhihu.com/question/34074946)
[HTTP1.0 HTTP 1.1 HTTP 2.0主要区别](https://blog.csdn.net/linsongbin1/article/details/54980801)
[Web性能优化与HTTP/2](https://www.kancloud.cn/digest/web-performance-http2)
