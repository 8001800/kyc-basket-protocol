const path = require('path');
const Promise = require('bluebird');

const KYC = artifacts.require('./KYC.sol');
const BasketRegistry = artifacts.require('./BasketRegistry.sol');
const BasketEscrow = artifacts.require('./BasketEscrow.sol');
const BasketFactory = artifacts.require('./BasketFactory.sol');
const { abi: basketAbi } = require('../build/contracts/Basket.json');
const { constructors } = require('../migrations/constructors.js');
const { web3 } = require('../utils/web3');
const {
  ZERO_ADDRESS,
  ARRANGER_FEE,
  PRODUCTION_FEE,
  TRANSACTION_FEE,
  FEE_DECIMALS,
  DECIMALS,
  INITIAL_SUPPLY,
  FAUCET_AMOUNT,
} = require('../config');

const doesRevert = err => err.message.includes('revert');

contract('Basket Escrow', (accounts) => {
  // Accounts
  const [ADMINISTRATOR, ARRANGER, MARKET_MAKER, HOLDER_A, HOLDER_B, INVALID_ADDRESS] = accounts.slice(0, 6);

  // Contract instances
  let kyc;
  let basketRegistry;
  let basketFactory;
  let basketEscrow;
  let basketAB;
  let basketABAddress;

  // Token instances
  let tokenA, tokenB;
  const tokenParamsA = [MARKET_MAKER, 'Token A', 'TOKA', DECIMALS, INITIAL_SUPPLY, FAUCET_AMOUNT];
  const tokenParamsB = [MARKET_MAKER, 'Token B', 'TOKB', DECIMALS, INITIAL_SUPPLY, FAUCET_AMOUNT];

  before('Before: deploy contracts and whitelist all participants', async () => {
    console.log(`  ================= START TEST [ ${path.basename(__filename)} ] =================`);

    try {
      kyc = await KYC.deployed();
      basketRegistry = await BasketRegistry.deployed();
      basketEscrow = await BasketEscrow.deployed();
      basketFactory = await BasketFactory.deployed();
      tokenA = await constructors.TestToken(...tokenParamsA);
      tokenB = await constructors.TestToken(...tokenParamsB);

      await Promise.all([
        kyc.whitelistHolder(basketEscrow.address),
        kyc.whitelistHolder(MARKET_MAKER),
        kyc.whitelistHolder(HOLDER_A),
        kyc.whitelistHolder(HOLDER_B),
      ]);
    } catch (err) { assert.throw(`Failed to deploy contracts: ${err.toString()}`); }
  });

  describe('initialization', () => {
    it('initializes basketFactory and basketRegistry correctly', async () => {
      try {
        // check initialization of indices in basketEscrow
        const _orderIndex = await basketEscrow.orderIndex.call();
        const orderIndex = Number(_orderIndex);
        assert.strictEqual(orderIndex, 1, 'orderIndex not initialized to one');
      } catch (err) { assert.throw(`Failed to initialize basket escrow correctly: ${err.toString()}`); }
    });
  });

  describe('deploys test basket', () => {
    it('deploys the basket correctly', async () => {
      try {
        const txObj = await basketFactory.createBasket(
          'A1B1', 'BASK', [tokenA.address, tokenB.address], [1e18, 1e18], ARRANGER, ARRANGER_FEE, kyc.address,
          { from: ARRANGER, value: PRODUCTION_FEE },
        );
        const txLog = txObj.logs[0];
        basketABAddress = txLog.args.basketAddress;
        basketAB = web3.eth.contract(basketAbi).at(basketABAddress);
        Promise.promisifyAll(basketAB, { suffix: 'Promise' });
      } catch (err) { assert.throw(`Error deploying basket with escrow address: ${err.toString()}`); }
    });

    after('approve and mint baskets', async () => {
      const amount = 25e18;

      try {
        const balBasketABBefore = await basketAB.balanceOfPromise(MARKET_MAKER);
        await tokenA.approve(basketABAddress, amount, { from: MARKET_MAKER });
        await tokenB.approve(basketABAddress, amount, { from: MARKET_MAKER });
        await basketAB.depositAndBundlePromise(amount, { from: MARKET_MAKER, value: amount * (ARRANGER_FEE / 1e18), gas: 1e6 });

        await basketAB.approve(basketEscrow.address, amount, { from: MARKET_MAKER, gas: 1e6 });

        const _balBasketABAfter = await basketAB.balanceOfPromise(MARKET_MAKER);
        assert.strictEqual(Number(_balBasketABAfter), Number(balBasketABBefore + amount), 'incorrect increase');
      } catch (err) { assert.throw(`Error minting baskets: ${err.toString()}`); }
    });
  });


  // Constants for the next section of tests
  let nextOrderIndex;
  let initialEscrowBalance;
  let initialHolderBalance;
  let newOrderIndex;
  const amountBasketsToBuy = 2e18;
  const amountEthToSend = 5e18;
  let expirationInSeconds = (new Date().getTime() + 86400000) / 1000; // set to a day from now
  let nonce = Math.random() * 1e7; // nonce is a random number generated at order placement


  describe('Holder_A creates buy order', () => {
    before('check initial balance', async () => {
      try {
        nextOrderIndex = await basketEscrow.orderIndex.call();
        const _initialEscrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const _initialHolderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        initialEscrowBalance = Number(_initialEscrowBalance);
        initialHolderBalance = Number(_initialHolderBalance);
      } catch (err) { assert.throw(`Error reading initial balance: ${err.toString()}`); }
    });

    it('creates and logs buy orders ', async () => {
      try {
        const buyOrderParams = [
          basketABAddress,
          amountBasketsToBuy,
          expirationInSeconds,
          nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];
        const _buyOrderResults = await basketEscrow.createBuyOrder(...buyOrderParams);

        const { event, args } = _buyOrderResults.logs[0];
        const { buyer, basket, amountEth, amountBasket } = args;
        ({ newOrderIndex } = args);
        assert.strictEqual(event, 'LogBuyOrderCreated', 'incorrect event label');
        assert.strictEqual(Number(newOrderIndex), Number(nextOrderIndex), 'incorrect new order index');
        assert.strictEqual(Number(amountEth), amountEthToSend, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToBuy, 'incorrect basket amount');
        assert.strictEqual(buyer, HOLDER_A, 'incorrect buyer');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
      } catch (err) { assert.throw(`Error creating buy order: ${err.toString()}`); }
    });

    it('sends ETH to escrow contract', async () => {
      try {
        const escrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const holderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        assert.strictEqual(Number(escrowBalance), (initialEscrowBalance + amountEthToSend), 'escrow balance did not increase');
        // check isBelow instead of strict equal due to gas
        assert.isBelow(Number(holderBalance), (initialHolderBalance - amountEthToSend), 'holder balance did not decrease');
      } catch (err) { assert.throw(`Error sending ETH to escrow contract: ${err.toString()}`); }
    });

    it('finds order from escrow by contract index', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const [_orderCreator, _basket, _basketAmt, _eth, _ethAmt, _expires, _nonce, _orderExists, _isFilled] = _orderDetails;

        assert.strictEqual(_orderCreator, HOLDER_A, 'incorrect _orderCreator');
        assert.strictEqual(_basket, basketABAddress, 'incorrect _basket');
        assert.strictEqual(Number(_basketAmt), amountBasketsToBuy, 'incorrect _basketAmt');
        assert.strictEqual(_eth, ZERO_ADDRESS, 'incorrect _eth');
        assert.strictEqual(Number(_ethAmt), amountEthToSend, 'incorrect _ethAmt');
        assert.strictEqual(Number(_expires), Math.floor(expirationInSeconds), 'incorrect _expires');
        assert.strictEqual(Number(_nonce), Math.floor(nonce), 'incorrect _nonce');
        assert.strictEqual(_orderExists, true, 'incorrect _orderExists');
        assert.strictEqual(_isFilled, false, 'incorrect _isFilled');
      } catch (err) { assert.throw(`Error in getOrderDetails: ${err.toString()}`); }
    });
  });

  describe('Holder_A cancels buy order', () => {
    before('check initial balance', async () => {
      try {
        const _initialEscrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const _initialHolderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        initialEscrowBalance = Number(_initialEscrowBalance);
        initialHolderBalance = Number(_initialHolderBalance);
      } catch (err) { assert.throw(`Error reading initial balance: ${err.toString()}`); }
    });

    it('allows and logs cancellation of buy orders ', async () => {
      try {
        const cancelBuyParams = [
          basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce, { from: HOLDER_A },
        ];
        const _cancelBuyResults = await basketEscrow.cancelBuyOrder(...cancelBuyParams);

        const { event, args } = _cancelBuyResults.logs[0];
        const { buyer, basket, amountEth, amountBasket } = args;
        assert.strictEqual(event, 'LogBuyOrderCancelled', 'incorrect event label');
        assert.strictEqual(Number(amountEth), amountEthToSend, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToBuy, 'incorrect basket amount');
        assert.strictEqual(buyer, HOLDER_A, 'incorrect buyer');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
      } catch (err) { assert.throw(`Error cancelling buy order: ${err.toString()}`); }
    });

    it('sends ETH back to holder', async () => {
      try {
        const escrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const holderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        assert.strictEqual(Number(escrowBalance), (initialEscrowBalance - amountEthToSend), 'escrow balance did not decrease');
        assert.isAbove(Number(holderBalance), (initialHolderBalance - amountEthToSend), 'holder balance did not increase');
      } catch (err) { assert.throw(`Error sending ETH back to holder: ${err.toString()}`); }
    });

    it('marks order as no longer exists', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const _orderExists = _orderDetails[7];
        assert.strictEqual(_orderExists, false, 'incorrect _orderExists');
      } catch (err) { assert.throw(`Error in getOrderDetails: ${err.toString()}`); }
    });
  });

  describe('Holder_A fails to create bad buy orders', () => {
    it('creates and logs buy orders ', async () => {
      try {
        // exact same params as last order
        const buyOrderParams = [
          basketABAddress, amountBasketsToBuy, expirationInSeconds, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];
        await basketEscrow.createBuyOrder(...buyOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    it('creates and logs buy orders ', async () => {
      try {
        // exact same params as last order
        nonce = Math.random() * 1e7;
        const buyOrderParams = [
          INVALID_ADDRESS, amountBasketsToBuy, expirationInSeconds, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];
        await basketEscrow.createBuyOrder(...buyOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    it('creates and logs buy orders ', async () => {
      const instantExpiration = 0;
      try {
        // exact same params as last order
        nonce = Math.random() * 1e7;
        const buyOrderParams = [
          basketABAddress, amountBasketsToBuy, instantExpiration, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];
        await basketEscrow.createBuyOrder(...buyOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('Holder_A cancels expired buy order', () => {
    const timeDelta = 10;   // expires in 10 seconds

    before('create second buy order and check initial balance', async () => {
      try {
        // set expiration time to now to ensure the order will expire
        expirationInSeconds = (new Date().getTime() / 1000) + timeDelta;
        const buyOrderParams = [
          basketABAddress, amountBasketsToBuy, expirationInSeconds, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];

        const _buyOrderResults = await basketEscrow.createBuyOrder(...buyOrderParams);
        ({ newOrderIndex } = _buyOrderResults.logs[0].args);

        const _initialEscrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const _initialHolderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        initialEscrowBalance = Number(_initialEscrowBalance);
        initialHolderBalance = Number(_initialHolderBalance);
      } catch (err) { assert.throw(`Error creating second buy order: ${err.toString()}`); }
    });

    it('waits <timeDelta> seconds before proceeding', async () => {
      await new Promise((resolve) => {
        setTimeout(() => { resolve(); }, timeDelta * 1000);
      });
    });

    it('allows and logs cancellation of buy orders ', async () => {
      try {
        const cancelBuyParams = [
          basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce, { from: HOLDER_A },
        ];
        const _cancelBuyResults = await basketEscrow.cancelBuyOrder(...cancelBuyParams);

        const { event, args } = _cancelBuyResults.logs[0];
        const { cancelledOrderIndex, buyer, basket, amountEth, amountBasket } = args;
        assert.strictEqual(event, 'LogBuyOrderCancelled', 'incorrect event label');
        assert.strictEqual(Number(amountEth), amountEthToSend, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToBuy, 'incorrect basket amount');
        assert.strictEqual(buyer, HOLDER_A, 'incorrect buyer');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
      } catch (err) { assert.throw(`Error cancelling buy order: ${err.toString()}`); }
    });

    it('sends ETH back to holder', async () => {
      try {
        const escrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        const holderBalance = await web3.eth.getBalancePromise(HOLDER_A);
        assert.strictEqual(Number(escrowBalance), (initialEscrowBalance - amountEthToSend), 'escrow balance did not decrease');
        assert.isBelow(Number(holderBalance), (initialHolderBalance + amountEthToSend), 'holder balance did not increase');
      } catch (err) { assert.throw(`Error sending ETH back to holder: ${err.toString()}`); }
    });

    it('marks order as no longer exists', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const _orderExists = _orderDetails[7];
        assert.strictEqual(_orderExists, false, 'incorrect _orderExists');
      } catch (err) { assert.throw(`Error in getOrderDetails: ${err.toString()}`); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('Holder_A fails to cancel buy orders that do not exist', () => {
    it('disallows cancellation of buy orders that do not exist', async () => {
      try {
        const cancelBuyParams = [
          basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce, { from: HOLDER_A },
        ];
        await basketEscrow.cancelBuyOrder(...cancelBuyParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });
  });

  describe('MARKET_MAKER fills HOLDER_A\'s new buy order', () => {
    let initialFillerBasketBal;
    let initialBuyerBasketBal;
    let initialFillerEthBal;
    let initialEscrowEthBal;

    before('create third buy order and check initial balance', async () => {
      try {
        expirationInSeconds = (new Date().getTime() + 86400000) / 1000;
        const buyOrderParams = [
          basketABAddress, amountBasketsToBuy, expirationInSeconds, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];

        const _buyOrderResults = await basketEscrow.createBuyOrder(...buyOrderParams);
        ({ newOrderIndex } = _buyOrderResults.logs[0].args);

        const _initialFillerBasketBal = await basketAB.balanceOf(MARKET_MAKER);
        const _initialBuyerBasketBal = await basketAB.balanceOf(HOLDER_A);
        const _initialFillerEthBal = await web3.eth.getBalancePromise(MARKET_MAKER);
        const _initialEscrowEthBal = await web3.eth.getBalancePromise(basketEscrow.address);
        initialFillerBasketBal = Number(_initialFillerBasketBal);
        initialBuyerBasketBal = Number(_initialBuyerBasketBal);
        initialFillerEthBal = Number(_initialFillerEthBal);
        initialEscrowEthBal = Number(_initialEscrowEthBal);
      } catch (err) { assert.throw(`Error creating third buy order: ${err.toString()}`); }
    });

    it('allows and logs buy order fills ', async () => {
      try {
        const fillBuyParams = [
          HOLDER_A, basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _fillBuyResults = await basketEscrow.fillBuyOrder(...fillBuyParams);
        const { event, args } = _fillBuyResults.logs[0];
        const { buyOrderFiller, orderCreator, basket, amountEth, amountBasket } = args;

        assert.strictEqual(event, 'LogBuyOrderFilled', 'incorrect event label');
        assert.strictEqual(buyOrderFiller, MARKET_MAKER, 'incorrect filler');
        assert.strictEqual(orderCreator, HOLDER_A, 'incorrect orderCreator');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
        assert.strictEqual(Number(amountEth), amountEthToSend, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToBuy, 'incorrect basket amount');
      } catch (err) { assert.throw(`Error filling buy order: ${err.toString()}`); }
    });

    it('alters all balances correctly', async () => {
      try {
        const _fillerBasketBal = await basketAB.balanceOf(MARKET_MAKER);
        const _buyerBasketBal = await basketAB.balanceOf(HOLDER_A);
        const _fillerEthBal = await web3.eth.getBalancePromise(MARKET_MAKER);
        const _escrowEthBal = await web3.eth.getBalancePromise(basketEscrow.address);

        assert.strictEqual(Number(_fillerBasketBal), (initialFillerBasketBal - amountBasketsToBuy), 'filler basket balance did not decrease');
        assert.strictEqual(Number(_buyerBasketBal), (initialBuyerBasketBal + amountBasketsToBuy), 'buyer basket balance did not increase');
        assert.isBelow(Number(_fillerEthBal), (initialFillerEthBal + amountEthToSend), 'filler eth balance did not increase');
        assert.strictEqual(Number(_escrowEthBal), (initialEscrowEthBal - amountEthToSend), 'escrow eth balance did not decrease');
      } catch (err) { assert.throw(`Error sending ETH to escrow contract: ${err.toString()}`); }
    });

    it('marks order as filled', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const _isFilled = _orderDetails[8];
        assert.strictEqual(_isFilled, true, 'incorrect _isFilled');
      } catch (err) { assert.throw(`Error in marking order filled: ${err.toString()}`); }
    });
  });

  describe('Holder_A fails to cancel buy orders that are filled', () => {
    it('disallows cancellation of buy orders that are filled', async () => {
      try {
        const cancelBuyParams = [
          basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce, { from: HOLDER_A },
        ];
        await basketEscrow.cancelBuyOrder(...cancelBuyParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });
  });

  describe('MARKET_MAKER fails to fill bad orders', () => {
    it('cannot fill the same order twice', async () => {
      try {
        // exact same params as last fill
        const fillBuyParams = [
          HOLDER_A, basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _fillBuyResults = await basketEscrow.fillBuyOrder(...fillBuyParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    it('cannot fill an order that does not exist', async () => {
      try {
        const fillBuyParams = [
          HOLDER_B, basketABAddress, amountBasketsToBuy, amountEthToSend, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _fillBuyResults = await basketEscrow.fillBuyOrder(...fillBuyParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('MARKET_MAKER fails to fill orders that are too large', () => {
    before('HOLDER_A creates large order', async () => {
      try {
        const buyOrderParams = [
          basketABAddress, 1e20, expirationInSeconds, nonce,
          { from: HOLDER_B, value: amountEthToSend, gas: 1e6 },
        ];
        await basketEscrow.createBuyOrder(...buyOrderParams);
      } catch (err) { assert.throw(`Error in creating another order: ${err.toString()}`); }
    });

    it('cannot fill an order that does not exist', async () => {
      try {
        const fillBuyParams = [
          HOLDER_B, basketABAddress, 1e20, amountEthToSend, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _fillBuyResults = await basketEscrow.fillBuyOrder(...fillBuyParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });
  });


  describe('MARKET_MAKER fails to fill expired orders', () => {
    const timeDelta = 60;   // 10 seconds
    const instantExpiration = (new Date().getTime() / 1000) + timeDelta;

    before('creates an order that expires instantly', async () => {
      try {
        nonce = Math.random() * 1e7;
        const buyOrderParams = [
          basketABAddress, amountBasketsToBuy, instantExpiration, nonce,
          { from: HOLDER_A, value: amountEthToSend, gas: 1e6 },
        ];
        await basketEscrow.createBuyOrder(...buyOrderParams);
      } catch (err) { assert.throw(`Error in creating expired order: ${err.toString()}`); }
    });

    it('cannot fill an expired order', async () => {
      setTimeout(async () => {
        try {
          const fillBuyParams = [
            HOLDER_B, basketABAddress, amountBasketsToBuy, amountEthToSend, instantExpiration, nonce,
            { from: MARKET_MAKER, gas: 1e6 },
          ];
          const _fillBuyResults = await basketEscrow.fillBuyOrder(...fillBuyParams);
        } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
      }, timeDelta * 1000);
    });
  });

  let initialEscrowBasketBal;
  let initialMMBasketBal;
  const amountBasketsToSell = 7e18;
  const amountEthToGet = 9e18;
  nonce = Math.random() * 1e7;

  describe('MARKET_MAKER creates sell order', () => {
    before('check initial balance', async () => {
      try {
        nextOrderIndex = await basketEscrow.orderIndex.call();
        const _initialEscrowBasketBal = await basketAB.balanceOf(basketEscrow.address);
        const _initialMMBasketBal = await basketAB.balanceOf(MARKET_MAKER);
        initialEscrowBasketBal = Number(_initialEscrowBasketBal);
        initialMMBasketBal = Number(_initialMMBasketBal);
      } catch (err) { assert.throw(`Error reading initial balance: ${err.toString()}`); }
    });

    it('creates and logs sell orders ', async () => {
      try {
        const sellOrderParams = [
          basketABAddress, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce, { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _sellOrderResults = await basketEscrow.createSellOrder(...sellOrderParams);

        const { event, args } = _sellOrderResults.logs[0];
        const { seller, basket, amountEth, amountBasket } = args;
        ({ newOrderIndex } = args);
        assert.strictEqual(event, 'LogSellOrderCreated', 'incorrect event label');
        assert.strictEqual(Number(newOrderIndex), Number(nextOrderIndex), 'incorrect new order index');
        assert.strictEqual(Number(amountEth), amountEthToGet, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToSell, 'incorrect basket amount');
        assert.strictEqual(seller, MARKET_MAKER, 'incorrect seller');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
      } catch (err) { assert.throw(`Error creating sell order: ${err.toString()}`); }
    });

    it('sends Baskets to escrow contract', async () => {
      try {
        const escrowBalance = await basketAB.balanceOf(basketEscrow.address);
        const sellerBalance = await basketAB.balanceOf(MARKET_MAKER);
        assert.strictEqual(Number(escrowBalance), (initialEscrowBasketBal + amountBasketsToSell), 'escrow balance did not increase');
        assert.strictEqual(Number(sellerBalance), (initialMMBasketBal - amountBasketsToSell), 'supplier balance did not decrease');
      } catch (err) { assert.throw(`Error sending ETH to escrow contract: ${err.toString()}`); }
    });

    it('finds order from escrow by contract index', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const [_orderCreator, _eth, _ethAmt, _basket, _basketAmt, _expires, _nonce, _orderExists, _isFilled] = _orderDetails;

        assert.strictEqual(_orderCreator, MARKET_MAKER, 'incorrect _orderCreator');
        assert.strictEqual(_eth, ZERO_ADDRESS, 'incorrect _eth');
        assert.strictEqual(Number(_ethAmt), amountEthToGet, 'incorrect _ethAmt');
        assert.strictEqual(_basket, basketABAddress, 'incorrect _basket');
        assert.strictEqual(Number(_basketAmt), amountBasketsToSell, 'incorrect _basketAmt');
        assert.strictEqual(Number(_expires), Math.floor(expirationInSeconds), 'incorrect _expires');
        assert.strictEqual(Number(_nonce), Math.floor(nonce), 'incorrect _nonce');
        assert.strictEqual(_orderExists, true, 'incorrect _orderExists');
        assert.strictEqual(_isFilled, false, 'incorrect _isFilled');
      } catch (err) { assert.throw(`Error in getOrderDetails: ${err.toString()}`); }
    });
  });

  describe('MARKET_MAKER cancels sell order', () => {
    before('check initial balance', async () => {
      try {
        const _initialEscrowBasketBal = await basketAB.balanceOf(basketEscrow.address);
        const _initialMMBasketBal = await basketAB.balanceOf(MARKET_MAKER);
        initialEscrowBasketBal = Number(_initialEscrowBasketBal);
        initialMMBasketBal = Number(_initialMMBasketBal);
      } catch (err) { assert.throw(`Error reading initial balance: ${err.toString()}`); }
    });

    it('allows and logs cancellation of sell orders ', async () => {
      try {
        const cancelSellParams = [
          basketABAddress, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce, { from: MARKET_MAKER },
        ];
        const _cancelSellResults = await basketEscrow.cancelSellOrder(...cancelSellParams);

        const { event, args } = _cancelSellResults.logs[0];
        const { seller, basket, amountEth, amountBasket } = args;
        assert.strictEqual(event, 'LogSellOrderCancelled', 'incorrect event label');
        assert.strictEqual(Number(amountEth), amountEthToGet, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToSell, 'incorrect basket amount');
        assert.strictEqual(seller, MARKET_MAKER, 'incorrect seller');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
      } catch (err) { assert.throw(`Error creating buy order: ${err.toString()}`); }
    });

    it('sends Baskets back to supplier', async () => {
      try {
        const escrowBalance = await basketAB.balanceOf(basketEscrow.address);
        const sellerBalance = await basketAB.balanceOf(MARKET_MAKER);
        assert.strictEqual(Number(escrowBalance), (initialEscrowBasketBal - amountBasketsToSell), 'escrow balance did not decrease');
        assert.strictEqual(Number(sellerBalance), (initialMMBasketBal + amountBasketsToSell), 'supplier balance did not increase');
      } catch (err) { assert.throw(`Error sending ETH to escrow contract: ${err.toString()}`); }
    });

    it('marks order as no longer exists', async () => {
      try {
        const _orderDetails = await basketEscrow.getOrderDetails(newOrderIndex);
        const _orderExists = _orderDetails[7];
        assert.strictEqual(_orderExists, false, 'incorrect _orderExists');
      } catch (err) { assert.throw(`Error in getOrderDetails: ${err.toString()}`); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('Holder_A fails to create bad sell orders', () => {
    it('creates and logs duplicate sell orders ', async () => {
      try {
        const sellOrderParams = [
          basketABAddress, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        // creates the order for the first time
        await basketEscrow.createSellOrder(...sellOrderParams);
        // creates the same order again
        await basketEscrow.createSellOrder(...sellOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    it('creates and logs sell orders with invalid basket address', async () => {
      try {
        // exact same params as last order
        nonce = Math.random() * 1e7;
        const sellOrderParams = [
          INVALID_ADDRESS, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        await basketEscrow.createSellOrder(...sellOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('HOLDER_B fills MARKET_MAKER\'s new sell order', () => {
    let initialFillerBasketBal, initialSellerEthBal, initialFillerEthBal;

    before('create second sell order and check initial balance', async () => {
      try {
        const sellOrderParams = [
          basketABAddress, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce, { from: MARKET_MAKER, gas: 1e6 },
        ];
        const _sellOrderResults = await basketEscrow.createSellOrder(...sellOrderParams);
        ({ newOrderIndex } = _sellOrderResults.logs[0].args);

        const _initialFillerBasketBal = await basketAB.balanceOf(HOLDER_B);
        const _initialSellerEthBal = await web3.eth.getBalancePromise(MARKET_MAKER);
        const _initialFillerEthBal = await web3.eth.getBalancePromise(HOLDER_B);
        const _initialEscrowBasketBal = await basketAB.balanceOf(basketEscrow.address);
        initialFillerBasketBal = Number(_initialFillerBasketBal);
        initialSellerEthBal = Number(_initialSellerEthBal);
        initialFillerEthBal = Number(_initialFillerEthBal);
        initialEscrowBasketBal = Number(_initialEscrowBasketBal);
      } catch (err) { assert.throw(`Error creating second sell order: ${err.toString()}`); }
    });

    it('allows and logs sell order fills ', async () => {
      try {
        const fillSellParams = [
          MARKET_MAKER, basketABAddress, amountBasketsToSell, expirationInSeconds, nonce,
          { from: HOLDER_B, value: amountEthToGet, gas: 1e6 },
        ];

        const _fillSellResults = await basketEscrow.fillSellOrder(...fillSellParams);
        const { event, args } = _fillSellResults.logs[0];
        const { sellOrderFiller, orderCreator, basket, amountEth, amountBasket } = args;

        assert.strictEqual(event, 'LogSellOrderFilled', 'incorrect event label');
        assert.strictEqual(sellOrderFiller, HOLDER_B, 'incorrect filler');
        assert.strictEqual(orderCreator, MARKET_MAKER, 'incorrect orderCreator');
        assert.strictEqual(basket, basketABAddress, 'incorrect basket address');
        assert.strictEqual(Number(amountEth), amountEthToGet, 'incorrect eth amount');
        assert.strictEqual(Number(amountBasket), amountBasketsToSell, 'incorrect basket amount');
      } catch (err) { assert.throw(`Error filling sell order: ${err.toString()}`); }
    });

    after('update nonce', () => { nonce = Math.random() * 1e7; });
  });

  describe('Allows escrow admin to change key variables', () => {
    before('initialization', async () => {
      const admin = await basketEscrow.admin.call();
      const transactionFeeRecipient = await basketEscrow.transactionFeeRecipient.call();
      const transactionFee = await basketEscrow.transactionFee.call();
      assert.strictEqual(admin, ADMINISTRATOR, 'wrong admin saved');
      assert.strictEqual(transactionFeeRecipient, ADMINISTRATOR, 'wrong transactionFeeRecipient saved');
      assert.strictEqual(Number(transactionFee), TRANSACTION_FEE, 'wrong transactionFee saved');
    });

    it('allows admin to change transaction fee recipient', async () => {
      await basketEscrow.changeTransactionFeeRecipient(ZERO_ADDRESS);
      const transactionFeeRecipient = await basketEscrow.transactionFeeRecipient.call();
      assert.strictEqual(transactionFeeRecipient, ZERO_ADDRESS, 'transaction fee recipient did not change accordingly');
    });

    it('allows admin to change transaction fee', async () => {
      const NEW_FEE = 0.002;
      await basketEscrow.changeTransactionFee(NEW_FEE * (10 ** FEE_DECIMALS));
      const transactionFee = await basketEscrow.transactionFee.call();
      assert.strictEqual(Number(transactionFee), Number(NEW_FEE) * (10 ** FEE_DECIMALS), 'transaction fee did not change accordingly');
    });
  });

  describe('Disallows order creation when creator is not whitelisted', () => {
    before('can unwhitelist an existing holder', async () => {
      await kyc.unWhitelistHolder(HOLDER_A);
    });

    it('disallows HOLDER_A to create oders', async () => {
      try {
        const sellOrderParams = [
          basketABAddress, amountBasketsToSell, amountEthToGet, expirationInSeconds, nonce,
          { from: MARKET_MAKER, gas: 1e6 },
        ];
        await basketEscrow.createSellOrder(...sellOrderParams);
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });
  });

  describe('Reverts when anyone else tries to change key variables', () => {
    before('initialization', async () => {
      const transactionFeeRecipient = await basketEscrow.transactionFeeRecipient.call();
      assert.strictEqual(transactionFeeRecipient, ZERO_ADDRESS, 'wrong transactionFeeRecipient set in the beginning');
    });

    it('allows arranger to change arranger fee recipient', async () => {
      try {
        await basketEscrow.changeTransactionFeeRecipient(HOLDER_A, { from: HOLDER_A });
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });

    after('arranger and arranger fee stays the same as before', async () => {
      const transactionFeeRecipient = await basketEscrow.transactionFeeRecipient.call();
      assert.strictEqual(transactionFeeRecipient, ZERO_ADDRESS, 'transaction fee recipient changed when it shouldn\'t');
    });
  });

  describe('Fallback', () => {
    before('Read initial balance', async () => {
      try {
        const _initialEscrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);
        initialEscrowBalance = Number(_initialEscrowBalance);
      } catch (err) { assert.throw(`Error reading balances: ${err.toString()}`); }
    });

    it('Rejects any ether sent to contract', async () => {
      try {
        web3.eth.sendTransactionPromise({ from: HOLDER_B, to: basketEscrow.address, value: 1e18, data: 1e18 })
          .catch(() => {});

        const _currentEscrowBalance = await web3.eth.getBalancePromise(basketEscrow.address);

        assert.strictEqual(initialEscrowBalance, Number(_currentEscrowBalance), 'basket escrow balance increased');
      } catch (err) { assert.equal(doesRevert(err), true, 'did not revert as expected'); }
    });
  });
});
