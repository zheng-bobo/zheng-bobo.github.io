---
title: 理解I/O：随机和顺序
categories: [operating system]
date: 2020-02-06 21:06:10 +0800 
---

转：https://blog.csdn.net/BaiWfg2/article/details/52885287

&emsp;&emsp;`Storage for DBAs: Ever been to one of those sushi restaurants where the food comes round in dishes on a conveyor belt? As each dish travels around the loop you eye it up and, as long as you can make your mind up in time, grab it. However, if you are as indecisive as me, there’s a chance it will be out of range before you come to your senses – in which case you have to wait for it to complete a further full revolution before getting another chance. And that’s assuming someone else doesn’t get to it first.`

&emsp;&emsp;曾经去过寿司店吗，那里的食物都是放在一个传送带上。随着每份食品在带上的传送，你瞄准了一些食物，等它们来到跟前时，立刻拿走它。然而如果你像我一样那么迟疑，那就有可能食物已经超出了你能够着的范围了。这时候你就得再等上一圈才可能拿到，前提还是别人没取走

&emsp;&emsp;`Let’s assume that it takes a dish exactly 4 minutes to complete a whole lap of the conveyor belt. And just for simplicity’s sake let’s also assume that no two dishes on the belt are identical. As a hungry diner you look in the little menu and see a particular dish which you decide you want. It’s somewhere on the belt, so how long will it take to arrive?`

&emsp;&emsp;我们假定一道食品在传送带上走完一圈需要4分钟，为简单起见还假定传送带上的食品互不相同。作为一个吃货，你看了看菜单，找到了几样你想要的食物，它就在带上的某个地方，那么需要多久才会到达你的旁边呢？

&emsp;&emsp;`Probability dictates that it could be anywhere on the belt. It could be passing by right now, requiring no wait time – or it could have just passed out of reach, thus requiring 4 minutes of wait time to go all the way round again. As you follow this random method (choose from the menu then look at the belt) it makes sense that the average wait time will tend towards halfway between the min and max wait times, i.e. 2 minutes in this case. So every time you pick a dish you wait an average of 2 minutes: if you have eight dishes the odds say that you will spend (8 x 2) = 16 minutes waiting for your food. Welcome to the disk data diet, I hope you weren’t too hungry?`

&emsp;&emsp;我们指定它可以在带上的任何地方。可能正在经过，你不需要等待就可以拿到手，或者它刚刚过了你的范围，那么需要4分钟的等待转完一圈。当你遵循这套随机规则(菜单中选择食品然后看传送带)，就会意识到平均等待时间将会倾向于最大和最小等待时间的中间位置，也就是2分钟。于是乎你每次取食物时都需要等待2分钟，如果你有8个盘子，那很可能你需要等上16分钟才能取完。欢迎来到磁盘数据饮食，希望你不会太饿？

&emsp;&emsp;`Now let’s consider an alternative option, where you order eight dishes from the chef and he or she places all of them sequentially (i.e. next to each other) somewhere on the conveyor belt. That location is random, so again you might have to wait anywhere between 0 and 4 minutes (an average of 2 minutes) for the first dish to pass… but the next seven will follow one after the other with no wait time. So now, in this scenario, you only had to wait 2 minutes for all eight dishes. Much better.`

&emsp;&emsp;现在让我们来考虑另一种方案，你订了8道菜，厨师依次把他们放在了传送带的某个地方，位置是随机的，所以你需要等上平均时间2分钟取得第一份菜。然而剩下的7份菜都不需要等待。所以在这种场景下，取8道菜你只需等2分钟，比刚才好多了。

`I’m sure you will have seen through my analogy right from the start. The conveyor belt is a hard disk and the sushi dishes are blocks which are being eaten / read. I haven’t yet worked out how to factor a bottle Asahi Super Dry into this story, but I’ll have one all the same thanks.`

&emsp;&emsp;我确定你能看懂我在文章开头所作的类比了。传送带就是磁盘，食品就好比要吃/读的块。【最后一句翻译不来。555……】

`Random versus Sequential I/O`
&emsp;&emsp;`I have another article planned for later in this series which describes the inescapable mechanics of disk. For now though, I’ll outline the basics: every time you need to access a block on a disk drive, the disk actuator arm has to move the head to the correct track (the seek time), then the disk platter has to rotate to locate the correct sector (the rotational latency). This mechanical action takes time, just like the sushi travelling around the conveyor belt.`

&emsp;&emsp;我改日会有另外一篇文章来谈磁盘原理。但现在，我大概说一下基本内容：每次访问磁盘的一个块时，磁臂就需移动到正确的磁道上（这段时间为寻址时间），然后盘片就需旋转到正确的扇区上（这叫旋转时延）。这套动作需要时间，正如寿司在传送带上传送需要时间一样。

