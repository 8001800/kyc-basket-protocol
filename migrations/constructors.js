/**
 * @dev The following constructors are used to create contract instances for testing
 */
const { GAS_PRICE_DEV } = require('../config');

const allArtifacts = {
  TestToken: artifacts.require('./TestToken.sol'),
  BasketEscrow: artifacts.require('./BasketEscrow.sol'),
  BasketFactory: artifacts.require('./BasketFactory.sol'),
  // SwappableBasketFactory: artifacts.require('./SwappableBasketFactory.sol'),
  BasketRegistry: artifacts.require('./BasketRegistry.sol'),
  Basket: artifacts.require('./Basket.sol'),
  KYC: artifacts.require('./KYC.sol'),
};

// solidity-coverage: fails if gasPrice is specified
// https://github.com/sc-forks/solidity-coverage/blob/master/docs/faq.md#running-out-of-gas
// Remove gasPrice when running test coverage:
const gasObj = process.env.TEST_COVERAGE ? {} : { gasPrice: GAS_PRICE_DEV };

const constructors = {
  KYC: (_owner, _admin) => allArtifacts.KYC.new(_admin, Object.assign({}, { from: _owner }, gasObj)),

  BasketRegistry: _owner => allArtifacts.BasketRegistry.new(Object.assign({}, { from: _owner }, gasObj)),

  BasketEscrow: (_owner, _basketRegistryAddress, _transactionFeeRecipient, _transactionFee) =>
    allArtifacts.BasketEscrow.new(
      _basketRegistryAddress,
      _transactionFeeRecipient,
      _transactionFee,
      Object.assign({}, { from: _owner }, gasObj),
    ),

  BasketFactory: (_owner, _basketRegistryAddress, _productionFeeRecipient, _productionFee) =>
    allArtifacts.BasketFactory.new(
      _basketRegistryAddress,
      _productionFeeRecipient,
      _productionFee,
      Object.assign({}, { from: _owner }, gasObj),
    ),

  // SwappableBasketFactory: (_owner, _basketRegistryAddress, _productionFeeRecipient, _productionFee) =>
  //   allArtifacts.SwappableBasketFactory.new(
  //     _basketRegistryAddress,
  //     _productionFeeRecipient,
  //     _productionFee,
  //     Object.assign({}, { from: _owner }, gasObj),
  //   ),

  TestToken: (_owner, _name, _symbol, _decimals, _initialSupply, _faucetAmount) =>
    allArtifacts.TestToken.new(
      _name,
      _symbol,
      _decimals,
      _initialSupply,
      _faucetAmount,
      Object.assign({}, { from: _owner }, gasObj),
    ),

  Basket: (_owner, _name, _symbol, _tokens, _weights, _registryAddress, _kycAddress, _arranger, _arrangerFeeRecipient, _arrangerFee) =>
    allArtifacts.Basket.new(
      _name,
      _symbol,
      _tokens,
      _weights,
      _registryAddress,
      _kycAddress,
      _arranger,
      _arrangerFeeRecipient,
      _arrangerFee,
      Object.assign({}, { from: _owner }, gasObj),
    ),
};

module.exports = {
  constructors,
};
