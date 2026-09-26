---
title: "Translation: Domain-Driven Design - Everything You Always Wanted to Know (1)"
date: 2021-02-02 12:06:47  +0800
slug: "domain-driven-design-everything-you-wanted-to-know-1"
categories: ["Architecture"]
---

***[Domain-Driven Design original address](https://medium.com/ssense-tech/domain-driven-design-everything-you-always-wanted-to-know-about-it-but-were-afraid-to-ask-a85e7b74497a)***

![bookmarks_2020_1_17.jpeg](https://i.loli.net/2021/02/02/tPqS1KpzvsarDMd.jpg)

<br/>
 As a personal code base grows, its complexity inevitably increases. As this happens, it becomes very difficult to maintain the organization and structure of the code as originally intended, which is known as ["software entropy"](https://zh.wikipedia.org/wiki/%E8%BB%9F%E9%AB%94%E7%86%B5). After a series of iterations, maintaining good focus points and correctly decoupling classes and modules becomes more challenging if strict architectural guidelines are not enforced.

﻿In a traditional Model-View-Controller (MVC) structure, the “M” layer would retain all business logic but provide no clear guidelines on how to properly delineate responsibilities. In order to alleviate this problem, several models have emerged. But there's always the risk of tangled logic and responsibilities between components, and as the model evolves, maintainability and stability become trickier.

On the other hand, communicating with business experts, gathering requirements, reaching consensus between technical and non-technical teams, and correctly designing and implementing the system that solves the business problem is a continuous iterative process during which things can easily be misunderstood and ultimately deviate from the original goal.

 For example, naming has always been one of the most difficult challenges faced by software developers. We need to be clear enough for other developers to understand the intent of the code, while using appropriate naming to facilitate conversation with business callers.

Domain-driven design (DDD) attempts to address these challenges by mediating the conflict between technical and non-technical forces in software projects and proposing a set of practices and patterns that help build successful systems.

### What is domain-driven design?

Let’s start by defining what the word “field” means in this article. I like to define it as:

<!-- where class="blockquote-center" is required -->
<blockquote class="blockquote-center">
"A specific activity or knowledge area that defines a set of common requirements, terminology, and functions that are applied logically to a program to solve a problem."
<!--                 Zheng Xie -->
<!-- Right aligned -->
</blockquote>

Domain-driven design is a software design method that combines the implementation of a system with an evolving model, thereby ignoring irrelevant details such as programming languages ​​and infrastructure technologies.

﻿It mainly focuses on business problems and how to strictly organize the logic of solving problems. This approach was first described by Eric Evans in his book [Domain-Driven Design Tackling Complexity in the Heart of Software.](https://www.goodreads.com/book/show/179133.Domain_Driven_Design)

﻿Now that we know what DDD is and what its goals are, let’s delve into the three main pillars of the approach.

### Strategic Design: Break up your design so you don’t have a clue

As the implementation process iterates and the complexity of the system increases, maintaining control over it can be daunting. Therefore, it is crucial to master and control strict strategies for large systems. Decomposing your model into interrelated Bounded Contexts (which themselves have their own unified model both conceptually and code-wise) is an effective way to avoid complexity pitfalls.

#### Bounded Context

 A Bounded Context is the conceptual boundaries surrounding various parts of an application and/or project in terms of business domain, team and code. It groups related components and concepts and avoids ambiguity, as some of them may have similar meanings without clear context.
For example, outside of a Bounded Context, "letter" might mean two very different things: a character or a message written on paper. By defining boundaries and context, its meaning can be determined
In many projects, teams are divided by Bounded Context, with each team focusing on its own domain expertise and logic.

#### Context Mapping

  Identifying and graphically recording each Bounded Context in the project is called Context Mapping. Context Mapping helps to better understand the relationship and communication between Bounded Context and the team. They give a clear idea of ​​the actual boundaries and help the team visually describe the conceptual breakdown of the system design.
![Context Mapping.png](https://i.loli.net/2021/02/02/pbmM21U83kQWzJy.png)


The relationships between Bounded Context may vary depending on design requirements and other project-specific constraints. Some relationships will be omitted in this article except the following four:

#### Anti-corruption Layer

 The downstream Bounded Context implements a layer that transforms data or objects from the upstream context, thereby ensuring that it supports the internal model. (Interface inheritance)

#### Conformist

 The downstream Bounded Context conforms to and adapts to the upstream context and must be changed if necessary. In this case, the upstream environment has no interest in meeting downstream demand. (The upstream does not provide private customization for the downstream)

#### Customer/Supplier

  Upstream supplies services to downstream, and the downstream environment acts as a customer, identifying needs and requiring upstream to make changes to meet their needs. (The upstream and downstream are CS mode)

#### Shared Kernel

  Sometimes, it is inevitable that two (or more) contexts overlap and end up sharing resources or components. This relationship requires that the two contexts remain continuously in sync when changes are required, and should therefore be avoided if possible. (Multiple contexts are in the same logical chain)

### Collaboration Modeling: Rich Communication and Effective Collaboration

DDD recommends modeling the domain effectively by taking a collaborative approach, involving parties with not only technical but also business knowledge. As Evans describes it, a "domain model" is not just knowledge in the heads of domain experts; it is a rigorous organization and selective abstraction of that knowledge. "

 Developers work with domain experts to continuously refine the domain model, forcing them to learn the important details and principles of the business problems they want to solve rather than just mechanically writing code.

To achieve this kind of collaboration between business teams and technical teams, the domain model should use a language that combines technical terms with business and find a middle ground that all team members can understand and reach consensus on, which is called a common language. Using a well-defined, ubiquitous language will improve every interaction between technical and business teams, reducing ambiguity and making them more efficient.

 Eventually, this ubiquitous language will be embedded in code.
<br/>


### Tactical Design: Basic Elements of DDD
At first glance, it is easy to realize the association between domain objects and describe their functions, but their meaning and reason for existence should be correctly distinguished in a clear and intuitive way. DDD proposes a set of constructs and patterns to implement it.

#### Entities
﻿Objects with a unique identity and a thread of continuity are called entities, they are defined not only by their properties but also by their identity. Their properties may change, their life cycles may change dramatically, but their identity remains. Maintain identity through a unique key or a combination of attributes that are guaranteed to be unique.
For example, in the e-commerce world, an order has a unique identifier and it goes through several different stages: opening, confirmation, shipping, etc., so it is considered a domain entity.

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
 Objects that describe characteristics and do not have any unique identifier are called "value objects". They only care about what they are, not who they are.
﻿ Value objects are attributes that can be shared by multiple entities, for example: two customers can have the same shipping address. Despite the risks, if one of their properties needs to be changed, all entities sharing them will be affected. To avoid this, value objects must be immutable and the system must replace them with new new instances when they need to be updated.
 Similarly, the creation of value objects should always depend on the validity of the data used to create them and how it respects business immutability. Therefore, if the data is invalid, the object instance will not be created. For example, in North America, postal codes with non-alphanumeric characters will violate business invariance and trigger an exception when creating the address.

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

In many cases, a domain model requires certain actions or operations that are not directly related to entities or value objects, and forcing them into its implementation would cause distortion of its definition. Services are classes that provide stateless operations. As opposed to entities and value objects being nouns, they are often called verbs and are named after the universal language.

 Services should be carefully designed to always ensure that services do not deprive entities and value objects of their direct responsibilities and actions. They should also be stateless so that clients can use any given instance of the service without regard to the history of that instance during the lifetime of the application. Having entity and value objects with no domain logic is considered an anti-pattern called ["anemic domain model"](https://martinfowler.com/bliki/AnemicDomainModel.html).

### Domain objects and their life cycles


 Domain objects often have complex life cycles. They are instantiated, undergo several changes, interact with other objects, perform operations, are persisted, reconstructed, deleted, etc. Maintaining integrity while ensuring that the system does not miss out on its complex lifecycle is one of the major challenges represented by implementing an appropriate domain model.

 Minimizing the relationships and interactions between domain objects to maintain manageable levels of complexity within the domain model is very difficult, especially in complex business domains, or as Eric Evans puts it:

<blockquote class="blockquote-center">
"It is difficult to guarantee consistency of changes to objects in a model with complex associations. Invariants need to be maintained that apply to groups of closely related objects, not just discrete objects. However, careful locking schemes can cause multiple users to interfere with each other and render the system unusable."
</blockquote>

### Gather

To mitigate the above challenges, entities and value objects need to be aggregated to limit violations of business invariance.

 Aggregation is a collection of related entities and value objects, which are gathered together to represent transaction boundaries. Every aggregate object has an outward-facing entity that controls all access to objects within its boundaries. This entity is called the "aggregate root" and is the only object with which other objects can interact. No object in the aggregate can be called directly from outside, thus maintaining internal consistency.

 Business invariants are business rules that guarantee the integrity of an aggregate and its content. In other words, it is a mechanism that ensures that its state is always consistent with the business rules. For example, when a product has zero inventory, an order can never be placed.

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

### Factory

 Creating complex object and aggregate instances can be a difficult task and can also reveal too much internal details of the objects. Using factories we can solve this problem and provide the necessary encapsulation.

 Factories should be able to construct domain objects or aggregates in one atomic operation, requiring all data provided by the client when called, and enforcing all invariants on the created object. The activity is not part of the domain model, but still belongs to the domain layer because it is part of the business rules that apply to the system

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

### Warehouse


To be able to retrieve objects from persistence, whether in memory, in the file system, or in a database, we need to provide an interface that hides the implementation details from the client, so that it does not depend on the concrete details of the infrastructure, but only on the abstraction.

  The repository provides an interface layer that the domain layer can use to retrieve stored objects, thus avoiding tight coupling with the storage logic and giving clients the illusion of retrieving objects directly from memory.

﻿ It is worth mentioning that all repository interface definitions should be in the domain layer, but their concrete implementation should be in the infrastructure layer.

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

### Isolate domains from other concerns

 The portion of code written specifically to solve domain problems only accounts for a small portion of the entire code base. If this part is intertwined with code that solves other problems, it will be difficult to understand and improve. Clear separation of domain logic from all other functionality will reduce leaks and avoid confusion in large, complex systems.

﻿ DDD proposes a layered architecture that separates concerns and avoids confusion of responsibilities by dividing the code base into four main layers (user interface, application, domain, and infrastructure).

﻿﻿The main rule here is that components in each layer should only depend on components of the same layer or any layer below it. The upper layer can use the components of the lower layer only by calling its public interface, while the lower layer can only communicate upward through Inversion of Control (IoC).

* **User Interface Layer:** Responsible for displaying data and capturing user commands.
* **Application Layer:** As the coordinator of domain work, it does not understand domain rules, but organizes and delegates domain objects to complete its work. It is also the only layer accessible to other bounded contexts.
* **Domain Layer:** Saves business logic and rules as well as business status. This is where the domain model lives.
* **Infrastructure Layer:** Implements all technical functions required by the application to support higher layers, persistence, messaging, communication between layers, etc.

﻿ Even though not every system requires all layers, the presence of domain layers is a prerequisite in DDD.

![Deependency Flow.png](https://i.loli.net/2021/02/03/MD5gTBwA647Cq8S.png)

### Conclusion

In summary, DDD is a holistic approach to solving business problems through extensive collaboration with domain experts and rigorous design patterns. It is not a universal solution for all software projects, but it can bring huge benefits when applied correctly.

There are several books on this topic, various concepts have been intentionally omitted from this article, but if I have sparked your interest in domain-driven design, I ask you to read the blue and red books first, starting in that order is the starting point for this huge topic.
