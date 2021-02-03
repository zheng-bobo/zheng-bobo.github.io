---
title: （译）Domain-Driven Design:Everything You Always Wanted to Know About it, But Were Afraid to Ask(1)
categories: [architecture]
date: 2021-02-02 12:06:47  +0800 
---
***[Domain-Driven Design原文地址](https://medium.com/ssense-tech/domain-driven-design-everything-you-always-wanted-to-know-about-it-but-were-afraid-to-ask-a85e7b74497a)***

![bookmarks_2020_1_17.jpeg](https://i.loli.net/2021/02/02/tPqS1KpzvsarDMd.jpg)

<br/>
&emsp;&emsp;随着个人代码库的扩展,其复杂性也不可避免地会随之增加。随着这种情况发生,按原本的意图去保持代码的组织和结构将变得十分困难,也就是所谓的["软件熵"](https://zh.wikipedia.org/wiki/%E8%BB%9F%E9%AB%94%E7%86%B5)。在经过一系列迭代后,如果没有执行严格的体系结构准则,保持良好的关注点切点以及正确地将类和模块解耦将变得更具挑战性。

&emsp;&emsp;在传统的Model-View-Controller (MVC) 结构中,“ M”层将保留所有业务逻辑,但不提供如何正确进行职责划分界限的明确准则。为了缓解这个问题,又出现了几种模型。但是组件之间始终存在着逻辑和职责纠缠不清的风险,随着模型的发展,可维护性和稳定性变得更加棘手。

&emsp;&emsp;另一方面,与业务专家的沟通读、需求收集、技术团队和非技术团队之间达成共识、以及正确地设计和实施解决业务问题的系统,这是一个持续不断的迭代过程,在此过程中,事情很容易被误解,最终偏离了最初目标的轨道。

&emsp;&emsp;例如,命名这件事一直是软件开发人员面临的最困难的挑战之一。我们需要足够清晰让其他开发人员能够理解代码的意图,同时使用适当的命名来促进与业务调用方的对话。

&emsp;&emsp;领域驱动设计（DDD）试图解决这些挑战,通过调解在软件项目中的技术力量和非技术力量间的冲突,并提出一套有助于构建成功系统的实践和模式。

### 什么是领域驱动设计？

&emsp;&emsp;让我们先从定义“领域”一词在本文中的含义开始。我喜欢将其定义为:

<!-- 其中 class="blockquote-center" 是必须的 -->
<blockquote class="blockquote-center">
“特定的活动或知识领域,定义了一组通用需求,术语和功能,应用于程序逻辑上去解决问题。”
<!--&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;——郑燮-->
<!-- 右对齐 -->
</blockquote>

&emsp;&emsp;领域驱动设计是一种软件设计方法,通过将系统的实现与一个不断发展的模型相结合,从而忽略诸如编程语言,基础架构技术等不相关的细节。

&emsp;&emsp;它主要集中关注业务问题及如何严格组织解决问题的逻辑。这种方法最早由埃里克·埃文斯（Eric Evans）在他的书中描述[Domain-Driven Design Tackling Complexity in the Heart of Software.](https://www.goodreads.com/book/show/179133.Domain_Driven_Design)

&emsp;&emsp;现在,我们知道DDD的定义及其目标是什么,让我们深入研究该方法的三个主要支柱。

### 战略设计:拆分你的设计,以免毫无头绪

&emsp;&emsp;随着实施过程的不断迭代和系统复杂性的逐步提高,维持对它的控制可能是艰巨的。因此,掌握和控制大型系统的严格策略至关重要。将模型分解为相互关联的有Bounded Context（它们本身在概念和代码上都有自己的统一模型）是避免复杂性陷阱的有效方法。

#### Bounded Context

&emsp;&emsp;一个Bounded Context是在业务领域,团队和代码方面围绕应用程序和/或项目的各个部分的概念边界。它对相关的组件和概念进行了分组,并避免了模棱两可,因为其中某些组件和概念在没有明确上下文的情况下可能具有相似的含义。
例如,在“受限Bounded Context”之外,“字母”可能意味着两个截然不同的事物:字符或写在纸上的消息。通过定义边界和上下文,可以确定其含义
在许多项目中,团队被Bounded Context划分,每个团队都专注于自己的领域专业知识和逻辑。

#### Context Mapping

&emsp;&emsp;识别并以图形方式记录项目中的每个Bounded Context称为Context Mapping。Context Mapping有助于更好地了解Bounded Context和团队之间的关系和沟通方式。他们给出了实际边界的清晰概念,并帮助团队直观地描述了系统设计的概念细分。
![Context Mapping.png](https://i.loli.net/2021/02/02/pbmM21U83kQWzJy.png)


&emsp;&emsp;Bounded Context之间的关系可能会有所不同,具体取决于设计要求和其他特定于项目的约束,除了以下四个之外,本文中将省略一些关系：

#### Anti-corruption Layer

&emsp;&emsp;下游Bounded Context实现了一个转换来自上游上下文的数据或对象的层,从而确保它支持内部模型。(接口继承)

#### Conformist

&emsp;&emsp;下游Bounded Context符合并适应上游上下文,如果需要,必须进行更改。在这种情况下,上游环境对满足下游需求毫无兴趣。（上游不为下游做私人定制）

#### Customer/Supplier

&emsp;&emsp;上游向下游供应服务,下游环境充当客户,确定需求并要求上游进行更改以满足他们的需求。（上下游是CS模式）

#### Shared Kernel

&emsp;&emsp;有时,不可避免的是两个（或多个）上下文重叠,并最终共享资源或组件。这种关系要求两个上下文在需要更改时保持连续同步,因此应尽可能避免。（多个上下文处于同个逻辑链）

### 协作建模：丰富的沟通和有效的协作

&emsp;&emsp;DDD建议通过采取一种协作方法来有效地对领域建模,涉及到不仅拥有技术知识而且拥有商业知识的各方。正如埃文斯（Evans）所描述的,“领域模型”不仅是领域专家头脑中的知识；它是对该知识的严格组织和选择性抽象。”

&emsp;&emsp;开发人员与领域专家合作,旨在不断完善领域模型,迫使他们学习他们要解决的业务问题的重要细节和原理,而不仅仅是机械地编写代码。

&emsp;&emsp;为了实现业务团队与技术团队之间的这种协作,领域模型应使用一种将技术术语与业务结合起来的语言,并找到所有团队成员都能理解并达成共识的中间地带,这被称为通用语言。使用定义明确的无处不在的语言将改善技术团队与业务团队之间的每一次互动,从而减少歧义并提高其效率。

&emsp;&emsp;最终,这种无处不在的语言将被嵌入到代码中。
<br/>


### 战术设计：DDD的基本要素
&emsp;&emsp;乍一看,实现领域对象之间的关联并描述它们的功能很容易,但是应该以清晰直观的方式正确区分它们的含义和存在的原因。 DDD提出了一组构造和模式来实现它。

#### Entities
&emsp;&emsp;具有唯一身份并具有连续性线程的对象称为实体,它们不仅由其属性定义,而且还由其身份定义。它们的属性可能会发生变化,其生命周期可能会发生巨大变化,但它们的身份仍然存在。通过唯一键或保证唯一的属性的组合来维护身份。
例如,在电子商务领域中,订单具有唯一的标识符,并且它经历了多个不同的阶段：打开,确认,发货等各个阶段,因此将其视为域实体。

```
export class Customer {

    private id: number;
    private name: string;

    protected constructor(name: string) {
        // A uuid guarantees a unique identity for the Customer Entity
        this.id = uuidv4();
        this.name = this.setName(name);
    }

    private setName(name: string): string {
        // Business invariant: Customer name should not be empty
        if (name === undefined || name === '') {
            throw new Error('Name cannot be empty');
        }
        return name;
    }

    public static create(name: string): Customer {
        return new Customer(name);
    }
}
```

#### Value Objects
&emsp;&emsp;描述特征且不具有任何唯一标识的对象称为“值对象”,它们只关心它们是什么,而不关心它们是谁。
&emsp;&emsp;价值对象是属性,可以由多个实体共享,例如：两个客户可以具有相同的收货地址。尽管存在风险,但如果需要更改其属性之一,则共享它们的所有实体都会受到影响。为避免这种情况,值对象必须是不可变的,在需要更新时,系统必须用新的新实例替换它们。
&emsp;&emsp;同样,价值对象的创建应始终取决于用于创建它们的数据的有效性以及它如何尊重业务不变性。因此,如果数据无效,则不会创建对象实例。例如,在北美,具有非字母数字字符的邮政编码将违反业务不变性,并在创建地址时触发异常。

```
export class Address {

    private readonly streetAddress: string;
    private readonly postalCode: string

    protected constructor(streetAddress: string, postalCode: string) {
        this.streetAddress = this.getValidStreetAddress(streetAddress);
        this.postalCode = this.getValidPostalCode(postalCode);
    }

    private getValidStreetAddress(streetAddress: string): string {
        // Business invariant: street address should not be longer than 128 characters
        if (streetAddress.length > 128) {
            throw new Error('Address should not be longer than 128 characters');
        }
        return streetAddress;
    }

    private getValidPostalCode(postalCode: string): string {
        // Business invariant: Should be a valid canadian postal code
        const pattern = /[a-z]\d[a-z][ \-]?\d[a-z]\d/g;
        if (!postalCode.match(pattern)) {
            throw new Error('Postal code should only contain alphanumeric caracters and spaces');
        }
        return postalCode;
    }

    public getStreetAddress(): string {
        return this.streetAddress;
    }

    public getPostalCode(): string {
        return this.postalCode;
    }

    public static create(streetAddress: string, postalCode: string): Address {
        return new Address(streetAddress, postalCode);
    }

    public equals(otherAddress: Address): boolean {
        // Value Objects equality is based on their propertie's values
        return objectHelper.isEqual(this, otherAddress);
    }
}
```

#### Services

&emsp;&emsp;在许多情况下,域模型要求某些与实体或值对象不直接相关的动作或操作,将其强制执行到其实现中会导致其定义失真。服务是提供无状态操作的类。与实体和值对象的名词相对,它们通常被称为动词,并且是根据通用语言来命名的。

&emsp;&emsp;服务应该精心设计,始终确保服务不会剥夺实体和价值对象的直接责任和行为。它们还应该是无状态的,以便客户端可以使用服务的任何给定实例,而无需考虑该实例在应用程序生存期内的历史记录。具有没有域逻辑的实体和值对象被认为是称为[“贫血域模型”](https://martinfowler.com/bliki/AnemicDomainModel.html)的反模式。

### 领域对象及其生命周期


&emsp;&emsp;域对象通常具有复杂的生命周期,它们被实例化,经历了几次更改,与其他对象交互,执行操作,被持久化,被重构,被删除等等。在确保系统不会错失其复杂生命周期的同时保持完整性是实现适当的域模型所代表的主要挑战之一。

&emsp;&emsp;最小化域对象之间的关系和交互以维持域模型内复杂度的可管理水平非常困难,尤其是在复杂的业务域中,或者正如Eric Evans所述：

<blockquote class="blockquote-center">
“很难保证具有复杂关联的模型中对象更改的一致性。需要维护适用于紧密相关的对象组的不变量,而不仅仅是离散的对象。但是,谨慎的锁定方案会导致多个用户相互干扰,并使系统无法使用。”
</blockquote>

### 聚集

&emsp;&emsp;为了减轻上述挑战,需要对实体和值对象进行汇总,以限制违反业务不变性的情况。

&emsp;&emsp;聚集是相关实体和价值对象的集合,聚集在一起表示事务边界。每个聚合对象都有一个面向外的实体,并控制对边界内对象的所有访问,该实体称为“聚合根”,它是其他对象可以与之交互的唯一对象。聚合中的任何对象都不能直接从外部调用,从而保持内部一致性。

&emsp;&emsp;业务不变量是保证聚合及其内容完整性的业务规则,换句话说,它是一种确保其状态始终与业务规则一致的机制。例如,当某种产品的库存量为零时,永远无法下订单。

```
export class Order {

    private id: number;
    private isConfirmed: boolean;
    private total: number;
    private shippingAddress: Address;
    private customer: Customer;
    private items: Product[];
    private payments: Payment[];

    constructor(
        customer: Customer,
        shippingAddress: Address,
        items: Item[],
        payments: Payment[]
    ) {
        // Generate a unique identifier (UUID) for the Order Entity
        this.id = uuidv4();
        this.isConfirmed = false;
        this.total = 0;
        this.customer = customer;
        this.shippingAddress = shippingAddress;
        this.items = items.length ? items : [];
        this.payments = payments.length ? payments : [];
    }

    private getPaymentsTotal(): number {
        return this.payments.reduce((accumulator, payment) => accumulator + payment.total);
    }

    public addPayments(payment: Payment): void {
        this.payments.push(payment);
        this.total += payment.total;
    }

    public addItems(product: Product): void {
        // Business invariant: an order should not have items which are not in stock
        if (!product.getStockQuanity()) {
            throw new Error(`No stock for product id: ${product.id}`);
        }
        this.items.push(product);
    }

    public confirm(): void {
        // Business invariant: only fully paid orders can be confirmed
        if (this.total === this.getPaymentsTotal()) {
            throw new Error('Total amount paid does not equal order total');
        }
        this.isConfirmed = true;
    }
}
```

### 工厂

&emsp;&emsp;创建复杂的对象和聚合实例可能是一项艰巨的任务，并且还可能泄露过多的对象内部细节。使用工厂，我们可以解决此问题并提供必要的封装。

&emsp;&emsp;工厂应该能够在一个原子操作中构造域对象或聚合，要求在调用时客户端需要提供所有数据，并对所创建的对象强制执行所有不变式。该活动不是域模型的一部分，但仍属于域层，因为它是适用于系统的业务规则的一部分

```
export class OrderFactory implements Factory {

    private customerEntity: Customer;
    private addressValue: Address;
    private productsRepository: Repository;
    private paymentsRepository: Repository;

    constructor(customerEntity: Customer, addressValue: Address, productsRepository: Repository, paymentsRepository: Repository) {
        this.customerEntity = customerEntity;
        this.addressValue = addressValue;
        this.productsRepository = productsRepository;
        this.paymentsRepository = paymentsRepository;
    }

    public async createOrder(customerName: string, addressDto: AddressDto, itemDtos: ItemDto[], paymentDtos: PaymentDto[]): Order {
        try {
            const customer = this.customerEntity.create(customerName);
            const shippingAddress = this.addressValue.create(addressDto.streetAddress, addressDto.postalCode);
            const items = await this.productsRepository.getProductCollection(itemDtos);
            const payments = await this.paymentsRepository.getPaymentCollection(paymentDtos);

            return new Order(customer, shippingAddress, items, payments);
        } catch(err) {
            // Error handling logic should go here
            throw new Error(`Order creation failed: ${err.message}`);
        }
    }
}
```

### 仓库


&emsp;&emsp;为了能够从持久性中检索对象，无论是内存中的，文件系统中的还是数据库中的，我们都需要提供一个对客户端隐藏实现细节的接口，以便它不依赖于基础结构的具体细节，而仅取决于抽象。

&emsp;&emsp;存储库提供了一个接口层，域层可以使用该接口来检索存储的对象，从而避免了与存储逻辑的紧密耦合，并给客户端一种幻想，即直接从内存中检索对象。

&emsp;&emsp;值得一提的是，所有存储库接口定义都应位于域层中，但其具体实现应位于基础结构层中。

```
export class OrderRepository implements Repository {
    private model: OrderModel;
    private mapper: OrderMapper;
    private productsRepository: Repository;
    private paymentsRepository: Repository;

    constructor(orderModel: OrderModel, orderMapper: Mapper, productsRepository: Repository, paymentsRepository: Repository) {
        this.model = orderModel;
        this.mapper = orderMapper;
        this.productsRepository = productsRepository;
        this.paymentsRepository = paymentsRepository;
    }

    public async getById(orderId: number): Promise<Order> {
        const order = await this.model.findOne(orderId);

        if (!order) {
            throw new Error(`No order found with order id: ${orderId}`);
        }
        return this.mapper.toDomain(order);
    }

    public async save(order: Order): Promise<Boolean> {
        const orderRecord: OrderRecord = this.mapper.toPersistence(order);

        try {
            await this.productsRepository.insert(order.items);
            await this.paymentsRepository.insert(order.payments);

            if (!!await this.getById(order.id)) {
                await this.model.update(orderRecord);
            } else {
                await this.model.insert(orderRecord);
            }
        } catch (err) {
            // call to rollback mechanism should go here
            return false;
        }
        return true;
    }
}
```

### 将领域与其他关注点隔离

&emsp;&emsp;专为解决领域问题而编写的代码部分仅占整个代码库的一小部分。如果这部分与解决其他问题的代码交织在一起，将很难理解和改进。将域逻辑与所有其他功能明确分开将减少泄漏，并避免在大型复杂系统中造成混淆。

&emsp;&emsp;DDD提出了一种分层体系结构，通过将代码库分为四个主要层（用户界面，应用程序，域和基础结构）来分离关注点并避免责任混淆。

&emsp;&emsp;此处的主要规则是，每一层中的组件应仅取决于同一层或其下任何一层的组件。上层仅通过调用其公共接口即可使用下层的组件，而下层只能通过控制反转（IoC）进行向上通信。

* **用户界面层 (User Interface Layer) :** 负责显示数据和捕获用户命令。
* **应用层 (Application Layer) :** 作为领域工作的协调者，它不了解领域规则，但是组织并委托领域对象来完成其工作。它也是其他有界上下文可访问的唯一层。
* **领域层 (Domain Layer) :** 保存业务逻辑和规则以及业务状态。这就是领域模型的所在地。
* **基础设施层 (Infrastructure Layer) :** 实现应用程序支持高层所需的所有技术功能，持久性，消息传递，层之间的通信等。

&emsp;&emsp;即使并非每个系统都需要所有层，但是域层的存在是DDD中的先决条件。

![Deependency Flow.png](https://i.loli.net/2021/02/03/MD5gTBwA647Cq8S.png)

### 结论

&emsp;&emsp;总而言之，DDD是一种通过与领域专家的广泛合作和严格的设计模式来解决业务问题的整体方法，它不是所有软件项目的通用解决方案，但在正确应用时可以带来巨大的收益。

&emsp;&emsp;有几本关于此主题的书，有意地在本文中省略了各种概念，但是如果我激发了您对领域驱动设计的兴趣，我请您先阅读蓝色和红色的书，以该顺序开始是这个庞大主题的起点。