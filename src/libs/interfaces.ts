import { Contract } from 'ethers';

export interface Token {
  contract: Contract;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  abi: string;
}

export interface Pool extends Token {
  poolId?: number;
  strategy?: string;
  pair?: boolean;
  factory?: string;
  router?: Router;
  minimumLiquidity?: number;
  token0?: Token;
  token1?: Token;
}

export interface Router {
  contract: Contract;
  address: string;
}

export interface MasterChef {
  address: string;
  pendingFunctionName: string;
  contract: Contract;
  pools: number;
  abi: string;
}

export interface Farm {
  token: Token;
  masterChef: MasterChef;
  pools: Array<Pool>;
}
