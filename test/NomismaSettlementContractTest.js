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


contract('NomismaSettlementContract', function (accounts) {
  // TODO this constants should be moved to common place so they can be reused among tests
  const optionType1 = 0;
  const optionType2 = 1;
  const userAddress = accounts[0];
  const underlyingType = 'EOS';
  const baseCurrency = 'ETH';
  const expirationDate = latestTime() + duration.weeks(4);
  const strikePrice = 10;
  const notional = 10;
  const premium = web3.toWei(0.1, 'ether');

  beforeEach(async function () {
    this.nsc = await NomismaSettlementContract.new();

    this.claimContract1 = await ClaimContract.new(
      optionType1,
      userAddress,
      baseCurrency,
      underlyingType,
      expirationDate,
      strikePrice,
      notional,
      premium,
      this.nsc.address
    );
    this.claimContract2 = await ClaimContract.new(
      optionType2,
      userAddress,
      baseCurrency,
      underlyingType,
      expirationDate,
      strikePrice,
      notional,
      premium,
      this.nsc.address
    );

    const backingEscrowAddress1 = await this.claimContract1.backingEscrow();
    const backingEscrowAddress2 = await this.claimContract2.backingEscrow();

    this.backingEscrow1 = await BackingEscrow.at(backingEscrowAddress1);
    this.backingEscrow2 = await BackingEscrow.at(backingEscrowAddress2);

    await this.backingEscrow1.depositFunds({
      from: userAddress,
      value: premium
    });
    await this.backingEscrow2.depositFunds({
      from: userAddress,
      value: premium * 2
    });
  });

  it('Can pair claim contracts', async function () {
    await this.nsc.pairClaimContracts(
      this.claimContract1.address,
      this.claimContract2.address
    ).should.be.fulfilled;
  });

  it('Claim contracts are valid pair', async function () {
    const valid = await this.nsc.validatePair(
      this.claimContract1.address,
      this.claimContract2.address
    );
    assert.ok(valid);
  });

  it('After pairing contracts nscBackingEscrow has proper amount of eth deposited', async function () {
    await this.nsc.pairClaimContracts(
      this.claimContract1.address,
      this.claimContract2.address
    );

    const nscBackingEscrowAddress = await this.nsc.nscBackingEscrow();
    const nscEscrowBalance = web3.eth.getBalance(nscBackingEscrowAddress);

    nscEscrowBalance.should.be.bignumber.equal(
      new BigNumber(premium)
        .mul(3)
    );
  });

  it('Should settle claims', async function () {
    await this.nsc.pairClaimContracts(
      this.claimContract1.address,
      this.claimContract2.address
    );
    const nscBackingEscrowAddress = await this.nsc.nscBackingEscrow();
    await this.nsc.settleClaims(nscBackingEscrowAddress);

    const nscBackingEscrow = BackingEscrow.at(nscBackingEscrowAddress);
    const erc20Asset = ERC20.at(await nscBackingEscrow.asset());
    const backingEscrowAddress1 = await this.claimContract1.backingEscrow();
    const backingEscrowAddress2 = await this.claimContract2.backingEscrow();

    const nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
    const shortPutEscrowBalance = await erc20Asset.balanceOf(backingEscrowAddress1);
    const longCallEscrowBalance = await erc20Asset.balanceOf(backingEscrowAddress2);

    nscEscrowBalance.should.be.bignumber.equal(0);
    shortPutEscrowBalance.should.be.bignumber.equal(10);
    longCallEscrowBalance.should.be.bignumber.equal(1);
  });
});
