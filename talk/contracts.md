# Smart Contracts and Blockchain - A Primer

## What is a Smart Contract?

A smart contract is code that runs on the blockchain, not on your computer. Your backend doesn't execute the contract - it sends **transactions** to the blockchain saying "please execute function X with these parameters." The blockchain executes it and returns the result.

## Where Does the Contract Live?

On a real blockchain like Polygon, your contract lives **everywhere and nowhere specific**.

When you deploy, the contract gets copied to **every node** in the network (thousands of computers worldwide). All nodes have identical copies at the same address. This is why blockchains are:
- **Unstoppable** - No single server to shut down
- **Trustless** - No single party controls it
- **Permanent** - Can't delete data, only add

## How Does Deployment Work?

You only send your contract to **one node**. The network distributes it automatically via the **gossip protocol** - nodes tell other nodes, spreading exponentially like a rumor. Within seconds, all nodes have it.

Then consensus happens:
1. A validator bundles transactions into a block
2. Other nodes verify: "Is this valid? Did they pay gas?"
3. If valid, everyone adds it to their chain
4. Your contract is now permanently everywhere

You pay gas ONCE. The network handles replication.

## Scale

Real blockchains have millions of contracts:
- Ethereum: ~60 million contracts
- Polygon: ~5 million contracts

Every node stores ALL of them (about 2TB of data). Your contract is just one tiny file among millions.

## Is This Practical?

Blockchains are wildly inefficient compared to normal computing:

| Normal Server | Blockchain |
|---------------|------------|
| 1 copy of data | Thousands of copies |
| Millisecond responses | Seconds to minutes |
| Pennies per million requests | $0.01+ per transaction |
| You trust the operator | Trustless |
| Can be shut down | Unstoppable |
| Data can be changed | Immutable |

Blockchains only make sense when you NEED:
- No single point of control
- Censorship resistance
- Trustless verification
- Permanent records

For most apps, a normal database is 1000x faster and cheaper. But for ownership, money, and contracts between strangers, the inefficiency is the price of trust.

## Hardhat vs Real Blockchain

Hardhat is a **simulator** - one node on your laptop pretending to be a blockchain.

| Real Blockchain | Hardhat |
|-----------------|---------|
| Thousands of nodes | Just 1 |
| Real consensus | Instant |
| Real money (MATIC) | Fake ETH |
| Permanent | Gone when you restart |

We use Hardhat for fast iteration, free testing, and safe experimentation.

## Nodes vs Tokens

These are completely different:

- **Nodes** = Computers running the blockchain software (physical machines)
- **Tokens** = Digital items tracked BY the blockchain (data entries)

Analogy: Nodes are like bank branches. Tokens are like entries in your account.

## Deploy vs Mint

Both cost gas, but they're different:

- **Deploying** = Installing a program on the blockchain (once)
- **Minting** = Running that program to create data (many times)

You specify which contract to use by its **address** (like a URL).

## Gas Costs on Polygon

| Operation | Cost |
|-----------|------|
| Deploy contract | ~$0.05 - $0.20 |
| Mint a token | ~$0.01 - $0.05 |
| List for sale | ~$0.01 |
| Buy | ~$0.02 |

Polygon is cheap. Ethereum mainnet would be 100x more.

## What If You Make a Mistake?

**Contracts are immutable.** You can't edit them once deployed.

Options:
1. **Deploy a new contract** - Old tokens are stuck, users must migrate
2. **Upgradeable contracts** - More complex, must be planned in advance
3. **Snapshot + airdrop** - Mint equivalent tokens on new contract for each holder

Migration is painful and expensive. The watermarks in images reference old token IDs, so a new contract means watermarks don't match.

**This is why testing on Hardhat matters** - catch bugs before they're permanent on a real network.