&emsp;&emsp;`Obviously the amount of time depends on where the head was previously located and how fortunate you are with the location of the sector on the platter: if it’s directly under the head you do not need to wait, but if it just passed the head you have to wait for a complete revolution. Even on the fastest 15k RPM disk that takes 4 milliseconds (15,000 rotations per minute = 250 rotations per second, which means one rotation is 1/250th of a second or 4ms). Admittedly that’s faster than the sushi in my earlier analogy, but the chances are you will need to read or write a far larger number of blocks than I can eat sushi dishes (and trust me, on a good day I can pack a fair few away).`

&emsp;&emsp;很明显总共的时间依赖于磁头的初使位置，还有要访问的扇区的位置。如果它刚好就在磁头下方，那不需要等待；如果刚刚经过磁头，那就不得不等上一个周期时间。哪怕对于最快的15k RPM磁盘，每分钟15000转，每秒250转，那么一转需要4ms。很明显比刚才寿司的情况要快得多，但是很多时候需要读上大量的数据块，远远超过我要吃的寿司量。相信我，这种时候的时间我都可以打包好几份了。

&emsp;&emsp;`What about the next block? Well, if that next block is somewhere else on the disk, you will need to incur the same penalties of seek time and rotational latency. We call this type of operation a random I/O. But if the next block happened to be located directly after the previous one on the same track, the disk head would encounter it immediately afterwards, incurring no wait time (i.e. no latency). This, of course, is a sequential I/O.`

&emsp;&emsp;那下一个磁盘块又是如何呢？如果它在磁盘的某个地方，访问它会有同样的寻道和旋转时延，我们就把这种方式的IO叫做随机IO；但是如果它刚好就在你刚才访问的那一个磁盘块的后面，磁头就能立刻遇到，不需等待，这种IO就叫顺序IO

`Size Matters`
&emsp;&emsp;`In my last post I described the Fundamental Characteristics of Storage: Latency, IOPS and Bandwidth (or Throughput). As a reminder, IOPS stands for I/Os Per Second and indicates the number of distinct Input/Output operations (i.e. reads or writes) that can take place within one second. You might use an IOPS figure to describe the amount of I/O created by a database, or you might use it when defining the maximum performance of a storage system. One is a real-world value and the other a theoretical maximum, but they both use the term IOPS.`

&emsp;&emsp;在我上一篇博文中讲到了磁盘的基本特征：延时、IOPS和带宽（或叫吞吐量）。这里再说一次，IOPS是每秒I/O数的简称，表示一秒中输入输出操作（比如读和写）的次数。可以用IOPS数值来描述一个数据库的IO操作量，或者在定义一个存储系统的最大性能时采用这个词。前者是一种真实世界的值，后者是一个理论最大值，它们都IOPS这个术语。

&emsp;&emsp;`When describing volumes of data, things are slightly different. Bandwidth is usually used to describe the maximum theoretical limit of data transfer, while throughput is used to describe a real-world measurement. You might say that the bandwidth is the maximum possible throughput. Bandwidth and throughput figures are usually given in units of size over units of time, e.g. Mb/sec or GB/sec. It pays to look carefully at whether the unit is using bits (b) or bytes (B), otherwise you are likely to end up looking a bit silly (sadly, I speak from experience). In the previous post we stated that IOPS and throughput were related by the following relationship:`

&emsp;&emsp;当描述大量数据时，情况就有所不同了。带宽用来描述数据传输的理论最大值，而吞吐量是实际值。你可以说带宽是吞吐量的上限。带宽和吞吐量数值经常带有单位时间上的单位大小的单位，如Mb/sec,Gb/sec.注意这里b和B是不同的，前者是位，后者是字节。在上一篇博文中，我们讲到了IOPS和吞吐量之间有这样的关系：

```
Throughput   =   IOPS   x   I/O size
```
吞吐量 = IOPS * I/O大小

&emsp;&emsp;`It’s time to start thinking about that I/O size now. If we read or write a single random block in one second then the number of IOPS is 1 and the I/O size is also 1 (I’m using a unit of “blocks” to keep things simple). The Throughput can therefore be calculated as (1 x 1) = 1 block / second.`

&emsp;&emsp;现在有必要来谈谈IO 大小了。如果一秒中读一个单个随机块，那么 IOPS就是1，IO大小也是1（这里用块作单位是使问题简化）。那么吞吐量就是1*1=1块/s

&emsp;&emsp;`Alternatively, if we wanted to read or write eight contiguous blocks from disk as a sequential operation then this again would only result in the number of IOPS being 1, but this time the I/O size is 8. The throughput is therefore calculated as (1 x 8) = 8 blocks / second.`
&emsp;&emsp;`Hopefully you can see from this example the great benefit of sequential I/O on disk systems: it allows increased throughput. Every time you increase the I/O size you get a corresponding increase in throughput, while the IOPS figure remains resolutely fixed. But what happens if you increase the number of IOPS?`

&emsp;&emsp;或者另外一种方式，顺序读连续8个数据块，那么此时IOPS仍是1，但大小为8，所以吞吐量是1*8=8块/s。相信你能看出顺序IO的优势了，它支持递增式的吞吐量，每一次增加IO数据块数量就能获得吞吐量的提升，然而IOPS恒定不变。要是它增加了呢？

