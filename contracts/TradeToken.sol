pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "zeppelin-solidity/contracts/token/ERC20/BurnableToken.sol";


/**
 * @title TradeToken
 * @dev Trade token issued by ClaimContract
 */
contract TradeToken is MintableToken, BurnableToken {
    string public name = "Trade token";
    string public symbol = "TRT";
    uint8 public decimals = 0;

    uint256 public maturityDate;
    uint256 public strikePrice;
    uint256 public amountNotional;

    function TradeToken(
        uint256 _maturityDate,
        uint256 _strikePrice,
        uint256 _amountNotional
    ) public {
        maturityDate = _maturityDate;
        strikePrice = _strikePrice;
        amountNotional = _amountNotional;
    }

    modifier notExpired(uint256 _time) {
        require(now < _time);
        _;
    }

    function hasExpired() public view returns (bool) {
        return maturityDate < now;
    }

    /**
     * @dev Transfer trade tokens to new address and check if token is not expired
     * @param to address to transfer tokens to
     * @param value amount in WEI to transfer
     */
    function transfer(
        address to,
        uint256 value
    ) public notExpired(maturityDate) returns (bool) {
        return super.transfer(to, value);
    }

    // We need this custom method for burning tokens because original method only can burn tokens of msg.sender
    // when we call burn method from ClaimContract it passes its own address instead of msg.sender.
    // https://ethereum.stackexchange.com/questions/29576
    /**
     * @dev Burns trade tokens after redeeming
     * @param burner address of tokens to burn
     * @param _value amount in WEI to burn
     */
    function burn(address burner, uint256 _value) public {
        require(_value <= balances[burner]);

        balances[burner] = balances[burner].sub(_value);
        totalSupply_ = totalSupply_.sub(_value);
        emit Burn(burner, _value);
        emit Transfer(burner, address(0), _value);
    }
}
