import axios from 'axios';
import { ethers } from 'ethers';
import * as config from '../config.json';

const ONEINCHURL = config['1inchUrl'];
const SLIPPAGE = String(process.env.SLIPPAGE);
const DONATE = String(process.env.DONATE);
const DONATE_PERCENT = String(process.env.DONATE_PERCENT);
const AUTHOR_ADDRESS = config.authorAddress;

export const quote = async (fromTokenAddress: string, toTokenAddress: string, amount: string): Promise<object> => {
  let url = ONEINCHURL + `quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}`;
  // Donation check, only added if DONATE=true in the .env or if not set in .env, if DONATE=true in env.defaults
  if (DONATE.toUpperCase() === 'TRUE') {
    url = url + `&fee=${DONATE_PERCENT}`;
  }
  const response = await axios.get(url);
  return response.data;
};

export const swap = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
): Promise<ethers.providers.TransactionRequest> => {
  let url =
    ONEINCHURL +
    `swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${SLIPPAGE}&allowPartialFill=false`;
  // Donation check, only added if DONATE=true in the .env or if not set in .env, if DONATE=true in env.defaults
  if (DONATE.toUpperCase() === 'TRUE') {
    url = url + `&referrerAddress=${AUTHOR_ADDRESS}&fee=${DONATE_PERCENT}`;
  }
  const response = await axios.get(url);
  const data = response.data;
  const tx = data.tx;
  tx.value = ethers.BigNumber.from(tx.value).toHexString();
  delete tx.gasPrice;
  delete tx.gas;
  console.log(
    `Selling ${ethers.utils.formatUnits(data.fromTokenAmount, data.fromToken.decimals)} ${data.fromToken.symbol}`,
  );
  console.log(`Buying ${ethers.utils.formatUnits(data.toTokenAmount, data.toToken.decimals)} ${data.toToken.symbol}`);
  return tx;
};
