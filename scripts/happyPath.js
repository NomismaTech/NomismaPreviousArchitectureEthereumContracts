const BigNumber = web3.BigNumber;

require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

const ClaimContract = artifacts.require("./ClaimContract.sol");
const BackingEscrow = artifacts.require("./BackingEscrow.sol");
const TradeToken = artifacts.require("./TradeToken.sol");
const ERC20 = artifacts.require("./external/zeppelin/ERC20.sol");

const NomismaSettlementContract = artifacts.require("NomismaSettlementContract");
const ExchangeConnector = artifacts.require("ExchangeConnector");

//TODO move to separat js filee
const promisify = (inner) =>
  new Promise((resolve, reject) =>
    inner((err, res) => {
      if (err) { reject(err) }

      resolve(res);
    })
  );


// TODO refactor and extract common logic with EndToEndIntegrationTest.js
module.exports = async function(callback) {
  const accounts = await promisify(cb => web3.eth.getAccounts(cb));
  const longCallUser = accounts[0];
  const shortPutUser = accounts[1];

  const longCallOptionType = 0;
  const shortPutOptionType = 1;
  const baseAddress = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const underlyingTypeAddress = "0x4bfba4a8f28755cb2061c413459ee562c6b9c51b";
  const expirationDate = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 60 * 60 * 24;
  const strikePrice = 10;
  const notional = web3.toWei(0.1, 'ether');
  const premium = web3.toWei(0.01, 'ether');
  const collateral = premium * 5;

  let exchangeConnector;
  let longCallClaim;
  let shortPutClaim;
  let nsc;
  let longCallBackingEscrow;
  let shortPutBackingEscrow;

  nsc = await NomismaSettlementContract.deployed();
  exchangeConnector = ExchangeConnector.at(await nsc.exchangeConnector());

  console.log("Creating Claim Contracts...");
  longCallClaim = await ClaimContract.new(
      longCallOptionType,
      shortPutUser,
      baseAddress,
      underlyingTypeAddress,
      expirationDate,
      strikePrice,
      notional,
      premium,
      nsc.address,
      {from: longCallUser});

  shortPutClaim = await ClaimContract.new(
      shortPutOptionType,
      longCallUser,
      baseAddress,
      underlyingTypeAddress,
      expirationDate,
      strikePrice,
      notional,
      premium,
      nsc.address,
      {from: shortPutUser});

  const longCallBackingEscrowAddress = await longCallClaim.backingEscrow();
  const shortPutBackingEscrowAddress = await shortPutClaim.backingEscrow();

  longCallBackingEscrow = BackingEscrow.at(longCallBackingEscrowAddress);
  shortPutBackingEscrow = BackingEscrow.at(shortPutBackingEscrowAddress);

  console.log("Long call backing escrow address = %s", longCallBackingEscrowAddress);
  console.log("Short put escrow address = %s", shortPutBackingEscrowAddress);
  // users deposits to backing escrow
  console.log("Depositing funds to escrows...");
  await Promise.all([
    await longCallBackingEscrow.depositFunds({from: longCallUser, value: premium}),
    await shortPutBackingEscrow.depositFunds({from: shortPutUser, value: collateral}),
  ]);

  console.log("Issuing tokens...");
  const underlyingToBaseRate = await exchangeConnector.getExchangeRate(underlyingTypeAddress, baseAddress, collateral);
  console.log("underlyingToBaseRate = %s", underlyingToBaseRate);
  await Promise.all([
    await longCallClaim.issueTokens(underlyingToBaseRate, {from: longCallUser}),
    await shortPutClaim.issueTokens(underlyingToBaseRate, {from: shortPutUser}),
  ]);
  const tradeToken = TradeToken.at(await longCallClaim.tradeToken());
  let tradeTokenBalance = await tradeToken.balanceOf(shortPutUser);
  console.log("has expired = %s", await tradeToken.hasExpired());
  console.log("minting finished = %s", await tradeToken.mintingFinished());
  console.log("owner = %s", await longCallClaim.address);
  console.log("longClaim address  = %s", await tradeToken.owner());
  console.log("beneficiary = %s", await longCallClaim.beneficiary());
  console.log("trade token balance = %s", tradeTokenBalance);

  // pairing claim contracts in NSC
  console.log("Pairing claim contracts...");
  const {logs} = await nsc.pairClaimContracts(await longCallClaim.address, await shortPutClaim.address);
  console.log("Pairing claim contracts...");
  const event = await logs.find(e => e.event === 'ContractsPaired');
  const nscBackingEscrowAddress = event.args.backingEscrow;
  console.log("NSC escrow address = %s", nscBackingEscrowAddress);
  console.log("collateralNeeded = %s", event.args.srcTokens);
  console.log("purchasedAmount = %s", event.args.destTokens);
  const nscBackingEscrow = BackingEscrow.at(nscBackingEscrowAddress);
  const erc20Asset = ERC20.at(await nscBackingEscrow.asset());
  let nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
  console.log("NSC escrow balance = %s", nscEscrowBalance);

  // settle claim contrants in NSC
  console.log("Settling claim contracts...");

  await nsc.settleClaims(nscBackingEscrowAddress);

  nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
  let shortPutEscrowBalance = await erc20Asset.balanceOf(shortPutBackingEscrowAddress);
  let longCallEscrowBalance = await erc20Asset.balanceOf(longCallBackingEscrowAddress);
  console.log("NSC escrow balance = %s", nscEscrowBalance);
  console.log("Long call escrow balance = %s", longCallEscrowBalance);
  console.log("Short put escrow balance = %s", shortPutEscrowBalance);

  // checking escrow balance
  shortPutEscrowBalance.should.not.be.bignumber.equal(0);

  // redeeming tokens
  console.log("Redeeming tokens...");
  await Promise.all([
    await longCallClaim.redeemTokens(tradeTokenBalance, {from: shortPutUser}),
    await shortPutClaim.redeemTokens(tradeTokenBalance, {from: longCallUser}),
  ]);

  nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
  shortPutEscrowBalance = await erc20Asset.balanceOf(shortPutBackingEscrowAddress);
  longCallEscrowBalance = await erc20Asset.balanceOf(longCallBackingEscrowAddress);
  console.log("NSC escrow balance = %s", nscEscrowBalance);
  console.log("Long call escrow balance = %s", longCallEscrowBalance);
  console.log("Short put escrow balance = %s", shortPutEscrowBalance);

  nscEscrowBalance = await erc20Asset.balanceOf(nscBackingEscrowAddress);
  const longCallUserAssetBalance = await erc20Asset.balanceOf(longCallUser);
  const shortPutUserAssetBalance = await erc20Asset.balanceOf(shortPutUser);
  console.log("NSC escrow balance = %s", nscEscrowBalance);
  console.log("Long call user balance = %s", longCallUserAssetBalance);
  console.log("Short put user balance = %s", shortPutUserAssetBalance);

  // checking user asset balance after redeeming tokens
  shortPutUserAssetBalance.should.not.be.bignumber.equal(0);
  console.log("Test executed successfully.");
};