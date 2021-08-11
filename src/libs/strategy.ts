import { ethers, BigNumber } from 'ethers';
import axios from 'axios';
import * as config from '../config.json';
import { swap } from './1inch';
import { Farm } from './interfaces';

const MIN_CONFIRMS = Number(process.env.MIN_CONFIRMS);
const GAS_STATION_URL = config.gasStationUrl;

const getGasPrice = async (speed: string): Promise<BigNumber> => {
  // safeLow, standard, fast, fastest
  const response = await axios.get(GAS_STATION_URL);
  const amount = response.data[speed]; // up our gas price to do a faster trade
  const gasPrice = ethers.utils.parseUnits(amount.toString(), 'gwei'); // bignumber 9 decimals
  return gasPrice; // bignumber
};

export const doStrategy = async (
  farm: Farm,
  strategy: string | undefined,
  amount: BigNumber,
  WALLET: ethers.Wallet,
): Promise<void> => {
  console.log(`Using strategy ${strategy}`);

  const strategyHold = (): void => {
    return;
  };

  const strategySell = async (): Promise<void> => {
    const tx = await swap(farm.token.address, farm.hodlToken.address, amount.toString(), WALLET.address);
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
          console.log(`Sold ${ethers.utils.formatUnits(soldAmount, farm.token.decimals)} ${farm.token.symbol}`);
          console.log(
            `Bought ${ethers.utils.formatUnits(receivedAmount, farm.hodlToken.decimals)} ${farm.hodlToken.symbol}`,
          );
        }
      }
    }
    return;
  };

  switch (strategy) {
    case 'HOLD':
      strategyHold();
      break;
    case 'SELL':
      await strategySell();
      break;
  }
};

/*


const strategyComp = async () => {};

const strategyHypComp = async () => {};

const swapTokens = async () => {};

const createLiquidity = async () => {};

const addLiquidity = async () => {};
*/
