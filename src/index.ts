import 'dotenv-defaults/config';
import axios from 'axios';
import cliProgress from 'cli-progress';
//import fs from 'fs'
import * as config from './config.json';
import { ethers } from 'ethers';
import { colors } from './libs/colors';

const privateKey: any = String(process.env.PRIVATE_KEY);
const polygonScanUrl = config.chains.polygon.polygonScanUrl;
const polygonScanApiKey = String(process.env.POLYGONSCAN_API_KEY);
const minConfirms = Number(process.env.MIN_CONFIRMs);
const hodlTokenAddress = String(process.env.HODL_TOKEN_ADDRESS);
const tokenAddress = String(process.env.TOKEN_ADDRESS);
const chefAddress = String(process.env.CHEF_ADDRESS);
const pendingFunctionName = String(process.env.PENDING_FUNCTION_NAME);
const strategy = String(process.env.STRATEGY);
const validStrategies = config.strategies;
const slippage = Number(process.env.SLIPPAGE);
const sleep = Number(process.env.SLEEP);
const rpcUrl = process.env.CUSTOM_RPC !== '' ? String(process.env.CUSTOM_RPC) : config.chains.polygon.rpcUrl;
const provider: ethers.providers.JsonRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
const wallet: ethers.Wallet = new ethers.Wallet(privateKey, provider);
const walletAddress = wallet.address;
const cmdLineArgs: string[] = process.argv.slice(2);
const gasStationUrl = 'https://gasstation-mainnet.matic.network';
const oneInchUrl = 'https://api.1inch.exchange/v3.0/1/';

/*const processArguments = async (arg: string[]): Promise<string> => {
  return 'world';
};*/

const processStrategy = (strategy: string): Array<{ poolId: number; strategy: string }> => {
  const strategyStringArray = strategy.split(',');
  const strategyArray: Array<{ poolId: number; strategy: string }> = [];
  for (let i = 0; i < strategyStringArray.length; i += 2) {
    const found = validStrategies.includes(strategyStringArray[i + 1]);
    if (!found) {
      console.log(`[!] Error: ${strategyStringArray[i + 1]} is not valid`);
      process.exit();
    }
    strategyArray.push({
      poolId: i,
      strategy: strategyStringArray[i + 1],
    });
  }
  return strategyArray;
};

const startSleeping = async (delay: number): Promise<boolean> => {
  // eslint-disable-next-line no-undef
  const sleep = (ms: number): Promise<string> => new Promise<string>(resolve => setTimeout(resolve, ms));
  const sleepBar = new cliProgress.SingleBar({
    format: 'Sleep Timer ' + '[{bar}]' + ' {percentage}% || {value}/{total} Minutes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  });
  console.log(`Sleeping for ${delay} minutes...`);
  sleepBar.start(delay, 0);
  for (let i = 0; i < delay; i++) {
    sleepBar.increment();
    await sleep(1 * 60 * 1000);
  }
  sleepBar.stop();
  return true;
};

const getPolygonScanABI = async (address: string): Promise<string> => {
  const url = polygonScanUrl + address + '&apikey=' + polygonScanApiKey;
  try {
    const response = await axios.get(url);
    if (response.status !== 200) {
      console.log(`[!] Error: Response Code is ${response.status}`);
      throw new Error(response.data);
    } else if (Number(response.data.status) !== 1) {
      console.log(`[!] Error: ${response.data.result}`);
      throw new Error(response.data.result);
    }
    console.log(`[!] ABI found for ${address}`);
    const abi: string = response.data.result;
    return abi;
  } catch (error) {
    throw new Error(error);
  }
};

const getGasPrice = async (speed: string): Promise<ethers.BigNumber> => {
  // safeLow, standard, fast, fastest
  const response = await axios.get(gasStationUrl);
  const amount = String(response.data[speed]); // up our gas price to do a faster transaction
  const gasPrice = ethers.utils.parseUnits(amount, 'gwei'); // bignumber 9 decimals
  return gasPrice;
};

const getToken = async (
  address: string,
): Promise<{
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  abi: string;
  contract: ethers.Contract;
}> => {
  console.log(`Getting polygonscan info for ${address}`);
  let abi = await getPolygonScanABI(address);
  let contract = new ethers.Contract(address, abi, provider);
  // check for proxy implementation, get ABI if it exists
  if (typeof contract.implementation === 'function') {
    const implementationAddress: string = await contract.implementation();
    console.log(`[!] Proxy address found, getting ABI`);
    abi = await getPolygonScanABI(implementationAddress);
    contract = new ethers.Contract(address, abi, provider);
  }
  // get contract information
  const symbol: string = await contract.symbol();
  const name: string = await contract.name();
  const decimals: number = await contract.decimals();
  return { address, symbol, name, decimals, abi, contract };
};

const getMasterChef = async (
  address: string,
  pendingFunctionName: string,
): Promise<{ address: string; pendingFunctionName: string; abi: string; contract: ethers.Contract }> => {
  console.log(`Getting polygonscan info for ${address}`);
  const abi = await getPolygonScanABI(address);
  const contract = new ethers.Contract(address, abi, provider);
  return { address, pendingFunctionName, abi, contract };
};

const getPoolInfo = async (contract: ethers.Contract, poolId: number): Promise<object> => {
  return {};
};

const harvest = async () => {};

const strategyHold = async () => {};

const strategySell = async () => {};

const strategyComp = async () => {};

const strategyHypComp = async () => {};

const swapTokens = async () => {};

const createLiquidity = async () => {};

const addLiquidity = async () => {};

const main = async (): Promise<undefined> => {
  const strategyArray = processStrategy(strategy);
  console.log(strategyArray);
  //await startSleeping(sleep)
  /*const token = await getToken('0xaa9654becca45b5bdfa5ac646c939c62b527d394').catch(error => {
    console.log(error);
    process.exit();
  });
  const masterChef = await getMasterChef('0x1948abc5400aa1d72223882958da3bec643fb4e5', pendingFunctionName).catch(
    error => {
      console.log(error);
      process.exit();
    },
  );
  */

  console.log('Hello world!');
  return;
};
main();
