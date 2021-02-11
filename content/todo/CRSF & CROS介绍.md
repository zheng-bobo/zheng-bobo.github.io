---
title: CRSF & CORS介绍
categories: [network]
date: 2021-02-04 17:32:47  +0800 
---

### 导读

&emsp;&emsp;介绍`CRSF(Cross-site request forgery)`&`CORS(Cross-origin resource sharing)`之前，我们先介绍下HTTP,若读者对HTTP较熟悉，可以直接跳过此内容。


#### HTTP请求
&emsp;&emsp;一个HTTP请求包括：请求行(request line)、请求头(header)、空行 和 请求体 四个部分组成。

```
GET /mix/76.html?name=kelvin&password=123456 HTTP/1.1
Host: www.fishbay.cn
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
Accept-Encoding: gzip, deflate, sdch
Accept-Language: zh-CN,zh;q=0.8,en;q=0.6
```

* 请求行:`GET`为请求类型，`/mix/76.html?name=kelvin&password=123456`为要访问的资源，`HTTP/1.1`是协议版本
* 请求头:`Host`指出请求的目的地（主机域名）;`User-Agent`是客户端的信息，它是检测浏览器类型的重要信息，由浏览器定义，并且在每个请求中自动发送。`Accept-Encoding`能够支持的内容编码及内容编码的优先级顺序。`Accept-Language`能够接受处理的自然语言集（指中文或者英文等）
* 请求体:可以添加任意的其它数据。(GET方法没有请求体)

##### HTTP 请求方法:

* GET 请求指定的页面信息，并返回实体主体。
* HEAD 类似于 GET 请求，只不过返回的响应中没有具体的内容，用于获取报头
* POST 向指定资源提交数据进行处理请求（例如提交表单或者上传文件）。数据被包含在请求体中。POST 请求可能会导致新的资源的建立和/或已有资源的修改。
* PUT 从客户端向服务器传送的数据取代指定的文档的内容。
* DELETE 请求服务器删除指定的页面。
* TRACE 回显服务器收到的请求，主要用于测试或诊断。
* OPTIONS 向用户显示可用于特定URL的HTTP方法。
* CONNECT HTTP/1.1 协议中预留给能够将连接改为管道方式的代理服务器。
* PATCH 是对 PUT 方法的补充，用来对已知资源进行局部更新。
  

#### HTTP响应
&emsp;&emsp;一个HTTP响应也由四个部分组成，分别是：响应行、响应头、空行和响应体。

```
HTTP/1.1 200 OK
Server: nginx
Date: Mon, 20 Feb 2017 09:13:59 GMT
Content-Type: text/plain;charset=UTF-8
Vary: Accept-Encoding
Cache-Control: no-store
Pragrma: no-cache
Expires: Thu, 01 Jan 1970 00:00:00 GMT
Cache-Control: no-cache
Content-Encoding: gzip
Transfer-Encoding: chunked
Proxy-Connection: Keep-alive

{"code":200,"notice":0,"follow":0,"forward":0,"msg":0,"comment":0,"pushMsg":null,"friend":{"snsCount":0,"count":0,"celebrityCount":0},"lastPrivateMsg":null,"event":0,"newProgramCount":0,"createDJRadioCount":0,"newTheme":true}
```

* 响应行:响应行由协议版本号、状态码、状态消息组成
* 响应头:客户端可以使用的一些信息，如：`Date`（生成响应的日期）、`Content-Type`（MIME类型及编码格式）、`Connection`（默认是长连接）、`Vary`字段主要用于代理服务器实现缓存服务(记录了代理服务器返回特定数据参考了哪些请求字段,代理服务器拿到源服务器的响应报文，会根据`Vary`里的字段列表，缓存不同版本的数据）...
* 空行:响应头和响应体之间必须有一个空行
* 响应体:响应正文，本例中是键值对信息

### CSRF
https://portswigger.net/web-security/csrf

### CORS
https://portswigger.net/web-security/cors