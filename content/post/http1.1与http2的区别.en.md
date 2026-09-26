---
title: "HTTP/1.1 vs. HTTP/2"
date: 2020-01-16 10:25:00 +0800
slug: "http-1-1-vs-http-2"
categories: ["Network"]
---


# HTTP 1.1

In January 1997, HTTP/1.1 version was released, only half a year later than version 1.0. It further improved the HTTP protocol and has been used to this day 20 years later, and is still the most popular version. Main optimization points:

* Support long connection by default

HTTP/1.1 supports `persistent connections` and request `pipelining`. Persistent connections reuse established TCP connections and avoid repeating the RTT cost of the three-way handshake. A browser sends the `Connection: keep-alive` header, and the server keeps the connection open after responding so that later requests can reuse it.

![Long and short connections.png](https://i.loli.net/2020/01/16/eRHhIT2qWFPnQfC.png)

![Pipeline.png](https://i.loli.net/2020/01/16/CyAdLxbFT13zwc9.png)

HTTP pipeline can overcome the blocking caused by the limit of parallel requests in the same domain. It is built on persistent connections and sends all requests to the server at the same time. However, the server needs to respond one by one in order, rather than waiting for a response to come back before sending the next request. This saves a lot of time for requests to the server. However, HTTP pipeline still has the problem of blocking. If the previous response is delayed, subsequent responses will be blocked.

* Bandwidth optimization

HTTP 1.1 supports sending only header information (without any body information). If the server believes that the client has the authority to request the server, it will return `100`, otherwise it will return `401`. If the client receives `100`, it will start sending the request body to the server. In this way, when the server returns `401`, the client does not need to send the request body, saving bandwidth.

﻿HTTP/1.1 also supports resuming interrupted downloads through the `Range` request header. A client can request only part of a resource, and the server responds with `206 Partial Content`, allowing applications to use bandwidth and connections more efficiently.

* Host header processing

 In HTTP 1.0, each server is considered to be bound to a unique IP address. Therefore, the URL in the request message does not pass the hostname (hostname). However, with the development of virtual host technology, multiple virtual hosts (Multi-homed Web Servers) can exist on a physical server, and they share an IP address. HTTP1.1 request messages and response messages should support the Host header field, and if there is no Host header field in the request message, an error (400 Bad Request) will be reported.

# HTTP 2

## 1.1 Binary Framing

HTTP/1.x is a text protocol, which is destined to be a very redundant protocol. HTTP/2 changes this. Based on the semantics of HTTP/1.x, text data is encapsulated in frames and binary encoding is used.
﻿﻿In the figure below, binary framing is the binary framing layer. Here, HTTP/1.x headers are translated into headers type frames, and the body is translated into data type frames.

![Binary Framing.png](https://i.loli.net/2020/01/16/UPQdJKgnf1EwXOL.png)

## 1.2 Multiplexing

In HTTP/2, there are two very important concepts: frame and stream.

### 1.2.1. Frame

  The smallest unit of data transmission in HTTP/2, so the frame must not only subdivide and express each part of HTTP/1.
﻿Each frame contains several fields, including length, type, flags, stream identifier, frame payload, etc., where type represents the type of frame. There are 10 different types defined in the HTTP/2 standard, including:
* HEADERS (head, equivalent to HEAD)
* DATA (data, equivalent to BODY)
* PRIORITY (set the priority of the stream)
* RST_STREAM (terminate stream)
* SETTINGS (set the parameters of this connection)
* PUSH_PROMISE (server push)
* PING (measure RTT)
* GOAWAY (terminate connection)
* WINDOW_UPDATE (flow control)
* CONTINUATION (continue to transmit header data)

### 1.2.2. Stream

"Stream" is a logical concept in HTTP/2, which means that on a TCP connection, we can continuously send messages to the other party. Each message here is regarded as a frame, and each frame has a `stream identifier` field to indicate which "stream" this frame belongs to. Then when the other party receives it, all the frames of each "stream" are spliced ​​according to `stream identifier` to form a whole block of data. We treat each HTTP/1.1 request as a "stream", then the request is turned into multiple streams, the request response data is cut into multiple frames, and the frames in different streams are sent to the other party in an interleaved manner. This is the multiplexing in HTTP/2.

![Multiplex.png](https://i.loli.net/2020/01/16/4KdxEB79ptghXoe.png)

 From the picture above we can notice:
* Different streams are sent in staggered manner;
* The HEADERS frame precedes the DATA frame;
* The IDs of streams are all odd numbers, indicating that they are initiated by the client. This is stipulated by the standard, then the ones initiated by the server are even numbers.

 For HTTP performance, `low latency matters more than high bandwidth`. A TCP connection tunes itself over time: it begins with a limited transmission rate and increases it after successful delivery. This is TCP `slow start`. As a result, bursty, short-lived HTTP connections are inefficient.
HTTP2 allows multiple streams to share the same connection through multiplexing, which can use TCP connections more effectively, so that high bandwidth can truly serve the performance of HTTP.

## 1.3 Request priority

 After decomposing HTTP messages into many independent frames, each stream can be assigned a 31-bit priority value by optimizing the interleaving and transmission order of these frames: 0 represents the highest priority; 2 to the power of 31 -1 represents the lowest priority.
  The server can control resource allocation (CPU, memory, bandwidth) according to the priority of the flow, and after the response data is ready, the highest priority frame will be sent to the client first.
HTTP 2.0 solves all these inefficiencies in one fell swoop: the browser can dispatch requests as soon as a resource is discovered, specify the priority of each stream, and let the server determine the optimal response order. This way requests don't have to be queued, which saves time and maximizes the use of each connection.

## 1.4 header compression

 In HTTP/1.x, the header is not compressed, gzip only compresses the body, and HTTP/2 provides a header compression solution. Generally, polling request headers, especially cookies, occupy a lot of space. Header compression makes the entire HTTP data packet much smaller and the transmission will be faster. SPDY uses the DEFLATE algorithm, and HTTP2 uses the HPACK algorithm specifically designed for compression. For the source and details of SPDY, please see: [https://jiaolonghuang.github.io/2015/08/17/http2&spdy/]

![First part compressed.jpg](https://i.loli.net/2020/01/16/wCVGZRTdrXJ4ANv.jpg)

## 1.5 Server push

 Server Push means that the server can push the content required by the client in advance through push, also called "cache push".
The server can send multiple responses to a client request. The server pushes resources to the client without the client explicitly requesting them. The server can push the necessary resources to the client in advance, which can reduce the request delay time. For example, the server can actively push JS and CSS files to the client instead of waiting until the HTML parses the resources to send the request. The general process is shown in the figure below:

![Server push.png](https://i.loli.net/2020/01/16/agm35vZYPS4nJF1.png)

# References:
[Performance comparison between HTTP1.1 and HTTP2](https://http2.akamai.com/demo)
[What are the major improvements of HTTP/2 compared to 1.0?](https://www.zhihu.com/question/34074946)
[Main differences between HTTP1.0 HTTP 1.1 HTTP 2.0](https://blog.csdn.net/linsongbin1/article/details/54980801)
[Web Performance Optimization and HTTP/2](https://www.kancloud.cn/digest/web-performance-http2)
