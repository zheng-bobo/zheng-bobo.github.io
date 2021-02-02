---
title: 为什么都用快排而不用归并排序？
categories: [algorithm]
date: 2019-11-13 20:32:10 +0800
---


<!-- 其中 class="blockquote-center" 是必须的 -->
<blockquote class="blockquote-center">
汝之蜜糖，乙之砒霜。 <br/>
<!--&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;——郑燮-->
<!-- 右对齐 -->
</blockquote>


### 快速排序： 

    *  最坏情况时间复杂度O(n^2)
    *  最好情况时间复杂度O(logn)
    *  平均时间复杂度O(nlgn)


### 归并排序:

    *  最坏最好平均情况下时间复杂度都为:O(nlgn)

既然归并排序的时间复杂度在不同情况下都>=快速排序的时间复杂度，那么为什么实际编程中我们所使用的排序算法都是快速排序而不是归并排序呢？

### 维基百科大O符号的定义：

&emsp;&emsp;**大O符号**（英语：Big O notation），又称为**渐进符号**，是用于描述[函数](https://zh.wikipedia.org/wiki/%E5%87%BD%E6%95%B0 "函数")[渐近行为](https://zh.wikipedia.org/wiki/%E6%B8%90%E8%BF%91%E5%88%86%E6%9E%90 "渐近分析")的[数学](https://zh.wikipedia.org/wiki/%E6%95%B0%E5%AD%A6 "数学")符号。更确切地说，它是用另一个（通常更简单的）函数来描述一个函数[数量级](https://zh.wikipedia.org/wiki/%E6%95%B0%E9%87%8F%E7%BA%A7 "数量级")的**渐近上界**。

&emsp;&emsp;举一个例子，解决一个规模为n的问题所花费的时间(或者所需步骤的数组)可以表示为:
<div style="text-align:center">T(n) = n^2 + 2n +2</div>
&emsp;&emsp;n增大时，n^2项将开始占主导地位，而其他各项可以被忽略。
&emsp;&emsp;大O符号就记下剩余的部分，写作：

![image.png](https://upload-images.jianshu.io/upload_images/12457267-fa937d51e1431e6e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

&emsp;&emsp;并且我们就说该算法具有n^2阶（平方阶）的时间复杂度。

### 理解
&emsp;&emsp;对于上面的函数,当n规模极大时，我们将小项2n和常量2忽略，时间复杂度为O(n^2)。
&emsp;&emsp;在实际的生产过程中，我们处理的规模其实并没有达到如何大的规模，此时这个小项和常量就不可忽略。

&emsp;&emsp;快速排序跟归并排序处理规模为n的问题实际情况下所花费的时间为：
<div style="text-align:center">T(n) = nlgn + c, c为常量</div>

&emsp;&emsp;快速排序一般实现为原地排序(in-place),无需创建任何辅助数组来保存临时值。
&emsp;&emsp;归并排序因为需要分配和取消分配辅助数组,所需的常量时间相当于快速排序来讲很明显。

&emsp;&emsp;在考虑常量的影响下，因为快排的常量比归排小，因此虽然两者的复杂度相同，但是快排更快一些。


### 什么场景下归并排序比快排高效？

&emsp;&emsp;当对链表结构的数据进行排序时，归并排序反而比快排高效。由于链接列表单元通常散布在整个内存中，因此访问相邻的链接列表单元不会带来任何位置上的好处。因此，Quicksort巨大的性能优势之一就被吃光了。同样，就地工作的好处不再适用，因为合并排序的链表算法不需要任何额外的辅助存储空间。

&emsp;&emsp;也就是说，快速排序在链表上仍然非常快。合并排序往往会更快，因为它可以将列表更均匀地分成两半，并且每次迭代完成合并的工作要比分区步骤少。

###  结论

&emsp;&emsp;每种算法都有其最适应的场景，并没有针对所有模型通用的算法实现，应针对不同场景选择合理的算法。

参考资料:
[Why is mergesort better for linked lists?](https://stackoverflow.com/questions/7629904/why-is-mergesort-better-for-linked-lists)