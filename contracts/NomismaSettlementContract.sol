pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./BackingEscrow.sol";
import "./ClaimContract.sol";
import "./TradeToken.sol";
import "./kyber-network/ExchangeConnector.sol";


/**
 * @title NomismaSettlementContract
 * @dev Pairing, validating and settling ClaimContract pairs
 * essentially, this contract is tasked with pairing short puts and long calls
 */
contract NomismaSettlementContract is Ownable {
    using SafeMath for uint256;

    uint256 constant public WEI_PRECISION = 10**18;

    ExchangeConnector public exchangeConnector; // ExchangeConnector used to get currency rates and buy ERC20 tokens

    mapping(address => PairPayload) public pairPayloads; // Mapping from NSC BackingEscrow to ClaimContractPair

    // Representation of ClaimContract pair
    struct PairPayload {
        ClaimContract shortPut;
        ClaimContract longCall;
        uint256 purchaseRate;
    }

    event TransferWei(address indexed addr, uint256 value);
    event LogMessage(uint256 message);
    event LogBackingEscrowAddress(address addr);
    event ContractsPaired(
        address indexed longCall,
        address indexed shortPut,
        address backingEscrow,
        uint256 srcTokens,
        uint256 destTokens
    );

    function NomismaSettlementContract(address kyberNetworkContractAddress) public {
        exchangeConnector = new ExchangeConnector(kyberNetworkContractAddress);
    }

    /**
     * @dev Validating ClaimContract pair and buying ERC20 tokens
     * @param longCallClaim Long call ClaimContract
     * @param shortPutClaim Short put ClaimContract
     */
    /* solhint-disable function-max-lines */
    function pairClaimContracts(
        ClaimContract longCallClaim,
        ClaimContract shortPutClaim
    ) public onlyOwner {
        uint256 rate = preparePairingGetRate(longCallClaim, shortPutClaim);
        address nscBackingEscrowAddress = createEscrowTransferFunds(longCallClaim, shortPutClaim, rate);
        BackingEscrow nscBackingEscrow = BackingEscrow(nscBackingEscrowAddress);
//
        uint256 collateralNeeded = longCallClaim.notional().mul(rate).div(WEI_PRECISION);
        // Buying ERC20 tokens from ETH funds of ClaimContract pair
        uint256 purchasedAmount = nscBackingEscrow.buyAsset(
            longCallClaim.baseAddress(),
            collateralNeeded,
            address(exchangeConnector)
        );

        emit ContractsPaired(
            address(longCallClaim),
            address(shortPutClaim),
            nscBackingEscrowAddress,
            collateralNeeded,
            purchasedAmount
        );
    }

    /**
     * @dev Settling ClaimContract pair by sending ERC20 tokens to ClaimContract BackingEscrows
     * @param nscEscrowAddress address of NSC BackingEscrow created when pairing ClaimContracts
     */
    function settleClaims(address nscEscrowAddress) public {
        require(pairPayloads[nscEscrowAddress].longCall != address(0));
        PairPayload memory pairPayload = pairPayloads[nscEscrowAddress];

        ClaimContract longCall = ClaimContract(pairPayload.longCall);
        ClaimContract shortPut = ClaimContract(pairPayload.shortPut);
        BackingEscrow nscBackingEscrow = BackingEscrow(nscEscrowAddress);
        // Checking if ClaimContract pair is not already expired
        require(now < shortPut.expirationDate());

        // Calculating amount of ERC20 tokens to return to short put
        // ClaimContract
        // value(initial collateral deposited) == value(ERC20 tokens)
        uint256 currentRate = exchangeConnector.getExchangeRate(
            longCall.underlyingTypeAddress(),
            longCall.baseAddress(),
            longCall.notional()
        );

        // Initial collateral value
        uint256 underlyingBalance = nscBackingEscrow.underlyingAssetBalance();
        uint256 purchasedCollateralInBase = underlyingBalance.mul(pairPayload.purchaseRate).div(WEI_PRECISION);
        // Current collateral value
        uint256 currentCollateralInBase = underlyingBalance.mul(currentRate).div(WEI_PRECISION);

        if (currentCollateralInBase > purchasedCollateralInBase) {
            // if amount of ERC20 tokens to return to ShortPut ClaimContract
            // is greater than
            // what we have in NSC BackingEscrow we return all from NSC BackingEscrow
            // Sending surplus ERC20 tokens to long call
            uint256 restInBase = currentCollateralInBase - purchasedCollateralInBase;
            uint256 restInUnderlying = restInBase.mul(WEI_PRECISION).div(currentRate);

            nscBackingEscrow.withdrawAssetTo(longCall.backingEscrow(), restInUnderlying);
        }

        // Sending ERC20 rest tokens to short put
        nscBackingEscrow.withdrawAssetTo(shortPut.backingEscrow(), nscBackingEscrow.underlyingAssetBalance());

        // Transferring ownership of BackingEscrows back to ClaimContracts
        BackingEscrow(shortPut.backingEscrow()).transferOwnership(shortPut);
        BackingEscrow(longCall.backingEscrow()).transferOwnership(longCall);
    }

    function validatePairFull(
        ClaimContract longCallClaimContract,
        ClaimContract shortPutClaimContract
    ) public view returns (bool) {
        bool longOptionValid = longCallClaimContract.optionType() == ClaimContract.OptionType.LongCall;
        bool shortOptionValid = shortPutClaimContract.optionType() == ClaimContract.OptionType.ShortPut;

        // Validate if two claim contracts matches together
        bool pairValid = validatePair(
            longCallClaimContract,
            shortPutClaimContract
        );
        return longOptionValid && shortOptionValid && pairValid;
    }

    function preparePairingGetRate(
        ClaimContract longCallClaimContract,
        ClaimContract shortPutClaimContract
    ) public view returns (uint256) {
        require(validatePairFull(longCallClaimContract, shortPutClaimContract));

        // Calculating and validating if both ClaimContracts have enough funds to buy ERC20 tokens
        // Here we use notional as amount even though notional amount
        // would always be higher then actual srcAmount used for purchase
        // The rate to buy amountInBase would always be lower or equal
        // to this rate.
        uint256 rate = exchangeConnector.getExchangeRate(
            longCallClaimContract.underlyingTypeAddress(),
            longCallClaimContract.baseAddress(),
            longCallClaimContract.notional()
        );

        require(validateEscrowFundsCoverage(longCallClaimContract, shortPutClaimContract, rate));
        return rate;
    }

    /**
     * @dev Validating ClaimContract pair
     * @param claimContract1 first ClaimContract
     * @param claimContract2 second ClaimContract
     */
    function validatePair(ClaimContract claimContract1, ClaimContract claimContract2) public view returns (bool) {
        bool strikePriceValid = validateStrikePrice(claimContract1, claimContract2);
        bool expirationDateValid = validateExpirationDate(claimContract1, claimContract2);
        bool notionalValid = validateNotional(claimContract1, claimContract2)
                                && validateOptionType(claimContract1, claimContract2);

        return notionalValid;
    }

    /**
    * @dev Validating if ClaimContract pair has enough ETH to cover the trade
    * @param claimContract1 first ClaimContract
    * @param claimContract2 second ClaimContract
    */
    function validateEscrowFundsCoverage(
        ClaimContract claimContract1,
        ClaimContract claimContract2,
        uint256 rate
    ) public view returns (bool) {
        uint256 collateralNeeded = claimContract1.notional().mul(rate).div(WEI_PRECISION);
        // Calculate sum of two ClaimContracts
        uint256 backingEscrowBalance1 = claimContract1.getBackingEscrowBalance();
        uint256 backingEscrowBalance2 = claimContract2.getBackingEscrowBalance();
        uint256 collateralBacked = backingEscrowBalance1.add(backingEscrowBalance2);

        return collateralBacked >= collateralNeeded;
    }

    function createEscrowTransferFunds(
        ClaimContract longCallClaim,
        ClaimContract shortPutClaim,
        uint256 rate
    ) internal returns (address) {
        BackingEscrow nscBackingEscrow = new BackingEscrow(longCallClaim.underlyingTypeAddress());
        address nscBackingEscrowAddress = address(nscBackingEscrow);

        // Transferring ownership of ClaimContracts BackingEscrow to NSC
        longCallClaim.transferBackingEscrowOwnership(address(this));
        shortPutClaim.transferBackingEscrowOwnership(address(this));

        BackingEscrow backingEscrow1 = longCallClaim.backingEscrow();
        BackingEscrow backingEscrow2 = shortPutClaim.backingEscrow();

        // Transferring funds of ClaimContracts BackingEscrow to NSC BackingEscrow
        backingEscrow1.withdrawFundsToBackingEscrow(nscBackingEscrowAddress);
        backingEscrow2.withdrawFundsToBackingEscrow(nscBackingEscrowAddress);
        // Storing ClaimContract pair information to be used when during settlement
        pairPayloads[nscBackingEscrowAddress] = PairPayload({
            shortPut : shortPutClaim,
            longCall : longCallClaim,
            purchaseRate : rate
            });

        return nscBackingEscrowAddress;
    }

    /**
    * @dev Validating if strikePrices matches
    * @param claimContract1 first ClaimContract
    * @param claimContract2 second ClaimContract
    */
    function validateStrikePrice(
        ClaimContract claimContract1,
        ClaimContract claimContract2
    ) private view returns (bool) {
        return claimContract1.strikePrice() == claimContract2.strikePrice();
    }

    /**
    * @dev Validating if expirationDate matches
    * @param claimContract1 first ClaimContract
    * @param claimContract2 second ClaimContract
    */
    function validateExpirationDate(
        ClaimContract claimContract1,
        ClaimContract claimContract2
    ) private view returns (bool) {
        return claimContract1.expirationDate() == claimContract2.expirationDate();
    }

    /**
    * @dev Validating if notional matches
    * @param claimContract1 first ClaimContract
    * @param claimContract2 second ClaimContract
    */
    function validateNotional(
        ClaimContract claimContract1,
        ClaimContract claimContract2
    ) private view returns (bool) {
        return claimContract1.notional() == claimContract2.notional();
    }

    /**
    * @dev Validating if one contract is short put and other long call
    * @param claimContract1 first ClaimContract
    * @param claimContract2 second ClaimContract
    */
    function validateOptionType(
        ClaimContract claimContract1,
        ClaimContract claimContract2
    ) private view returns (bool) {
        ClaimContract.OptionType cCOneType = claimContract1.optionType();
        ClaimContract.OptionType cCTwoType = claimContract2.optionType();

        bool correctTypeOne = cCOneType == ClaimContract.OptionType.LongCall
            || cCOneType == ClaimContract.OptionType.ShortPut;
        bool correctTypeTwo = cCTwoType == ClaimContract.OptionType.LongCall
            || cCTwoType == ClaimContract.OptionType.ShortPut;
        bool optionTypeDiffer = cCOneType != cCTwoType;

        return correctTypeOne && correctTypeTwo && optionTypeDiffer;
    }


}
