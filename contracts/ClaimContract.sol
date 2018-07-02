pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./BackingEscrow.sol";
import "./TradeToken.sol";


/**
 * @title ClaimContract
 * @dev Representation of Option object. Holds specification of Option like optionType, notional, strikePrice etc.
 */
contract ClaimContract is Ownable {
    using SafeMath for uint256;

    uint256 constant public WEI_PRECISION = 10**18;

    event TokensIssued(address indexed beneficiary, uint256 amount);
    event FundsDeposited(uint256 amount);

    enum OptionType {LongCall, ShortPut, ShortCall, LongPut}

    BackingEscrow public backingEscrow; // when the user proposes a claim, he/she puts money in an escrow
    TradeToken public tradeToken; // the token will be used for exchange
    address public settlementContractAddress;

    OptionType public optionType; // option type

    uint256 public notional;                   // amount of underlying in its currency (with decimals)
    address public beneficiary;           // pass in either user address or address of NomismaSettlementContract
    address public baseAddress;         // type of the currency to be sold or bet on
    address public underlyingTypeAddress;         // type of the currency to be sold or bet on
    uint256 public expirationDate;            // at which the contract expires
    uint256 public strikePrice;               // price at which the currencies are sold in base currency
    uint256 public premium;                    // premium for the option

    modifier onlySettlement() {
        require(msg.sender == settlementContractAddress);
        _;
    }

    function ClaimContract(
        OptionType _optionType,
        address _beneficiary,
        address _baseAddress,
        address _underlyingTypeAddress,
        uint256 _expirationDate,
        uint256 _strikePrice,
        uint256 _notional,
        uint256 _premium,
        address _settlementContractAddress
    ) public {
        require(_settlementContractAddress != address(0));
        require(_beneficiary != address(0));
        require(_expirationDate > 0);
        require(_strikePrice > 0 && _notional > 0 && _premium > 0);

        optionType = _optionType;
        beneficiary = _beneficiary;
        expirationDate = _expirationDate;
        strikePrice = _strikePrice;
        baseAddress = _baseAddress;
        underlyingTypeAddress = _underlyingTypeAddress;
        notional = _notional;
        premium = _premium;
        settlementContractAddress = _settlementContractAddress;
        backingEscrow = new BackingEscrow(_underlyingTypeAddress);
    }

    function() public payable {
        depositFunds();
    }

    /**
     * @dev Function to issue Trade tokens (TRT)
     * @param underlyingToBaseRate Rate at which the underlying asset would be potentially
     * traded to base rate (Here base rate is Ether and is probably TBC).
     */
    function issueTokens(uint256 underlyingToBaseRate) public onlyOwner {
        require(address(tradeToken) == address(0));
        require(underlyingToBaseRate > 0);

        // Calculating amount in WEI needed to back the trade
        uint256 amountInBase = notional.mul(underlyingToBaseRate).div(WEI_PRECISION);
        assert(amountInBase > 0);
        // Checking if BackingEscrow has enough funds to back the trade
        require(checkSufficientBacking(amountInBase));

        tradeToken = new TradeToken(expirationDate, strikePrice, notional);
        tradeToken.mint(beneficiary, amountInBase);
        emit TokensIssued(beneficiary, amountInBase);
    }

    /**
     * @dev checks if amount in BackingEscrow is sufficient to back trade
     */
    function checkSufficientBacking(uint256 valueInWei) public view returns (bool) {
        if (optionType == OptionType.LongCall) {
            //checking Premium
            return address(backingEscrow).balance >= premium;
        } else if (optionType == OptionType.ShortPut) {
            //checking Collateral in ETH
            return address(backingEscrow).balance >= valueInWei;
            //    } else if (optionType == 3) {// Short call option
            //      //checking ERC20 tokens
            //      return backingEscrow.underlyingAssetBalance() == notional;
            //    } else if (optionType == 4) {// Long put option
            //      //withdrawing Premium
            //      return backingEscrow.balance >= premium;
        } else {
            return false;
        }
    }

    /**
     * @dev Redeeming trade tokens issued by contract previously by sending funds from BackingEscrow to beneficiary
     * @param tokensAmount amount of tokens to redeem
     */
    //TODO implement partial token redeeming
    function redeemTokens(uint256 tokensAmount) public {
        require(address(tradeToken) != address(0));
        require(tradeToken.balanceOf(msg.sender) >= tokensAmount);
        require(!tradeToken.hasExpired());

        backingEscrow.withdrawAll(msg.sender);
        // Burning trade tokens after redeeming
        tradeToken.burn(msg.sender, tokensAmount);
    }

    function transferBackingEscrowOwnership(address newOwner) public onlySettlement {
        require(newOwner != address(0));

        backingEscrow.transferOwnership(newOwner);
    }

    /**
     * @dev Returning balance of ClaimContract's BackingEscrow
     */
    function getBackingEscrowBalance() public view returns (uint256) {
        return address(backingEscrow).balance;
    }

    /**
     * @dev Forwarding funds deposited to ClaimContract to BackingEscrow
     */
    function depositFunds() public payable {
        backingEscrow.depositFunds.value(msg.value)();
        emit FundsDeposited(msg.value);
    }
}
