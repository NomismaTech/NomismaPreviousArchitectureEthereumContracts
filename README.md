# This repo is no longer maintained as it was used only in our previous architecture. Our new architecture implements our whitepaper more efficiently and with additional functionality. Not all code from original repo was included in this noe because of private keys
Website: www.nomisma.one
Email: lucasgaylord@protonmail.com



## GETH in private network mode (development/staging)

### Launch GETH in private network mode

required environment variables

```
export RPC_IP=127.0.0.1
export RPC_PORT=8545
```

RPC - stands for standard HTTP provider endpoint.

After defining required environment variables:

```
./network/geth_init.sh
./network/geth.sh
```

`geth_init.sh` is run only once on initial private network data directory generation.

## Running happy path scenario on Ropsten

### Prerequisites
```
truffle
geth
```
### Usage
Run local geth node connected to Ropsten
```
geth --syncmode "light" --testnet --rpc --rpcapi "db,net,web3,personal,eth,admin" --rpccorsdomain "*" --rpcaddr 127.0.0.1 --rpcport 8545
```
You will need 2 ether addresses on Ropsten with non zero ether balance (1 ETH should be enough for running happy path few times).
Unlock these 2 accounts using
```
geth attach http://localhost:8545
personal.unlockAccount(accountAddress, password, 0)
```
Deploy contracts to Ropsten network
```
truffle migrate --network ropsten
```
Execute happy path script
```
truffle exec scripts\happyPath.js --network ropsten
```


