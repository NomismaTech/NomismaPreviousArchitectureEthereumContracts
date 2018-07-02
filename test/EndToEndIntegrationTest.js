/* global web3, contract, beforeEach, it, artifacts */
import {
  duration,
  latestTime
} from 'truffle-test-helpers';

const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const NomismaSettlementContract = artifacts.require('./NomismaSettlementContract.sol');
const ClaimContract = artifacts.require('./ClaimContract.sol');
const BackingEscrow = artifacts.require('./BackingEscrow.sol');
const ERC20 = artifacts.require('./external/zeppelin/ERC20.sol');

contract('Integration test', function (accounts) {
  // TODO this constants should be moved to common place so they can be reused among tests
  const [
    longCallUser,
    shortPutUser,
    signer,
  ] = accounts;

  const standardRate = 3;
  const longCallOptionType = 0;
  const shortPutOptionType = 1;
  const underlyingType = 'EOS';
  const baseCurrency = 'ETH';
  const expirationDate = latestTime() + duration.weeks(4);
  const strikePrice = 10;
  const notional = 10;
  const premium = web3.toWei(0.1, 'ether');
  const collateral = premium * 5;

  beforeEach(async function () {
    this.nsc = await NomismaSettlementContract.new();
    this.longCallClaim = await ClaimContract.new(
      longCallOptionType,
      longCallUser,
      baseCurrency,
      underlyingType,
      expirationDate,
      strikePrice,
      notional,
      premium,
      this.nsc.address,
      {
        from: signer
      });
    this.shortPutClaim = await ClaimContract.new(
      shortPutOptionType,
      shortPutUser,
      baseCurrency,
      underlyingType,
      expirationDate,
      strikePrice,
      notional,
      premium,
      this.nsc.address,
      {
        from: signer
      });
    const longCallbackingEscrowAddress = await this.longCallClaim.backingEscrow();
    const shortPutbackingEscrowAddress = await this.shortPutClaim.backingEscrow();

    this.longCallBackingEscrow = await BackingEscrow.at(longCallbackingEscrowAddress);
    this.shortPutBackingEscrow = await BackingEscrow.at(shortPutbackingEscrowAddress);

    // users deposits to backing escrow
    await this.longCallClaim.depositFunds({
      from: longCallUser,
      value: premium
    });
    await this.shortPutClaim.depositFunds({
      from: shortPutUser,
      value: collateral
    });
  });


  it('Should execute full end to end scenario', async function () {
    // for tests we are manually calling issue tokens as it hard to test with working oraclize
    const { logs: longCallLogs } = await this.longCallClaim.issueTokens(
      standardRate,
      true,
      {
        from: longCallUser
      });
    const longCallIssueEvent = longCallLogs.find(e => e.event === 'TokensIssued');
    const longCallTokensAmount = longCallIssueEvent.args.amount;
    const { logs: shortPutLogs } = await this.shortPutClaim.issueTokens(
      standardRate,
      true,
      {
        from: shortPutUser
      });
    const shortPutEvent = shortPutLogs.find(e => e.event === 'TokensIssued');
    const shortPutTokensAmount = shortPutEvent.args.amount;

    // pairing claim contracts in NSC
    await this.nsc.pairClaimContracts(
      this.longCallClaim.address,
      this.shortPutClaim.address
    );

    // settle claim contrants in NSC
    const nscBackingEscrowAddress = await this.nsc.nscBackingEscrow();
    await this.nsc.settleClaims(nscBackingEscrowAddress);

    const nscBackingEscrow = BackingEscrow.at(nscBackingEscrowAddress);
    const erc20Asset = ERC20.at(await nscBackingEscrow.asset());

    const nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
    const shortPutEscrowBalance = await erc20Asset.balanceOf(
      this.longCallBackingEscrow.address
    );
    const longCallEscrowBalance = await erc20Asset.balanceOf(
      this.shortPutBackingEscrow.address
    );

    // checking escrow balances
    nscEscrowBalance.should.be.bignumber.equal(0);
    shortPutEscrowBalance.should.be.bignumber.equal(10);
    longCallEscrowBalance.should.be.bignumber.equal(1);

    // redeeming tokens
    await this.longCallClaim.redeemTokens(
      longCallTokensAmount,
      {
        from: longCallUser
      });
    await this.shortPutClaim.redeemTokens(
      shortPutTokensAmount,
      {
        from: shortPutUser
      });

    const longCallUserAssetBalance = await erc20Asset.balanceOf(longCallUser);
    const shortPutUserAssetBalance = await erc20Asset.balanceOf(shortPutUser);

    // checking user asset balance after redeeming tokens
    longCallUserAssetBalance.should.be.bignumber.equal(1);
    shortPutUserAssetBalance.should.be.bignumber.equal(10);
  });
});
