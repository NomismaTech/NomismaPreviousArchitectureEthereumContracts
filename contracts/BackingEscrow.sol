pragma solidity ^0.4.21;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "./kyber-network/ExchangeConnector.sol";


/**
 * @title BackingEscrow
 * @dev Escrow to hold funds in ETH and ERC20 tokens
 */
contract BackingEscrow is Ownable {
    using SafeMath for uint256;

    ERC20 public asset; // underlying asset for put option
    uint256 public funds; // escrow ETH balance in WEI

    event Deposit(uint256 value);
    event FundsTransfer(address withdrawTo, uint256 value);
    event AssetTransfer(address asset, address to, uint256 value);

    function BackingEscrow(address _assetAddress) public {
        setAsset(_assetAddress);
    }

    function () external payable {
        depositFunds();
    }

    /**
      * @dev Depositing funds in ETH
      */
    function depositFunds() public payable {
        require(msg.value > 0);

        funds = funds.add(msg.value);
        emit Deposit(msg.value);
    }

    function withdraw(address beneficiary, uint256 amount) public onlyOwner {
        withdrawFunds(beneficiary, amount);
        withdrawAssetTo(beneficiary, underlyingAssetBalance());
    }

    /**
      * @dev Withdrawing both ETH and ERC20 tokens
      * @param withdrawTo address to withdraw to
      */
    function withdrawAll(address withdrawTo) public onlyOwner {
        withdrawFunds(withdrawTo, funds);
        withdrawAssetTo(withdrawTo, underlyingAssetBalance());
    }

    /**
      * @dev Withdrawing ETH
      * @param withdrawTo address to withdraw to
      */
    function withdrawFunds(address withdrawTo, uint256 amount) public onlyOwner {
        require(funds >= amount);
        funds -= amount;
        withdrawTo.transfer(amount);
        emit FundsTransfer(withdrawTo, amount);
    }

    /**
      * @dev Withdrawing ETH to other BackingEscrow
      * @param backingEscrowAddress address of other BackingEscrow to withdraw to
      */
    function withdrawFundsToBackingEscrow(address backingEscrowAddress) public onlyOwner {
        BackingEscrow escrow = BackingEscrow(backingEscrowAddress);
        uint256 amountToWithdraw = funds;
        funds = 0;
        escrow.depositFunds.value(amountToWithdraw)();
        emit FundsTransfer(backingEscrowAddress, amountToWithdraw);
    }

    /**
      * @dev Withdrawing ERC20 tokens to other BackingEscrow
      * @param withdrawTo address to withdraw to
      * @param amountToWithdraw uint256 amount to withdraw
      */
    function withdrawAssetTo(address withdrawTo, uint256 amountToWithdraw) public onlyOwner {
        require(asset.transfer(withdrawTo, uint(amountToWithdraw)));
        emit AssetTransfer(address(asset), withdrawTo, amountToWithdraw);
    }

    /**
      * @dev Balance of ERC20 tokens stored in BackingEscrow
      */
    function underlyingAssetBalance() public view returns (uint256) {
        return asset.balanceOf(this);
    }

    /**
      * @dev Buying ERC20 tokens using external exchange by sending ETH funds from BackingEscrow
      * @param srcAsset source asset address
      * @param srcAmount amount in WEI to send for trade
      * @param exchangeConnectorAddress address external exchange connector
      */
    function buyAsset(
        address srcAsset,
        uint256 srcAmount,
        address exchangeConnectorAddress
    ) public onlyOwner returns (uint) {
        require(srcAmount <= funds);
        ExchangeConnector exchangeConnector = ExchangeConnector(exchangeConnectorAddress);
        funds -= srcAmount;
        // making a trade
        uint purchasedAmount = exchangeConnector.trade.value(srcAmount)(
            ERC20(srcAsset),
            asset,
            address(this)
        );

        return purchasedAmount;
    }

    /**
      * @dev Setting ERC20 token address
      * @param _asset ERC20 token address
      */
    function setAsset(address _asset) public onlyOwner {
        require(_asset != address(0));
        asset = ERC20(_asset);
    }
}
