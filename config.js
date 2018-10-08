const FEE_MULTIPLIER = 0;               // Set to 0 for zero fees

module.exports = {
  // Gas price used for development and testing
  GAS_PRICE_DEV: 20e9,
  GAS_LIMIT: 5e6,

  // Addresses
  DEPLOYER_ADDRESS: '<INSERT_DEPLOYER_ADDRESS>',
  KYC_ADMIN: '<INSERT_KYC_ADMIN_ADDRESS>',

  // Fee amounts used for development and testing
  FEE_MULTIPLIER: 0,                                     // Set to 0 for zero fees
  TRANSACTION_FEE: FEE_MULTIPLIER * 0.005 * 1e18,        // Charge 0.5% transaction fee
  PRODUCTION_FEE: FEE_MULTIPLIER * 0.3 * 1e18,           // Charge 0.3 ETH per basket creation
  SWAPPABLE_PRODUCTION_FEE: FEE_MULTIPLIER * 0.3 * 1e18, // Charge 0.5 ETH per basket creation
  ARRANGER_FEE: FEE_MULTIPLIER * 0.01 * 1e18,            // Charge 0.01 ETH per basket minted
  FEE_DECIMALS: 18,

  // Zero address
  ZERO_ADDRESS: '0x0000000000000000000000000000000000000000',

  // Token deployment tokenParams
  DECIMALS: 18,
  INITIAL_SUPPLY: 100e18,
  FAUCET_AMOUNT: 1e18,

  // RPC Port
  // NOTE:    truffle test creates a new testrpc on port 7545, while the default port for
  //          solidity-coverage is 8555.
  //          Excluding 'test'/'development' and 'coverage' networks from specifications in
  //          truffle.js results in truffle creating its own default testrpc instances.
  // WARNING: Using ports other than the default ports may result in `truffle test` or
  //          `solidity-coverage` failure.
  PORT: process.env.TEST_COVERAGE ? 8555 : 7545,
};
