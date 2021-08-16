import { ethers, BigNumber } from 'ethers';
import axios from 'axios';
import config from '../config';
import { quote, swap } from './1inch';
import { Farm, Pool, Token } from './interfaces';

const getGasPrice = async (speed: string): Promise<BigNumber> => {
  // safeLow, standard, fast, fastest
  const response = await axios.get(config.POLYGON.GASSTATION_URL);
  const amount: number = response.data[speed]; // up our gas price to do a faster trade
  const gasPrice = ethers.utils.parseUnits(amount.toString(), 'gwei'); // bignumber 9 decimals
  return gasPrice; // bignumber
};

export const doStrategy = async (
  farm: Farm,
  pool: Pool,
  amount: BigNumber,
  WALLET: ethers.Wallet,
): Promise<void> => {
  console.log(`Using strategy ${pool.strategy}`);

  const addLiquidity = async (
    amount0: BigNumber,
    amount1: BigNumber,
    pool: Pool,
  ): Promise<void> => {
    if (!pool.lpToken.router || !pool.lpToken.token0 || !pool.lpToken.token1)
      throw new Error('undefined values');
    console.log(`Creating liquidity for pool ${pool.id}`);
    const amount0Min = amount0.mul(90).div(100); // 10% less
    const amount1Min = amount1.mul(90).div(100); // 10% less
    let tx: ethers.providers.TransactionResponse = await pool.lpToken.router.contract.addLiquidity(
      pool.lpToken.token0.address,
      pool.lpToken.token1.address,
      amount0,
      amount1,
      amount0Min,
      amount1Min,
      WALLET.address,
      Date.now() + 1000 * 60 * 20, // max execution time 20 minutes
    );
    let receipt: ethers.providers.TransactionReceipt = await tx.wait(config.CONFIRMS_MIN);
    // Parse and get how much we actually received
    const transferInterface = new ethers.utils.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ]);
    const hash = transferInterface.getEventTopic('Transfer');
    const logs = receipt.logs;
    let receivedAmount = BigNumber.from(0);
    for (const log of logs) {
      for (const topic of log.topics) {
        if (hash === topic) {
          const parsed = transferInterface.parseLog(log);
          if (parsed.args['to'].toUpperCase() === WALLET.address.toUpperCase()) {
            receivedAmount = parsed.args['value'];
            console.log(
              `Receieved ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${
                pool.lpToken.symbol
              }`,
            );
          }
        }
      }
    }
    if (receivedAmount.isZero()) {
      throw new Error('[!] Error: Receieved 0 liqudity');
    }
    console.log(
      `Depositing ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${
        pool.lpToken.symbol
      } to pool ${pool.id}`,
    );
    tx = await farm.masterChef.contract.deposit(pool.id, receivedAmount);
    receipt = await tx.wait(config.CONFIRMS_MIN);
    console.log(
      `Deposited ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${
        pool.lpToken.symbol
      } to pool ${pool.id}`,
    );
  };

  const strategyHold = (): void => {
    return;
  };

  const strategySell = async (
    fromToken: Token,
    toToken: Token,
    amount: BigNumber,
  ): Promise<BigNumber> => {
    if (typeof toToken === 'undefined') throw new Error(`[!] Error: toToken can't be undefined`);
    const tx = await swap(fromToken.address, toToken.address, amount.toString(), WALLET.address);
    tx.gasPrice = await getGasPrice('standard');
    // increase gasLimit by 50%, ethers doesn't provide enough normally
    tx.gasLimit = await WALLET.estimateGas(tx);
    tx.gasLimit = tx.gasLimit.mul(150).div(100);
    const response = await WALLET.sendTransaction(tx);
    const receipt = await response.wait(config.CONFIRMS_MIN);
    console.log('Swap transaction completed');
    const transferInterface = new ethers.utils.Interface([
      'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)',
    ]);
    const hash = transferInterface.getEventTopic('Swapped');
    let receivedAmount = BigNumber.from(0);
    for (const log of receipt.logs) {
      for (const topic of log.topics) {
        if (hash === topic) {
          const parsed = transferInterface.parseLog(log);
          const soldAmount = parsed.args['spentAmount'];
          receivedAmount = parsed.args['returnAmount'];
          console.log(
            `Sold ${ethers.utils.formatUnits(soldAmount, fromToken.decimals)} ${fromToken.symbol}`,
          );
          console.log(
            `Bought ${ethers.utils.formatUnits(receivedAmount, toToken.decimals)} ${
              toToken.symbol
            }`,
          );
        }
      }
    }
    if (receivedAmount.isZero()) {
      throw new Error(`[!] Error: received 0`);
    }
    return receivedAmount;
  };

  const strategyCompound = async (farm: Farm, pool: Pool, amount: BigNumber): Promise<void> => {
    if (!pool.lpToken.token0 || !pool.lpToken.token1) throw new Error('undefined values');
    const half = amount.div(2);
    let half0 = half;
    let half1 = half;
    if (farm.token.address.toUpperCase() !== pool.lpToken.token0.address.toUpperCase())
      half0 = await strategySell(farm.token, pool.lpToken.token0, half);
    if (farm.token.address.toUpperCase() !== pool.lpToken.token1.address.toUpperCase())
      half1 = await strategySell(farm.token, pool.lpToken.token1, half);
    await addLiquidity(half0, half1, pool);
  };

  const strategyDegenCompound = async (
    farm: Farm,
    pool: Pool,
    amount: BigNumber,
  ): Promise<void> => {
    if (!pool.lpToken.token0 || !pool.lpToken.token1) throw new Error('undefined values');
    // check if degen and if farm token is neither lp token, not possible to degen
    if (
      farm.token.address.toUpperCase() !== pool.lpToken.token0.address.toUpperCase() &&
      farm.token.address.toUpperCase() !== pool.lpToken.token1.address.toUpperCase()
    ) {
      console.log(
        '[!] Warning: Farm token is neither LP token, not possible to degen compound. Regular compounding instead',
      );
      await strategyCompound(farm, pool, amount);
      return;
    }
    // get value of amount in other token, check if balance of that token >=, create addLiquidity
    // which token is farm
    let token: Token;
    if (farm.token.address.toUpperCase() !== pool.lpToken.token0.address.toUpperCase())
      token = pool.lpToken.token0;
    else token = pool.lpToken.token1;
    const quoted = await quote(farm.token.address, token.address, amount.toString());
    const toTokenAmount = BigNumber.from(quoted.toTokenAmount);
    const toTokenBalance: BigNumber = await token.contract.balanceOf(WALLET.address);
    if (toTokenBalance.lt(toTokenAmount)) {
      console.log(
        `[!] Warning: Your wallet does not have enough (${token.symbol}) to degen compound. Regular compounding instead`,
      );
      await strategyCompound(farm, pool, amount);
      return;
    }
    if (farm.token.address.toUpperCase() === pool.lpToken.token0.address.toUpperCase())
      await addLiquidity(amount, toTokenAmount, pool);
    else await addLiquidity(toTokenAmount, amount, pool);
  };

  //let receivedAmount = BigNumber.from(0);
  if (pool.strategy === 'HOLD') {
    await strategyHold();
  } else if (pool.strategy === 'SELL') {
    await strategySell(farm.token, farm.hodlToken, amount);
  } else if (pool.strategy === 'COMP') {
    await strategyCompound(farm, pool, amount);
  } else if (pool.strategy === 'DEGENCOMP') {
    await strategyDegenCompound(farm, pool, amount);
  }
};

/*
const strategyHypComp = async () => {};
*/
