---
title: "Why Is Quicksort Used More Often Than Merge Sort?"
date: 2019-11-13 20:32:10 +0800
slug: "why-quicksort-is-used-more-than-merge-sort"
categories: ["Algorithms"]
---



<!-- where class="blockquote-center" is required -->
<blockquote class="blockquote-center">
What is honey to you is arsenic to another. <br/>
<!--                 Zheng Xie -->
<!-- Right aligned -->
</blockquote>


### Quick sort:

    *  Worst-case time complexity: O(n^2)
    *  Best-case time complexity: O(n log n)
    *  Average time complexity: O(n log n)


### Merge sort:

    *  Worst-, best-, and average-case time complexity: O(n log n)

Since the time complexity of merge sort is >= the time complexity of quick sort in different situations, why are the sorting algorithms we use in actual programming quick sort instead of merge sort?

### Definition of Big O notation from Wikipedia:

﻿ **Big O notation** (English: Big O notation), also known as **asymptotic notation**, is a [mathematical](https://zh.wikipedia.org/wiki/%E6%95%B0%E5%AD%A6 "mathematical") symbol used to describe [function](https://zh.wikipedia.org/wiki/%E5%87%BD%E6%95%B0 "function")[asymptotic behavior](https://zh.wikipedia.org/wiki/%E6%B8%90%E8%BF%91%E5%88%86%E6%9E%90 "asymptotic analysis"). More precisely, it is an **asymptotic upper bound** for a function [order of magnitude](https://zh.wikipedia.org/wiki/%E6%95%B0%E9%87%8F%E7%BA%A7 "order of magnitude") described in terms of another (usually simpler) function.

 As an example, the time it takes to solve a problem of size n (or the array of steps required) can be expressed as:
<div style="text-align:center">T(n) = n^2 + 2n +2</div>
As n increases, the n^2 terms will begin to dominate, and the other terms can be ignored.
 Just write down the rest in big O notation and write:

![image.png](https://upload-images.jianshu.io/upload_images/12457267-fa937d51e1431e6e.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)

  And we say that the algorithm has a time complexity of order n^2 (square order).

### Understand
 For the above function, when the size of n is extremely large, we ignore the small term 2n and the constant 2, and the time complexity is O(n^2).
 In the actual production process, the scale we deal with is not actually very large. At this time, this small term and constant cannot be ignored.

 The actual time it takes for quick sort and merge sort to handle a problem of size n is:
<div style="text-align:center">T(n) = nlgn + c, c is a constant </div>

﻿ Quick sort is generally implemented as in-place sorting (in-place), without creating any auxiliary array to save temporary values.
 Merge sort needs to allocate and deallocate auxiliary arrays, and the constant time required is obviously equivalent to quick sort.

 Taking into account the influence of constants, because the constants of quick sort are smaller than that of sort, although the complexity of the two is the same, quick sort is faster.


### In what scenarios is merge sort more efficient than quick sort?

 When sorting data in a linked list structure, merge sort is more efficient than quick sort. Since linked list cells are typically scattered throughout memory, accessing adjacent linked list cells does not bring any positional benefit. Therefore, one of Quicksort's huge performance advantages is eaten up. Likewise, the benefits of working in place no longer apply, since merge sort's linked list algorithm does not require any additional auxiliary storage.

  That is to say, quick sort is still very fast on linked lists. Merge sort tends to be faster because it splits the list in half more evenly and does less work per iteration to complete the merge than the partitioning step.

### Conclusion

﻿Each algorithm has its most suitable scenario, and there is no universal algorithm implementation for all models. Reasonable algorithms should be selected for different scenarios.

References:
[Why is mergesort better for linked lists?](https://stackoverflow.com/questions/7629904/why-is-mergesort-better-for-linked-lists)
