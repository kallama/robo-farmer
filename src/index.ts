import 'dotenv-defaults/config';
import cliProgress from 'cli-progress';
//import fs from 'fs'
import * as config from './config.json';
import { ethers, BigNumber } from 'ethers';
//import { colors } from './libs/colors';
import { getPolygonScanABI } from './libs/polygonscan';
import { Token, LPToken, Pool, Router, MasterChef, Farm } from './libs/interfaces';
import { doStrategy } from './libs/strategy';
import { quote } from './libs/1inch';

const privateKey = String(process.env.PRIVATE_KEY);
const MIN_CONFIRMS = Number(process.env.MIN_CONFIRMS);
const hodlTokenAddress = String(process.env.HODL_TOKEN_ADDRESS);
const tokenAddress = String(process.env.TOKEN_ADDRESS);
const chefAddress = String(process.env.CHEF_ADDRESS);
const pendingFunctionName = String(process.env.PENDING_FUNCTION_NAME);
const STRATEGY = String(process.env.STRATEGY);
const validStrategies = config.strategies;
const SLEEP = Number(process.env.SLEEP);
const RPC_URL =
  process.env.CUSTOM_RPC !== '' ? String(process.env.CUSTOM_RPC) : config.chains.polygon.rpcUrl;

if (privateKey.length !== 64) {
  console.log('[!] Error: Invalid Private Key');
  process.exit();
}
const PROVIDER = new ethers.providers.JsonRpcProvider(RPC_URL);
const WALLET = new ethers.Wallet(privateKey, PROVIDER);
const WALLET_ADDRESS = WALLET.address;
//const CMD_LINE_ARGS: string[] = process.argv.slice(2);

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

const startSleeping = async (delay: number): Promise<void> => {
  // eslint-disable-next-line no-undef
  const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
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
  const poolsBigNumber: BigNumber = await contract.poolLength();
  const pools = poolsBigNumber.toNumber();
  return { address, pendingFunctionName, contract, pools, abi };
};

const getLpToken = async (farmToken: Token, address: string): Promise<LPToken> => {
  const token = await getToken(address);
  // check if lp token
  let pair = false;
  if (Object.prototype.hasOwnProperty.call(token.contract, 'factory')) {
    pair = true;
    const factory: string = await token.contract.factory();
    const token0Address: string = await token.contract.token0();
    const token1Address: string = await token.contract.token1();
    const token0: Token =
      token0Address.toUpperCase() === farmToken.address.toUpperCase()
        ? { ...farmToken }
        : await getToken(token0Address);
    const token1: Token =
      token1Address.toUpperCase() === farmToken.address.toUpperCase()
        ? { ...farmToken }
        : await getToken(token1Address);
    // TODO make this better
    let routerAddress = '';
    const abi = [
      'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) external returns (uint amountA, uint amountB, uint liquidity)',
    ];
    if (factory.toUpperCase() === config.chains.polygon.swaps.quickswap.factory.toUpperCase()) {
      routerAddress = config.chains.polygon.swaps.quickswap.router;
    }
    if (factory.toUpperCase() === config.chains.polygon.swaps.sushiswap.factory.toUpperCase()) {
      routerAddress = config.chains.polygon.swaps.sushiswap.router;
    }
    const router: Router = {
      address: routerAddress,
      contract: new ethers.Contract(routerAddress, abi, WALLET),
    };
    const lpToken: LPToken = {
      ...token,
      pair,
      factory,
      router,
      token0,
      token1,
    };
    return lpToken;
  } else {
    // not an LP pair token
    const lpToken: LPToken = {
      ...token,
      pair,
    };
    return lpToken;
  }
};

const getPool = async (
  masterChef: MasterChef,
  farmToken: Token,
  id: number,
  strategy: string,
): Promise<Pool> => {
  const poolInfo: ethers.utils.Result = await masterChef.contract.poolInfo(id);
  // TODO can poolInfo have a function other than lpToken that returns the address we need?
  const lpTokenAddress: string = poolInfo.lpToken;
  const lpToken = await getLpToken(farmToken, lpTokenAddress);
  const pool: Pool = {
    ...lpToken,
    id,
    strategy,
    lpToken,
  };
  return pool;
};

const buildFarm = async (
  token: Token,
  hodlToken: Token,
  masterChef: MasterChef,
  strategyArray: Array<{ poolId: number; strategy: string }>,
): Promise<Farm> => {
  const pools = [];
  for (let i = 0; i < strategyArray.length; i++) {
    const pool = await getPool(
      masterChef,
      token,
      strategyArray[i].poolId,
      strategyArray[i].strategy,
    );
    pools.push(pool);
  }
  const farm: Farm = {
    token,
    hodlToken,
    masterChef,
    pools,
  };

  return farm;
};

const harvest = async (farm: Farm): Promise<void> => {
  const usdcAddress = config.chains.polygon.stables.usdc;
  const usdcDollar = ethers.utils.parseUnits('1', 6);
  for (const pool of farm.pools) {
    console.log(`Checking pool ${pool.id}`);
    // check if you are staked in the pool
    const staked: ethers.utils.Result = await farm.masterChef.contract.userInfo(
      pool.id,
      WALLET_ADDRESS,
    );
    if (staked.amount.isZero()) {
      console.log(`Skipping pool ${pool.id}, you have 0 staked`);
      continue;
    }
    const pendingReward: BigNumber = await farm.masterChef.contract[
      farm.masterChef.pendingFunctionName
    ](pool.id, WALLET_ADDRESS);
    console.log(
      `Pool ${pool.id} pending reward: ${ethers.utils.formatUnits(
        pendingReward,
        farm.token.decimals,
      )} ${farm.token.symbol}`,
    );
    // TODO additional guardrails, like check if pendingReward > 1 USDC
    // TODO make this better
    const quoteData = await quote(farm.token.address, usdcAddress, pendingReward.toString());
    const quoteUSDCAmount = BigNumber.from(quoteData.toTokenAmount);
    if (quoteUSDCAmount.lt(usdcDollar)) {
      console.log(`Pending reward is less than 1 USDC, skipping pool ${pool.id}`);
      continue;
    }
    const tx: ethers.providers.TransactionResponse = await farm.masterChef.contract.deposit(
      pool.id,
      0,
    );
    const receipt: ethers.providers.TransactionReceipt = await tx.wait(MIN_CONFIRMS);
    // Parse and get how much we actually received
    const transferInterface = new ethers.utils.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ]);
    const hash = transferInterface.getEventTopic('Transfer');
    let receivedReward = BigNumber.from(0);
    for (const log of receipt.logs) {
      for (const topic of log.topics) {
        if (hash === topic) {
          const parsed = transferInterface.parseLog(log);
          // is this check really needed?
          if (parsed.args['to'].toUpperCase() === WALLET_ADDRESS.toUpperCase()) {
            receivedReward = parsed.args['value'];
            console.log(
              `Receieved ${ethers.utils.formatUnits(receivedReward, farm.token.decimals)} ${
                farm.token.symbol
              }`,
            );
          }
        }
      }
    }
    if (!receivedReward.isZero()) {
      await doStrategy(farm, pool, receivedReward, PROVIDER, WALLET).catch(error => {
        console.log(error);
      });
    } else {
      console.log(`[!] Received 0 ${farm.token.symbol} from pool ${pool.id}`);
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
    const farm = await buildFarm(token, hodlToken, masterChef, strategyArray);
    while (farm) {
      await harvest(farm);
      await startSleeping(SLEEP);
    }
  } catch (error) {
    console.log(error);
    process.exit();
  }
  console.log('Hello world!');
};
main();
