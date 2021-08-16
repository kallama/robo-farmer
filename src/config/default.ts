export default {
  STRATEGIES: ['HOLD', 'SELL', 'COMP', 'DEGENCOMP'],
  POLYGON: {
    RPC_URL: 'https://rpc-mainnet.maticvigil.com',
    WSS_URL: 'wss://ws-matic-mainnet.chainstacklabs.com',
    POLYGONSCAN_URL: 'https://api.polygonscan.com/api?module=contract&action=getabi&address=',
    GASSTATION_URL: 'https://gasstation-mainnet.matic.network',
    ONEINCH_URL: 'https://api.1inch.exchange/v3.0/137/',
    SWAPS: {
      QUICKSWAP: {
        FACTORY: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
        ROUTER: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      },
      SUSHISWAP: {
        FACTORY: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        ROUTER: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      },
    },
  },
  AUTHOR_ADDRESS: '',
};
