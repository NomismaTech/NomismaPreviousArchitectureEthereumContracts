require('chai')
  .use(require('chai-as-promised'))
  .should();

const NomismaSettlementContract = artifacts.require("NomismaSettlementContract");
const ExchangeConnector = artifacts.require("ExchangeConnector");

module.exports = async function(callback) {
  let nsc = await NomismaSettlementContract.deployed();
  const exAddress = await nsc.exchangeConnector();
  let exchangeConnector = await ExchangeConnector.at(exAddress);

  const srcAmmount = web3.toWei(1, "ether");
  const ETH_CODE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const OMG_CODE = "0x4bfba4a8f28755cb2061c413459ee562c6b9c51b";

  const rate = await exchangeConnector.getExchangeRate(OMG_CODE, ETH_CODE, srcAmmount);
  console.log("Exchange rate = " + rate.toString());

  // await exchangeConnector.trade(
  //   ETH_CODE,
  //   OMG_CODE,
  //   destinationAddress,
  //   {
  //     from: destinationAddress,
  //     value: srcAmmount,
  //     gas: 4600000,
  //     gasPrice: web3.toWei(20, "gwei")
  //   }
  // );
  //

  console.log("Trade executed successfully.");
};