`Latency Kills Disk Performance`
&emsp;&emsp;`In the example above I described a single-threaded process reading or writing a single random block on a disk. That I/O results in a certain amount of latency, as described earlier on (the seek time and rotational latency). We know that the average rotational latency of a 15k RPM disk is 4ms, so let’s add another millisecond for the disk head seek time and call the average I/O latency 5ms. How many (single-threaded) random IOPS can we perform if each operation incurs an average of 5ms wait? The answer is 1 second / 5 ms = 200 IOPS. Our process is hitting a physical limit of 200 IOPS on this disk.`
&emsp;&emsp;`What do you do if you need more IOPS? With a disk system you only really have one choice: add more disks. If each spindle can drive 200 IOPS and you require 80,000 IOPS then you need (80,000 / 200) = 400 spindles. Better clear some space in that data centre, eh?`

&emsp;&emsp;在上面的例子中，我描述了一个单线程的进程读写磁盘的单个随机块的情况。那种IO将会有很大的延时，如前所说的寻道时间和旋转时延。已经知道对于15k RPM 的磁盘而言，平均旋转时延是4ms，我们假定磁头的寻道时间是1ms，那么平均IO时延是5ms。那么这种情况下，每次操作要5ms，在一秒内可以有多少次操作呢，也就是IOPS的值。答案是1s/5ms=200 IOPS(单线程情况下)。那想增加IOPS该怎么做呢？只有一个法子就是增加更多磁盘。如果一个转轴驱动200 IOPS，那么若想达到80000 IOPS的值，就需要80000/200=400个转轴。对于这种数据中心的空间情况更清楚了吗？

&emsp;&emsp;`On the other hand, if you can perform the I/O sequentially you may be able to reduce the IOPS requirement and increase the throughput, allowing the disk system to deliver more data. I know of Oracle customers who spend large amounts of time and resources carving up and re-ordering their data in order to allow queries to perform sequential I/O. They figure that the penalty incurred from all of this preparation is worth it in the long run, as subsequent queries perform better. That’s no surprise when the alternative was to add an extra wing to the data centre to house another bunch of disk arrays, plus more power and cooling to run them. This sort of “no pain, no gain” mentality used to be commonplace because there really weren’t any other options. Until now.`

&emsp;&emsp;在另一方面，如果你能执行顺序IO，你将可以降低对IOPS的要求而提升吞吐量，使磁盘系统传送更多的数据。我了解到Oracle用户就花大量时间和资源对数据进行重新划分和排序，这样请求就会是顺序IO。【这里我个人疑问是：对数据的重新划分和排序就能保证在磁盘上的排列是符合顺序IO的吗？】他们认为这样的初始准备工作虽然麻烦，但长久看来却是值得的，因为后来的请求将会执行得更好。当然增加额外的磁盘去存储更多的数据，增加更多的电能和冷却装置也是可以的。这种NO PAIN, NO GAIN心理是很常见的，因为迄今没有其它选择

`Flash Offers Another Way`
&emsp;&emsp;`The idea of sequential I/O doesn’t exist with flash memory, because there is no physical concept of blocks being adjacent or contiguous. Logically, two blocks may have consecutive block addresses, but this has no bearing on where the actual information is electronically stored. You might therefore say that all flash I/O is random, but in truth the principles of random I/O versus sequential I/O are disk concepts so don’t really apply. And since the latency of flash is sub-millisecond, it should be possible to see that, even for a single-threaded process, a much larger number of IOPS is possible. When we start considering concurrent operations things get even more interesting… but that topic is for another day.`

&emsp;&emsp;闪存中是不存在顺序IO的概念的，因为没有邻接或连续这种块的物理概念。逻辑上，两个块可以有连续的块地址，但不能确定实际的信息存在哪里。你也许会说所以闪存IO是随机的，但事实上随机IO和顺序IO只是磁盘概念，所以不要这么用。由于闪存的时延是亚毫秒级，所对对于单线程的进程而言可以有很大的IOPS。当考虑并发时就更有趣了，但以后再讲。

&emsp;&emsp;`Back to the sushi analogy, there is no longer a conveyor belt – the chefs are standing right in front of you. When you order a dish, it is placed in front of you immediately. Order a number of dishes and you might want to enlist the help of a few friends to eat in parallel, because the food will start arriving faster than you can eat it on your own. This is the world of flash memory, where hunger for data can be satisfied and appetites can be fulfilled. Time to break that disk diet, eh?`

&emsp;&emsp;`Looking back at the disk model, all that sitting around waiting for the sushi conveyor belt just takes too long. Sure you can add more conveyor belts or try to get all of your sushi dishes arranged in a line, but at the end of the day the underlying problem remains: it’s disk. And now that there’s an alternative, disk just seems a bit too fishy to me…`

&emsp;&emsp;回到寿司这个类比，不再有传送带了，厨师就站在你面前。当你订一道食品，它就立刻出现在你面前；订很多食品你可以请求朋友们的帮助一起吃，因为上食物的速度总会比你一个人吃的速度快。这就是闪存实现的机制了。

&emsp;&emsp;最后一段，略