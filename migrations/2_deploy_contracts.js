const NomismaSettlementContract = artifacts.require("./NomismaSettlementContract.sol");

module.exports = function (deployer, network) {
  if (network !== 'dev') {
    return deployer.deploy(NomismaSettlementContract, "0xD19559B3121c1b071481d8813d5dBcDC5869e2e8");
  }
};
