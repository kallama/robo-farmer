import 'dotenv-defaults/config';
import axios from 'axios';
import cliProgress from 'cli-progress';
//import fs from 'fs'
import * as config from './config.json';
import { ethers, BigNumber } from 'ethers';
import { colors } from './libs/colors';
import { getPolygonScanABI } from './libs/polygonscan';
import { Token, Pool, Router, MasterChef, Farm } from './libs/interfaces';

const privateKey: any = String(process.env.PRIVATE_KEY);
const minConfirms = Number(process.env.MIN_CONFIRMS);
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
const gasStationUrl = config.gasStationUrl;

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

const getGasPrice = async (speed: string): Promise<ethers.BigNumber> => {
  // safeLow, standard, fast, fastest
  const response = await axios.get(gasStationUrl);
  const amount = String(response.data[speed]); // up our gas price to do a faster transaction
  const gasPrice = ethers.utils.parseUnits(amount, 'gwei'); // bignumber 9 decimals
  return gasPrice;
};

const getToken = async (address: string): Promise<Token> => {
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
  return { contract, address, symbol, name, decimals, abi };
};

const getMasterChef = async (address: string, pendingFunctionName: string): Promise<MasterChef> => {
  console.log(`Getting polygonscan info for ${address}`);
  const abi = await getPolygonScanABI(address);
  const contract = new ethers.Contract(address, abi, provider);
  const poolsBigNumber: ethers.BigNumber = await contract.poolLength();
  const pools = poolsBigNumber.toNumber();
  return { address, pendingFunctionName, contract, pools, abi };
};

const getPool = async (masterChef: MasterChef, poolId: number): Promise<Pool> => {
  const poolInfo: any = await masterChef.contract.poolInfo(poolId);
  // TODO can poolInfo have a function other than lpToken that returns the address we need?
  const address = poolInfo['lpToken'];
  const pool: Pool = await getToken(address);
  pool.poolId = poolId;
  pool.pair = false;
  // check if lp token
  if (Object.prototype.hasOwnProperty.call(pool.contract, 'factory')) {
    pool.pair = true;
    pool.factory = await pool.contract.factory();
    pool.minimumLiquidity = await pool.contract.MINIMUM_LIQUIDITY();
    pool.token0 = await pool.contract.token0();
    pool.token1 = await pool.contract.token1();
    // TODO make this better
    let routerAddress = '';
    const abi = [
      'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
      'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    ];
    if (pool.factory?.toUpperCase() === config.chains.polygon.swaps.quickswap.factory.toUpperCase()) {
      routerAddress = config.chains.polygon.swaps.quickswap.router;
    }
    if (pool.factory?.toUpperCase() === config.chains.polygon.swaps.sushiswap.factory.toUpperCase()) {
      routerAddress = config.chains.polygon.swaps.sushiswap.router;
    }
    const router: Router = {
      address: routerAddress,
      contract: new ethers.Contract(routerAddress, abi, provider),
    };
    pool.router = router;
  }
  return pool;
};

const buildFarm = async (
  token: Token,
  masterChef: MasterChef,
  strategyArray: Array<{ poolId: number; strategy: string }>,
): Promise<Farm> => {
  const pools = [];
  for (let i = 0; i < strategyArray.length; i++) {
    const pool = await getPool(masterChef, strategyArray[i].poolId);
    pool.strategy = strategyArray[i].strategy;
    pools.push(pool);
  }
  const farm: Farm = {
    token,
    masterChef,
    pools,
  };

  return farm;
};

/*const harvest = async () => {};

const strategyHold = async () => {};

const strategySell = async () => {};

const strategyComp = async () => {};

const strategyHypComp = async () => {};

const swapTokens = async () => {};

const createLiquidity = async () => {};

const addLiquidity = async () => {};*/

const main = async (): Promise<undefined> => {
  const strategyArray = processStrategy(strategy);
  console.log(strategyArray);

  const token = await getToken(tokenAddress).catch(error => {
    console.log(error);
    process.exit();
  });
  const masterChef = await getMasterChef(chefAddress, pendingFunctionName).catch(error => {
    console.log(error);
    process.exit();
  });
  const farm = await buildFarm(token, masterChef, strategyArray);
  console.log(farm);

  /*
  while (true) {
    await harvest()
    await startSleeping(sleep)
  }
  */
  console.log('Hello world!');
  return;
};
main();
