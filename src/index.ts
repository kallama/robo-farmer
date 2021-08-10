import 'dotenv-defaults/config';
import axios from 'axios';
import cliProgress from 'cli-progress';
//import fs from 'fs'
import * as config from './config.json';
import { BigNumber, ethers } from 'ethers';
import { colors } from './libs/colors';
import { getPolygonScanABI } from './libs/polygonscan';
import { Token, Pool, Router, MasterChef, Farm } from './libs/interfaces';

const privateKey: any = String(process.env.PRIVATE_KEY);
const MIN_CONFIRMS = Number(process.env.MIN_CONFIRMS);
const hodlTokenAddress = String(process.env.HODL_TOKEN_ADDRESS);
const tokenAddress = String(process.env.TOKEN_ADDRESS);
const chefAddress = String(process.env.CHEF_ADDRESS);
const pendingFunctionName = String(process.env.PENDING_FUNCTION_NAME);
const STRATEGY = String(process.env.STRATEGY);
const validStrategies = config.strategies;
const SLIPPAGE = Number(process.env.SLIPPAGE);
const SLEEP = Number(process.env.SLEEP);
const RPC_URL = process.env.CUSTOM_RPC !== '' ? String(process.env.CUSTOM_RPC) : config.chains.polygon.rpcUrl;
const PROVIDER: ethers.providers.JsonRpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
const WALLET: ethers.Wallet = new ethers.Wallet(privateKey, PROVIDER);
const WALLET_ADDRESS = WALLET.address;
const CMD_LINE_ARGS: string[] = process.argv.slice(2);
const GAS_STATION_URL = config.gasStationUrl;

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
      poolId: Number(strategyStringArray[i]),
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
  const response = await axios.get(GAS_STATION_URL);
  const amount = String(response.data[speed]); // up our gas price to do a faster transaction
  const gasPrice = ethers.utils.parseUnits(amount, 'gwei'); // bignumber 9 decimals
  return gasPrice;
};

const getToken = async (address: string): Promise<Token> => {
  console.log(`Getting polygonscan info for ${address}`);
  let abi = await getPolygonScanABI(address);
  let contract = new ethers.Contract(address, abi, PROVIDER);
  // check for proxy implementation, get ABI if it exists
  if (typeof contract.implementation === 'function') {
    const implementationAddress: string = await contract.implementation();
    console.log(`Proxy address found, getting ABI`);
    abi = await getPolygonScanABI(implementationAddress);
    contract = new ethers.Contract(address, abi, PROVIDER);
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
  const contract = new ethers.Contract(address, abi, WALLET);
  const poolsBigNumber: ethers.BigNumber = await contract.poolLength();
  const pools = poolsBigNumber.toNumber();
  return { address, pendingFunctionName, contract, pools, abi };
};

const getPool = async (masterChef: MasterChef, poolId: number): Promise<Pool> => {
  const poolInfo = (await masterChef.contract.poolInfo(poolId)) as ethers.utils.Result;
  // TODO can poolInfo have a function other than lpToken that returns the address we need?
  const address = poolInfo.lpToken;
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
      contract: new ethers.Contract(routerAddress, abi, PROVIDER),
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

const harvest = async (farm: Farm): Promise<void> => {
  for (const pool of farm.pools) {
    console.log(`Checking pool ${pool.poolId}`);
    // check if you are staked in the pool
    const staked: ethers.utils.Result = await farm.masterChef.contract.userInfo(pool.poolId, WALLET_ADDRESS);
    if (staked.amount.isZero()) {
      console.log(`Skipping pool ${pool.poolId}, you have 0 staked`);
      continue;
    }
    // TODO additional guardrails, like check if pendingReward > 1 USDC
    const pendingReward = (await farm.masterChef.contract[farm.masterChef.pendingFunctionName](
      pool.poolId,
      WALLET_ADDRESS,
    )) as ethers.BigNumber;
    console.log(
      `Pool ${pool.poolId} pending reward: ${ethers.utils.formatUnits(pendingReward, farm.token.decimals)} ${
        farm.token.symbol
      }`,
    );
    if (pool.poolId === 10) {
      const tx: ethers.providers.TransactionResponse = await farm.masterChef.contract.deposit(pool.poolId, 0);
      const receipt: ethers.providers.TransactionReceipt = await tx.wait(MIN_CONFIRMS);
      const transferInterface = new ethers.utils.Interface([
        'event Transfer(address indexed from, address indexed to, uint256 value)',
      ]);
      // get log from token address, parse and get how much we actually recieved
      for (const log of receipt.logs) {
        if (log.address.toUpperCase() === farm.token.address.toUpperCase()) {
          const parsed = transferInterface.parseLog(log);
          if (parsed.args['to'].toUpperCase() === WALLET_ADDRESS.toUpperCase()) {
            const recievedReward: BigNumber = parsed.args['value'];
            console.log(`You receieved ${ethers.utils.formatUnits(recievedReward, 18)} ${farm.token.symbol}`);
          }
        }
      }
      //
      if (pool.strategy === 'HOLD') {
        console.log(`Using strategy ${pool.strategy}`);
        continue;
      }
    }
  }
};

const main = async (): Promise<void> => {
  const strategyArray = processStrategy(STRATEGY);
  console.log(strategyArray);
  try {
    const token = await getToken(tokenAddress);
    console.log(`Farm Token: ${token.name} (${token.symbol})`);
    const hodlToken = await getToken(hodlTokenAddress);
    console.log(`Hodl Token: ${hodlToken.name} (${hodlToken.symbol})`);
    const masterChef = await getMasterChef(chefAddress, pendingFunctionName);
    const farm = await buildFarm(token, masterChef, strategyArray);
    await harvest(farm);
  } catch (error) {
    console.log(error);
    process.exit();
  }

  /*
  while (true) {
    await harvest(farm)
    await startSleeping(SLEEP)
  }
  */
  console.log('Hello world!');
};
main();
