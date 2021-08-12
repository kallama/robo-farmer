import { ethers, BigNumber } from 'ethers';
import axios from 'axios';
import * as config from '../config.json';
import { swap } from './1inch';
import { Farm, Pool, Token } from './interfaces';

const MIN_CONFIRMS = Number(process.env.MIN_CONFIRMS);
const GAS_STATION_URL = config.gasStationUrl;

const getGasPrice = async (speed: string): Promise<BigNumber> => {
  // safeLow, standard, fast, fastest
  const response = await axios.get(GAS_STATION_URL);
  const amount: number = response.data[speed]; // up our gas price to do a faster trade
  const gasPrice = ethers.utils.parseUnits(amount.toString(), 'gwei'); // bignumber 9 decimals
  return gasPrice; // bignumber
};

export const doStrategy = async (
  farm: Farm,
  pool: Pool,
  amount: BigNumber,
  PROVIDER: ethers.providers.JsonRpcProvider,
  WALLET: ethers.Wallet,
): Promise<void> => {
  console.log(`Using strategy ${pool.strategy}`);

  const strategyHold = (): void => {
    return;
  };

  const strategySell = async (fromToken: Token, toToken: Token, amount: BigNumber): Promise<BigNumber> => {
    if (typeof toToken === 'undefined') throw new Error(`[!] Error: toToken can't be undefined`);
    const tx = await swap(fromToken.address, toToken.address, amount.toString(), WALLET.address);
    tx.gasPrice = await getGasPrice('standard');
    // increase gasLimit by 50%, ethers doesn't provide enough normally
    tx.gasLimit = await WALLET.estimateGas(tx);
    tx.gasLimit = tx.gasLimit.mul(100).div(50);
    const response = await WALLET.sendTransaction(tx);
    const receipt = await response.wait(MIN_CONFIRMS);
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
          console.log(`Sold ${ethers.utils.formatUnits(soldAmount, fromToken.decimals)} ${fromToken.symbol}`);
          console.log(`Bought ${ethers.utils.formatUnits(receivedAmount, toToken.decimals)} ${toToken.symbol}`);
        }
      }
    }
    if (receivedAmount.isZero()) {
      throw new Error(`[!] Error: received 0`);
    }
    return receivedAmount;
  };

  const strategyComp = async (farm: Farm, pool: Pool, amount: BigNumber): Promise<void> => {
    /* verify that pool.token0 and pool.token1 are Token */
    if (typeof pool.lpToken.token0 === 'undefined' || typeof pool.lpToken.token1 === 'undefined')
      throw new Error(`[!] Error: pool.lpToken.token0 or pool.lpToken.token1 can't be undefined`);
    /* verify that pool.lpToken.router is a Router */
    if (typeof pool.lpToken.router === 'undefined')
      throw new Error(`[!] Error: pool.lpToken.router can't be undefined`);
    const half = amount.div(2);
    let half0 = BigNumber.from(0);
    let half1 = BigNumber.from(0);
    // check if one of 2 tokens is farm token, don't sell it
    if (
      farm.token.address.toUpperCase() !== pool.lpToken.token0.address.toUpperCase() &&
      farm.token.address.toUpperCase() !== pool.lpToken.token1.address.toUpperCase()
    ) {
      half0 = await strategySell(farm.token, pool.lpToken.token0, half);
      half1 = await strategySell(farm.token, pool.lpToken.token1, half);
    } else if (farm.token.address !== pool.lpToken.token0.address) {
      half0 = half;
      half1 = await strategySell(farm.token, pool.lpToken.token1, half);
    } else {
      half0 = await strategySell(farm.token, pool.lpToken.token0, half);
      half1 = half;
    }
    if (half0.isZero() || half1.isZero()) {
      throw new Error('[!] Error: one of the compound halfs is 0');
    }
    console.log(`Creating liquidity for pool ${pool.id}`);
    const half0Min = half0.mul(90).div(100); // 10% less
    const half1Min = half1.mul(90).div(100); // 10% less
    /*const gasPrice = await getGasPrice('safeLow');
    const gasLimit = await pool.lpToken.router.contract.estimateGas.addLiquidity(
      pool.lpToken.token0.address,
      pool.lpToken.token1.address,
      half0,
      half1,
      half0Min,
      half1Min,
      WALLET.address,
      Date.now() + 1000 * 60 * 20, // max execution time 20 minutes
    );*/
    let tx: ethers.providers.TransactionResponse = await pool.lpToken.router.contract.addLiquidity(
      pool.lpToken.token0.address,
      pool.lpToken.token1.address,
      half0,
      half1,
      half0Min,
      half1Min,
      WALLET.address,
      Date.now() + 1000 * 60 * 20, // max execution time 20 minutes
    );
    let receipt: ethers.providers.TransactionReceipt = await tx.wait(MIN_CONFIRMS);
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
              `Receieved ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${pool.lpToken.symbol}`,
            );
          }
        }
      }
    }
    if (receivedAmount.isZero()) {
      throw new Error('[!] Error: Receieved 0 liqudity');
    }
    console.log(
      `Depositing ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${pool.lpToken.symbol} to pool ${
        pool.id
      }`,
    );
    tx = await farm.masterChef.contract.deposit(pool.id, receivedAmount);
    receipt = await tx.wait(MIN_CONFIRMS);
    console.log(
      `Deposited ${ethers.utils.formatUnits(receivedAmount, pool.lpToken.decimals)} ${pool.lpToken.symbol} to pool ${
        pool.id
      }`,
    );
  };

  //let receivedAmount = BigNumber.from(0);
  if (pool.strategy === 'HOLD') {
    await strategyHold();
  } else if (pool.strategy === 'SELL') {
    await strategySell(farm.token, farm.hodlToken, amount);
  } else if (pool.strategy === 'COMP') {
    await strategyComp(farm, pool, amount);
  } else if (pool.strategy === 'HYPCOMP') {
    console.log('TODO');
  }
};

/*
const strategyHypComp = async () => {};
*/
