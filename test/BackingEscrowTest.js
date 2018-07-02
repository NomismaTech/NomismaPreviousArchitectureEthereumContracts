/* global web3, contract, beforeEach, it, artifacts */
const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const BackingEscrow = artifacts.require('./BackingEscrow.sol');
const MintableToken = artifacts.require('./MintableToken.sol');
const DSToken = artifacts.require('./DSToken.sol');


contract('BackingEscrow', function (accounts) {
  const owner = accounts[0];
  const beneficiary = accounts[1];
  const amountToDeposit = web3.toWei(0.1, 'ether');

  let backingEscrow;

  describe('DS implementation', function () {
    beforeEach(async function () {
      this.asset = await DSToken.new();
      this.assetAddress = this.asset.address;
      backingEscrow = await BackingEscrow.new(this.assetAddress);
    });

    describe('asset', function () {
      it('can set asset', async function () {
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
      });

      it('can show underlying asset balance properly', async function () {
        await this.asset.mint(
          backingEscrow.address,
          amountToDeposit,
          {
            from: owner
          }).should.be.fulfilled;
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
        const balance = await backingEscrow.underlyingAssetBalance();
        balance.should.be.bignumber.equal(amountToDeposit);
      });

      it('can withdraw asset', async function () {
        await this.asset.mint(
          backingEscrow.address,
          amountToDeposit,
          {
            from: owner
          }).should.be.fulfilled;
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
        await backingEscrow.withdrawAssetTo(
          beneficiary,
          amountToDeposit,
          {
            from: owner
          }
        ).should.be.fulfilled;
      });
    });
  });

  describe('Zeppelin implementation', function () {
    beforeEach(async function () {
      this.asset = await MintableToken.new();
      this.assetAddress = this.asset.address;
      backingEscrow = await BackingEscrow.new(this.assetAddress);
    });

    describe('asset', function () {
      it('can set asset', async function () {
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
      });

      it('can show underlying asset balance properly', async function () {
        await this.asset.mint(
          backingEscrow.address,
          amountToDeposit,
          {
            from: owner
          }).should.be.fulfilled;
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
        const balance = await backingEscrow.underlyingAssetBalance();
        balance.should.be.bignumber.equal(amountToDeposit);
      });

      it('can withdraw asset', async function () {
        await this.asset.mint(
          backingEscrow.address,
          amountToDeposit,
          {
            from: owner
          }).should.be.fulfilled;
        await backingEscrow.setAsset(this.assetAddress, {
          from: owner
        }).should.be.fulfilled;
        await backingEscrow.withdrawAssetTo(
          beneficiary,
          amountToDeposit,
          {
            from: owner
          }
        ).should.be.fulfilled;
      });
    });

    describe('general', function() {
      it('can deposit funds', async function () {
        await backingEscrow.depositFunds({
          from: owner,
          value: amountToDeposit
        }).should.be.fulfilled;
      });

      it('can withdraw funds', async function () {
        await backingEscrow.depositFunds({
          from: owner,
          value: amountToDeposit
        });
        await backingEscrow.withdrawFunds(
          beneficiary,
          amountToDeposit,
          {
            from: owner
          }).should.be.fulfilled;
      });

      it('can withdraw all funds', async function () {
        await backingEscrow.depositFunds({
          from: owner,
          value: amountToDeposit
        });
        const balanceBefore = web3.eth.getBalance(beneficiary);
        await backingEscrow.withdrawFunds(
          beneficiary,
          amountToDeposit,
          {from: owner}
        );
        const balanceAfter = web3.eth.getBalance(beneficiary);
        balanceAfter.sub(balanceBefore).should.be.bignumber.equal(amountToDeposit);
      });

      it('deposit balance increases for deposited amount', async function () {
        const initialEscrowBalance = web3.eth.getBalance(
          backingEscrow.address
        );

        await backingEscrow.depositFunds({
          from: owner,
          value: amountToDeposit
        });
        const postDepositEscrowBalance = web3.eth.getBalance(backingEscrow.address);
        postDepositEscrowBalance.sub(initialEscrowBalance).should.be.bignumber.equal(amountToDeposit);
      });
    });
  });


});
