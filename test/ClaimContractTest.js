/* global web3, contract, beforeEach, it, artifacts */
import {
  duration,
  revert as EVMRevert,
  latestTime
} from 'truffle-test-helpers';
import assert from 'assert';

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const ClaimContact = artifacts.require('./ClaimContract.sol');
const BackingEscrow = artifacts.require('./BackingEscrow.sol');
const TradeToken = artifacts.require('./TradeToken.sol');
const SettlementContract = artifacts.require('./NomismaSettlementContract.sol');

contract('ClaimContact', function (accounts) {
  // TODO this constants should be moved to common place so they can be reused among tests
  const [
    owner,
    userAddress,
    escrow
  ] = accounts;

  const standardRate = 3;

  const optionType = 1;
  const underlyingType = 'ABC';
  const expirationDate = latestTime() + duration.weeks(4);
  const strikePrice = 10;
  const notional = web3.toWei('1', 'ether');
  const premium = web3.toWei('3', 'ether');

  let testToken;

  beforeEach(async function () {
    this.settlementContract = await SettlementContract.new();

    this.claimContract = await ClaimContact.new(
      optionType,
      userAddress,
      escrow,
      underlyingType,
      expirationDate,
      strikePrice,
      notional,
      premium,
      this.settlementContract.address
    );

    const backingEscrowAddress = await this.claimContract.backingEscrow();

    this.backingEscrow = BackingEscrow.at(backingEscrowAddress);
  });

  describe('can deposit funds', function () {
    it('can deposit funds via depositFunds', async function () {
      await this.claimContract.depositFunds({
        from: userAddress,
        value: notional
      }).should.be.fulfilled;
    });

    it('FundsDeposited event is emited on depositFunds call', async function () {
      const { logs } = await this.claimContract.depositFunds({
        from: userAddress,
        value: notional
      });
      const event = logs.find(e => e.event === 'FundsDeposited');
      event.args.amount.should.be.bignumber.equal(notional);
    });

    it('can deposit funds via fallback', async function () {
      await this.claimContract.sendTransaction({
        from: userAddress,
        value: notional
      }).should.be.fulfilled;
    });

    it('backing escrow funds are increased after depositing', async function () {
      await this.claimContract.depositFunds({
        from: userAddress,
        value: notional
      });
      const funds = await this.backingEscrow.funds();
      funds.should.be.bignumber.equal(
        new BigNumber(notional)
      );
    });
  });

  describe('issueTokens', function () {
    it('user can not issue tokens before depositing', async function () {
      await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }).should.be.rejectedWith(EVMRevert);
    });

    it('owner can issues tokens', async function () {
      const rate = 10;
      const underlyingToBase = false;
      const value = new BigNumber(notional).div(new BigNumber(rate));
      await this.claimContract.depositFunds({
        value,
        from: userAddress
      });
      const sufficient = await this.claimContract.checkSufficientBacking(value).should.be.fulfilled;
      assert.ok(sufficient);
      await this.claimContract.issueTokens(
        rate,
        underlyingToBase,
        {
          from: owner
        }).should.be.fulfilled;
    });

    it('tokens can not be issued by improper account', async function () {
      const rate = 10;
      const underlyingToBase = false;
      const value = new BigNumber(notional).div(new BigNumber(rate));
      await this.claimContract.depositFunds({
        value,
        from: userAddress
      });
      const sufficient = await this.claimContract.checkSufficientBacking(value).should.be.fulfilled;
      assert.ok(sufficient);
      await this.claimContract.issueTokens(
        rate,
        underlyingToBase,
        {
          from: userAddress
        }).should.be.rejectedWith(EVMRevert);
    });

    it('rate is set properly on issueTokens call', async function () {
      const rate = 10;
      const underlyingToBase = true;
      const value = new BigNumber(notional).mul(new BigNumber(rate));
      await this.claimContract.depositFunds({
        value,
        from: userAddress
      });
      const sufficient = await this.claimContract.checkSufficientBacking(value).should.be.fulfilled;
      assert.ok(sufficient);
      await this.claimContract.issueTokens(
        rate,
        underlyingToBase,
        {
          from: owner
        });
      const resultRate = await this.claimContract.rate();
      resultRate.should.be.bignumber.equal(rate);
    });

    it('sends proper event on success', async function () {
      const rate = 10;
      const underlyingToBase = true;
      const value = new BigNumber(notional).mul(new BigNumber(rate));
      await this.claimContract.depositFunds({
        value,
        from: userAddress
      });
      const sufficient = await this.claimContract.checkSufficientBacking(value).should.be.fulfilled;
      assert.ok(sufficient);
      const { logs } = await this.claimContract.issueTokens(
        rate,
        underlyingToBase,
        {
          from: owner
        });
      const event = logs.find(e => e.event === 'TokensIssued');
      assert.equal(event.args.beneficiary, userAddress);
      event.args.amount.should.be.bignumber.equal(
        new BigNumber(rate).mul(notional)
      );
    });

    it('amount of tokens issued is correct', async function () {
      const value = new BigNumber(notional).mul(new BigNumber(standardRate));
      await this.claimContract.depositFunds({
        value,
        from: userAddress
      });
      await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: owner
        }
      );
      const tradeToken = TradeToken.at(await this.claimContract.tradeToken());
      const balance = await tradeToken.balanceOf(userAddress);

      balance.should.be.bignumber.equal(
        new BigNumber(
          notional
        ).mul(
          standardRate
        )
      );
    });
  });

  describe('redeemTokens', function () {
    it('able to redeem all tokens for long call', async function () {
      const { logs } = await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }
      );
      const event = logs.find(e => e.event === 'TokensIssued');
      const tokensAmount = event.args.amount;

      await this.claimContract.redeemTokens(
        tokensAmount,
        {
          from: owner
        }).should.be.fulfilled;
    });

    it('address without tokens should not be able to redeem', async function () {
      const { logs } = await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }
      );
      const event = logs.find(e => e.event === 'TokensIssued');
      const tokensAmount = event.args.amount;

      await this.claimContract.redeemTokens(
        tokensAmount,
        {
          from: userAddress
        }).should.be.rejectedWith(EVMRevert);
    });

    it('redeemer should get its premium', async function () {
      const { logs } = await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }
      );
      const event = logs.find(e => e.event === 'TokensIssued');
      const tokensAmount = event.args.amount;

      const ethBalanceBefore = web3.eth.getBalance(owner);
      const gasPrice = web3.toWei('1', 'gwei');
      const { receipt: { gasUsed }} = await this.claimContract.redeemTokens(
        tokensAmount,
        {
          gasPrice,
          from: owner
        });
      const ethBalanceAfter = web3.eth.getBalance(owner);
      const ethBalanceDifference = new BigNumber(
        ethBalanceAfter
      ).sub(
        new BigNumber(
          ethBalanceBefore
        )
      ).add(
        new BigNumber(gasPrice)
          .mul(
            new BigNumber(gasUsed)
          )
      );

      ethBalanceDifference.should.be.bignumber.equal(
        new BigNumber(premium)
      );
    });

    it('beneficiary should get underlying asset', async function () {
      await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }
      );
      await this.claimContract.redeemTokens(
        '1',
        {
          from: owner
        });
      const testTokenAmount = await testToken.balanceOf(owner);
      testTokenAmount.should.be.bignumber.equal(this.underlyingAssetAmount);
    });

    it('beneficiary tokens are burned after redeeming', async function () {
      const { logs } = await this.claimContract.issueTokens(
        standardRate,
        true,
        {
          from: userAddress
        }
      );
      const event = logs.find(e => e.event === 'TokensIssued');
      const tokensAmount = event.args.amount;
      await this.claimContract.redeemTokens(
        tokensAmount,
        {
          from: owner
        });
      const tradeTokenAddress = await this.claimContract.tradeToken();
      const tradeToken = TradeToken.at(tradeTokenAddress);
      const tokenAmount = await tradeToken.balanceOf(owner);
      tokenAmount.should.be.bignumber.equal(0);
    });
  });
});
