pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";


/**
 * @title KyberNetwork Contract
 * @dev Interface to interact with external KyberNetwork contract
 * https://github.com/KyberNetwork/smart-contracts/blob/master/contracts/KyberNetwork.sol
 */
interface KyberNetwork {
    /**
    * @dev makes a trade between src and dest token and send dest token to destAddress
    * @param src Src token
    * @param srcAmount amount of src tokens
    * @param dest   Destination token
    * @param destAddress Address to send tokens to
    * @param maxDestAmount A limit on the amount of dest tokens
    * @param minConversionRate The minimal conversion rate. If actual rate is lower, trade is canceled.
    * @param walletId is the wallet ID to send part of the fees
    * @return amount of actual dest tokens
    */
    function trade(
        ERC20 src,
        uint srcAmount,
        ERC20 dest,
        address destAddress,
        uint maxDestAmount,
        uint minConversionRate,
        address walletId
    ) external payable returns (uint);

    /**
    * @dev best conversion rate for a pair of tokens
    * @param src Src token
    * @param dest Destination token
    */
    function findBestRate(
        ERC20 src,
        ERC20 dest,
        uint srcQty
    ) external view returns (uint, uint);

    function getExpectedRate(
        ERC20 source,
        ERC20 dest,
        uint srcQty
    ) public view returns (
        uint expectedPrice,
        uint slippagePrice
    );
}
