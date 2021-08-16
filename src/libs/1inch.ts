import axios from 'axios';
import { ethers } from 'ethers';
import config from '../config';

type Quote = {
  fromToken: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logoURI: string;
  };
  toToken: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
    logoURI: string;
  };
  toTokenAmount: string;
  fromTokenAmount: string;
  protocols: Array<Array<object>>;
  estimatedGas: number;
};

export const quote = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
): Promise<Quote> => {
  const url =
    config.POLYGON.ONEINCH_URL +
    `quote?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}`;
  const response = await axios.get(url);
  return response.data;
};

export const swap = async (
  fromTokenAddress: string,
  toTokenAddress: string,
  amount: string,
  fromAddress: string,
): Promise<ethers.providers.TransactionRequest> => {
  const url =
    config.POLYGON.ONEINCH_URL +
    `swap?fromTokenAddress=${fromTokenAddress}&toTokenAddress=${toTokenAddress}&amount=${amount}&fromAddress=${fromAddress}&slippage=${config.SLIPPAGE}&allowPartialFill=false`;
  const response = await axios.get(url);
  const data = response.data;
  const tx = data.tx;
  tx.value = ethers.BigNumber.from(tx.value).toHexString();
  delete tx.gasPrice;
  delete tx.gas;
  console.log(
    `Selling ${ethers.utils.formatUnits(data.fromTokenAmount, data.fromToken.decimals)} ${
      data.fromToken.symbol
    }`,
  );
  console.log(
    `Buying ${ethers.utils.formatUnits(data.toTokenAmount, data.toToken.decimals)} ${
      data.toToken.symbol
    }`,
  );
  return tx;
};
