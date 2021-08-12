import { Contract } from 'ethers';

export interface Token {
  contract: Contract;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  abi: string;
}

export interface LPToken extends Token {
  pair: boolean;
  factory?: string;
  router?: Router;
  token0?: Token;
  token1?: Token;
}

export interface Pool extends Token {
  id: number;
  strategy: string;
  lpToken: LPToken;
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
  hodlToken: Token;
  masterChef: MasterChef;
  pools: Array<Pool>;
}
