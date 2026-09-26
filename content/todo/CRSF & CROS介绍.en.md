---
title: "Introduction to CSRF and CORS"
date: 2021-02-04 17:32:47  +0800
slug: "csrf-and-cors-introduction"
categories: ["Network"]
---


### Introduction

 Before introducing `CRSF(Cross-site request forgery)`&`CORS(Cross-origin resource sharing)`, we first introduce HTTP. If readers are familiar with HTTP, they can skip this content directly.


#### HTTP request
﻿An HTTP request consists of four parts: request line, request header, blank line and request body.

```
GET /mix/76.html?name=kelvin&password=123456 HTTP/1.1
Host: www.fishbay.cn
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8
Accept-Encoding: gzip, deflate, sdch
Accept-Language: zh-CN,zh;q=0.8,en;q=0.6
```

* Request line: `GET` is the request type, `/mix/76.html?name=kelvin&password=123456` is the resource to be accessed, `HTTP/1.1` is the protocol version
* Request header: `Host` indicates the destination of the request (host domain name); `User-Agent` is client information. It is important information for detecting the browser type. It is defined by the browser and is automatically sent in each request. The content encoding that `Accept-Encoding` can support and the priority order of content encoding. The natural language set that `Accept-Language` can accept for processing (referring to Chinese or English, etc.)
* Request body: You can add any other data. (GET method has no request body)

##### HTTP request method:

* GET requests the specified page information and returns the entity body.
* HEAD is similar to a GET request, except that there is no specific content in the returned response, used to obtain headers
* POST submits data to the specified resource for processing the request (such as submitting a form or uploading a file). The data is included in the request body. POST requests may result in the creation of new resources and/or modification of existing resources.
* PUT The data transferred from the client to the server replaces the contents of the specified document.
* DELETE requests the server to delete the specified page.
* TRACE echoes requests received by the server, mainly used for testing or diagnosis.
*OPTIONS Shows the user the HTTP methods available for a specific URL.
* The CONNECT HTTP/1.1 protocol is reserved for proxy servers that can change connections to pipelines.
* PATCH is a supplement to the PUT method and is used to locally update known resources.


#### HTTP response
 An HTTP response also consists of four parts, namely: response line, response header, blank line and response body.

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

* Response line: The response line consists of protocol version number, status code, and status message
* Response header: Information the client can use, such as `Date` (when the response was generated), `Content-Type` (MIME type and encoding), `Connection` (persistent by default), and `Vary`. Proxy servers use `Vary` to cache different representations according to the request fields that influenced the origin response.
* Blank line: There must be a blank line between the response header and the response body
* Response body: response text, in this case key-value pair information

### CSRF
https://portswigger.net/web-security/csrf

### CORS
https://portswigger.net/web-security/cors
