# KYC Basket Protocol

[![Build Status](https://jenkins.coinalpha.com/buildStatus/icon?job=kyc-basket-protocol&build=4)](https://jenkins.coinalpha.com/job/kyc-basket-protocol/4/)
[![Coverage Status](https://coveralls.io/repos/github/CoinAlpha/kyc-basket-protocol/badge.svg?branch=master&t=VuHnjw)](https://coveralls.io/github/CoinAlpha/kyc-basket-protocol?branch=master)

**A new paradigm for asset management**

The Basket protocol establishes a decentralized ecosystem that trustlessly fulfills the primary functions of asset management: selection, execution, and custody. Unlike a traditional investment fund, a Basket is a non-custodial financial instrument collateralized by a portfolio of assets over which the investor has full control and agency.

**Roles in the Basket Protocol Ecosystem**

The Basket Protocol deconstructs the traditional asset management model into three functional roles, allowing for specialization, efficiency, and decentralization.  Market participants can act in any or all capacities.  Meanwhile, the protocol's registry capabilities facilitate the evaluation of and tracking of baskets as well as of the arrangers that created them.

- **Arranger**: "fund manager" in the traditional sense, that selects tokens and weights for basket contracts
- **Supplier**: accumulates ERC20 tokens for compiling into baskets and "minting" of basket tokens
- **Buyer**: the ultimate holder of the basket token, who owns and controls the basket tokens and the underlying ERC20 tokens they represent

## Basket Protocol Contract Suite

**[Basket Contract](contracts/Basket.sol)**

The fundamental building block of the Basket Protocol, a Basket Contract is an extended ERC20 token contract capable of holding and transacting in other ERC20 tokens.  In addition to the basic [ERC20 token specifications](https://en.wikipedia.org/wiki/ERC20), the basket contract adds the following functionality:

```js
// Deposit ERC20 tokens into the basket contract and "mint" new Basket ERC20
// tokens that represent the underlying tokens
function depositAndBundle(uint _quantity) public payable returns (bool success)
```

```js
// Extract the underlying ERC20 tokens and "burning" the Basket token
function debundleAndWithdraw(uint _quantity) public returns (bool success)
```

A holder of a basket token issued by a Basket Contract has direct control over and agency of the underlying ERC20 tokens represented by the basket token.  The Basket Contract ensures that the tokens represented by a basket token are always held by the Basket Contract, readily available for any holder who wants to debundle and assume direct ownership of the underlying tokens, at any time.

**[Basket Factory](contracts/BasketFactory.sol)**

Contract that allows Arrangers to construct new ERC20 token portfolios by creating new Basket Contracts.  When constructing new baskets, Arrangers specify tokens and weights, creating a "template" for minting new Basket tokens from that basket.

**[Basket Registry](contracts/BasketRegistry.sol)**

A registry to keep track of baskets created, quantity of each basket minted and burned, as well as usage of a particular arranger's baskets.

**[Basket Escrow](contracts/BasketEscrow.sol)**

Allows for users to create buy and sell orders for baskets, fill orders, and transact in Ether.

## Coding Guides
- [http://solidity.readthedocs.io/en/develop/style-guide.html](http://solidity.readthedocs.io/en/develop/style-guide.html)

## Solidity Compiler

The basket protocol uses [Solidity 0.4.21](https://solidity.readthedocs.io/en/v0.4.20/contracts.html#events).

- Introduces "`emit` LogEvent" syntax
- Note on 0.4.22: compiler version has been downgraded to 0.4.21 due to potential errors related to ERC20 tokens introduced in 0.4.22 ([read more](https://medium.com/@chris_77367/explaining-unexpected-reverts-starting-with-solidity-0-4-22-3ada6e82308c))

## Testing
- [Truffle](http://truffleframework.com/) [v4.1.5](https://github.com/trufflesuite/truffle/releases/tag/v4.1.5)

```sh
$ truffle install -g truffe@4.1.5
Truffle v4.1.5 (core: 4.1.5)
Solidity v0.4.21 (solc-js)
```

**Run test**

```sh
$ npm test
```

**Running test coverage (solidity-coverage)**

```sh
# Requires environment variable TEST_COVERAGE=true, which is set in the npm script:
npm run coverage
```

**Deployment**

- Specify `DEPLOYER_ADDRESS` and `KYC_ADMIN` address in [config.js](config.js)

```sh
# Ropsten Deployment
npm run deploy:ropsten
# Mainnet Deployment
npm run deploy:mainnet
```


## Security
The CoinAlpha team, to the extent possible, aims to follow industry best practices and keep up to date with the rapidly developing field of smart contracts and blockchain engineering.  Some of the guides and best practices followed include:
- [OpenZeppelin contracts](https://github.com/OpenZeppelin/zeppelin-solidity): the Basket Protocol uses some of the standardized and widely accepted OpenZeppelin contracts
- [ConsenSys: Smart Contract Security Best Practices](https://github.com/ConsenSys/smart-contract-best-practices)

### [Hosho](https://hosho.io) Security Audit
![Hosho Audited](image/hosho.png)
- In July 2018, we hired Hosho, a global leader in blockchain security.
- Our protocol passed Hosho's comprehensive audit.  The full report can be found here: [Hosho Security Audit Report](files/hosho-basket-audit.pdf).

### 🐞 Bug Bounty Program
We are also running a bug bounty program.
If you find a security issue, please email [dev@coinalpha.com](mailto:dev@coinalpha.com).
For more information on the Bug Bounty program, click here: [Basket Protocol Bug Bounty Program](https://medium.com/finance-3)


## Contributions Are Welcome!
- [Contributing](CONTRIBUTING.md): git workflow

We welcome code contributions (via [pull requests](https://github.com/CoinAlpha/basket-protocol/pulls)) as well as bug reports and feature requests through [github issues](https://github.com/CoinAlpha/basket-protocol/issues).  You may also contact us by [email](mailto:dev@coinalpha.com).

## Contact
The Basket Protocol was created by [CoinAlpha](https://www.coinalpha.com).  You can contact us at [dev@coinalpha.com](mailto:dev@coinalpha.com).

## License
Code released under the [Apache-2.0 License](LICENSE).
