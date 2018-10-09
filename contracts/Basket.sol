/*

  Copyright 2018 CoinAlpha, Inc.
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/

pragma solidity 0.4.21;

import "./zeppelin/SafeMath.sol";
import "./zeppelin/StandardToken.sol";
import "./zeppelin/ERC20.sol";

import "./BasketRegistry.sol";
import "./KYC.sol";

contract IBasket {
  // Called by BasketEscrow
  function isWhitelistedHolder(address _address) public view returns (bool) {}
}

/// @title Basket -- Basket contract for bundling and debundling tokens
/// @author CoinAlpha, Inc. <contact@coinalpha.com>
contract Basket is StandardToken {
  using SafeMath for uint;

  // Constants set at contract inception
  string                  public name;
  string                  public symbol;
  uint                    public decimals;
  address[]               public tokens;
  uint[]                  public weights;

  address                 public arranger;
  address                 public arrangerFeeRecipient;
  uint                    public arrangerFee;
  bool                    public kycEnabled;

  // mapping of token addresses to mapping of account balances
  // ADDRESS USER  || ADDRESS TOKEN || UINT BALANCE
  mapping(address => mapping(address => uint)) public outstandingBalance;

  // Modules
  IBasketRegistry         public basketRegistry;
  IKYC                    public kyc;

  // Modifiers
  modifier onlyArranger {
    require(msg.sender == arranger);                // Check: "Only the Arranger can call this function"
    _;
  }

  /// @dev For transactions resulting in token transfers, check that the token recipient is whitelisted
  modifier onlyWhitelistedHolder(address _to) {
    require(isWhitelistedHolder(_to));
    _;
  }

  // Events
  event LogDepositAndBundle(address indexed holder, uint indexed quantity);
  event LogDebundleAndWithdraw(address indexed holder, uint indexed quantity);
  event LogPartialDebundle(address indexed holder, uint indexed quantity);
  event LogWithdraw(address indexed holder, address indexed token, uint indexed quantity);
  event LogArrangerFeeRecipientChange(address indexed oldRecipient, address indexed newRecipient);
  event LogArrangerFeeChange(uint indexed oldFee, uint indexed newFee);

  /// @dev Basket constructor
  /// @param  _name                                Token name
  /// @param  _symbol                              Token symbol
  /// @param  _tokens                              Array of ERC20 token addresses
  /// @param  _weights                             Array of ERC20 token quantities
  /// @param  _basketRegistryAddress               Address of basket registry
  /// @param  _arranger                            Address of arranger
  /// @param  _arrangerFeeRecipient                Address to send arranger fees
  /// @param  _arrangerFee                         Amount of fee in ETH for every basket minted
  function Basket(
    string    _name,
    string    _symbol,
    address[] _tokens,
    uint[]    _weights,
    address   _basketRegistryAddress,
    address   _kycAddress,
    address   _arranger,
    address   _arrangerFeeRecipient,
    uint      _arrangerFee                         // in wei, i.e. 1e18 = 1 ETH
  ) public {
    // Check: "Constructor: invalid number of tokens and weights"
    require(_tokens.length > 0 && _tokens.length == _weights.length);

    name = _name;
    symbol = _symbol;
    tokens = _tokens;
    weights = _weights;

    basketRegistry = IBasketRegistry(_basketRegistryAddress);
    kyc = IKYC(_kycAddress);
    if (_kycAddress != address(0)) {
      kycEnabled = true;
    } else {
      kycEnabled = false;
    }

    arranger = _arranger;
    arrangerFeeRecipient = _arrangerFeeRecipient;
    arrangerFee = _arrangerFee;

    decimals = 18;
  }

  /// @dev Combined deposit of all component tokens (not yet deposited) and bundle
  /// @param  _quantity                            Quantity of basket tokens to mint
  /// @return success                              Operation successful
  function depositAndBundle(uint _quantity) public onlyWhitelistedHolder(msg.sender) payable returns (bool success) {

    for (uint i = 0; i < tokens.length; i++) {
      address t = tokens[i];
      uint w = weights[i];
      ERC20(t).transferFrom(msg.sender, this, w.mul(_quantity).div(10 ** decimals));
    }

    // charging suppliers a fee for every new basket minted
    // skip fees if tokens are minted through swaps
    if (arrangerFee > 0) {
      // Check: "Insufficient ETH for arranger fee to bundle"
      require(msg.value >= arrangerFee.mul(_quantity).div(10 ** decimals));
      arrangerFeeRecipient.transfer(msg.value);
    } else {
      // prevent transfers of unnecessary ether into the contract
      require(msg.value == 0);
    }

    balances[msg.sender] = balances[msg.sender].add(_quantity);
    totalSupply_ = totalSupply_.add(_quantity);

    basketRegistry.incrementBasketsMinted(_quantity, msg.sender);
    emit LogDepositAndBundle(msg.sender, _quantity);
    return true;
  }

  /// @dev Convert basketTokens back to original tokens and transfer to requester
  /// @param  _quantity                            Quantity of basket tokens to convert back to original tokens
  /// @return success                              Operation successful
  function debundleAndWithdraw(uint _quantity) public returns (bool success) {
    require(debundle(_quantity, msg.sender, msg.sender));
    emit LogDebundleAndWithdraw(msg.sender, _quantity);
    return true;
  }

  /// @dev Convert basketTokens back to original tokens and transfer to specified recipient
  /// @param  _quantity                            Quantity of basket tokens to swap
  /// @param  _sender                              Address of transaction sender
  /// @param  _recipient                           Address of token recipient
  /// @return success                              Operation successful
  function debundle(
    uint      _quantity,
    address   _sender,
    address   _recipient
  ) internal returns (bool success) {
    require(balances[_sender] >= _quantity);      // Check: "Insufficient basket balance to debundle"
    // decrease holder balance and total supply by _quantity
    balances[_sender] = balances[_sender].sub(_quantity);
    totalSupply_ = totalSupply_.sub(_quantity);

    // transfer tokens back to _recipient
    for (uint i = 0; i < tokens.length; i++) {
      address t = tokens[i];
      uint w = weights[i];
      ERC20(t).transfer(_recipient, w.mul(_quantity).div(10 ** decimals));
    }

    basketRegistry.incrementBasketsBurned(_quantity, _sender);
    return true;
  }

  /// @dev Allow holder to convert baskets to its underlying tokens and withdraw them individually
  /// @param  _quantity                            quantity of tokens to burn
  /// @return success                              Operation successful
  function burn(uint _quantity) public returns (bool success) {
    balances[msg.sender] = balances[msg.sender].sub(_quantity);
    totalSupply_ = totalSupply_.sub(_quantity);

    // increase outstanding balance of each of the tokens by their weights
    for (uint i = 0; i < tokens.length; i++) {
      address t = tokens[i];
      uint w = weights[i];
      outstandingBalance[msg.sender][t] = outstandingBalance[msg.sender][t].add(w.mul(_quantity).div(10 ** decimals));
    }

    basketRegistry.incrementBasketsBurned(_quantity, msg.sender);
    return true;
  }

  /// @dev Allow holder to withdraw outstanding balances from contract (such as previously paused tokens)
  /// @param  _token                               Address of token to withdraw
  /// @return success                              Operation successful
  function withdraw(address _token) public returns (bool success) {
    uint bal = outstandingBalance[msg.sender][_token];
    require(bal > 0);
    outstandingBalance[msg.sender][_token] = 0;
    ERC20(_token).transfer(msg.sender, bal);

    emit LogWithdraw(msg.sender, _token, bal);
    return true;
  }

  /// @dev Change recipient of arranger fees
  /// @param  _newRecipient                        New fee recipient
  /// @return success                              Operation successful
  function changeArrangerFeeRecipient(address _newRecipient) public onlyArranger returns (bool success) {
    // Check: "New receipient can not be 0x0 or the same as the current recipient"
    require(_newRecipient != address(0) && _newRecipient != arrangerFeeRecipient);
    address oldRecipient = arrangerFeeRecipient;
    arrangerFeeRecipient = _newRecipient;

    emit LogArrangerFeeRecipientChange(oldRecipient, arrangerFeeRecipient);
    return true;
  }

  /// @dev Change amount of fee charged for every basket minted
  /// @param  _newFee                              New fee amount
  /// @return success                              Operation successful
  function changeArrangerFee(uint _newFee) public onlyArranger returns (bool success) {
    uint oldFee = arrangerFee;
    arrangerFee = _newFee;

    emit LogArrangerFeeChange(oldFee, arrangerFee);
    return true;
  }

  /// @dev ERC20 transfer with restrictions on receiver
  /// @param  _to                                  receiver
  /// @param  _value                               value to be transferred
  /// @return success                              Operation successful
  function transfer(address _to, uint256 _value) public onlyWhitelistedHolder(_to) returns (bool) {
    super.transfer(_to, _value);
    return true;
  }

  /// @dev ERC20 transferFrom with restrictions on receiver
  /// @param  _from                                sender
  /// @param  _to                                  receiver
  /// @param  _value                               value to be transferred
  /// @return success                              Operation successful
  function transferFrom(address _from, address _to, uint256 _value) public onlyWhitelistedHolder(_to) returns (bool) {
    super.transferFrom(_from, _to, _value);
    return true;
  }

  /// @dev Check if the basket is kycEnabled and if _address is whitelisted
  /// @return isWhitelisted                        Return if holder is whitelisted
  function isWhitelistedHolder(address _address) public view returns (bool) {
    if (kycEnabled) {
      return kyc.isWhitelistedHolder(_address);
    } else {
      return true;
    }
  }

  /// @dev Fallback to reject any ether sent to contract
  //  Check: "Baskets do not accept ETH transfers"
  function () public payable { revert(); }
}
