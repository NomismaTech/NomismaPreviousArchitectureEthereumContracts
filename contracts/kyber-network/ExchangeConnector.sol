pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "./KyberNetworkInterface.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title ExchangeConnector
 * @dev Mapping params between our code and KyberNetwork
 */
contract ExchangeConnector {
    using SafeMath for uint256;
    uint256 public constant MAX_DEST_AMOUNT = 2 ** 256 - 1;
    uint256 public constant MIN_RATE = 1;

    event LogTrade(
        ERC20 src,
        uint256 srcAmount,
        ERC20 dest,
        address destAddress,
        uint256 maxDestAmount,
        uint256 minConversionRate,
        address walletId
    );

    KyberNetwork public kyberNetwork;

    function ExchangeConnector(address kyberNetworkContractAddress) public {
        kyberNetwork = KyberNetwork(kyberNetworkContractAddress);
    }

    /**
     * @dev Trading source currency for destination currency
     * @param srcAsset source asset used to buy
     * @param destAsset destination asset which is bought
     * @param tradeDestAddress address to send destination tokens to
     */
    function trade(
        ERC20 srcAsset,
        ERC20 destAsset,
        address tradeDestAddress
    ) public payable returns (uint) {
        // Making the trade and sending ETH
        uint purchasedAmount = kyberNetwork.trade.value(msg.value)(
            srcAsset, // Source asset ERC20
            msg.value, // Amount of source asset to trade
            destAsset, // Asset to buy
            tradeDestAddress, // Send bought tokens here
            MAX_DEST_AMOUNT, //maxDestAmount
            MIN_RATE, // minConversionRate
            tradeDestAddress //wallet id
        );
        return purchasedAmount;
    }

    /**
     * @dev Returns rate between source currency and destination currency
     * @param srcCurrencyAddress source currency address
     * @param destCurrencyAddress destination currency address
     * @param srcAmount amount of source currency to exchange
     */
    function getExchangeRate(
        address srcCurrencyAddress,
        address destCurrencyAddress,
        uint256 srcAmount
    ) public view returns (uint256) {
        // Mapping currency code to token address
        ERC20 source = ERC20(srcCurrencyAddress);
        ERC20 dest = ERC20(destCurrencyAddress);
        uint expectedPrice;
        uint slippagePrice;
        (expectedPrice, slippagePrice) = kyberNetwork.getExpectedRate(
            source,
            dest,
            srcAmount
        );

        return uint256(expectedPrice);
    }
}
