require('@babel/register');
if (!global._babelPolyfill) {
  require('@babel/polyfill');
}

const HDWalletProvider = require("truffle-hdwallet-provider");
const token = "...";
const mnemonic = "...";

module.exports = {
  networks: {
    dev: {
      host: 'localhost',
      port: 7545,
      gas: 4600000,
      gasPrice: 20000000000,
      network_id: '*' // Match any network id
    },
    aws: {
      host: '127.0.0.1',
      from: '0x8becae928637a8b682d160c14a750a23e22c697b',
      port: 8545,
      gas: 11520050,
      gasPrice: 20000000000,
      network_id: '15'
    },
    ropsten: {
      host: '127.0.0.1',
      port: 8545,
      gas: 4600000,
      gasPrice: 20000000000,
      network_id: '3'
    },
    ropstenInfura: {
      provider: new HDWalletProvider(mnemonic, "https://ropsten.infura.io/" + token),
      gas: 4600000,
      gasPrice: 20000000000,
      network_id: '3'
    },
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};
