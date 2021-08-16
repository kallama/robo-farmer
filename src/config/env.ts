export default {
  PRIVATE_KEY: String(process.env.PRIVATE_KEY),
  RPC_URL: String(process.env.CUSTOM_RPC),
  POLYGONSCAN_API_KEY: String(process.env.POLYGONSCAN_API_KEY),
  CONFIRMS_MIN: Number(process.env.CONFIRMS_MIN),
  HODL_TOKEN_ADDRESS: String(process.env.HODL_TOKEN_ADDRESS),
  HODL_MIN: String(process.env.HODL_MIN),
  TOKEN_ADDRESS: String(process.env.TOKEN_ADDRESS),
  CHEF_ADDRESS: String(process.env.CHEF_ADDRESS),
  PENDING_FUNCTION_NAME: String(process.env.PENDING_FUNCTION_NAME),
  STRATEGY: String(process.env.STRATEGY),
  SLIPPAGE: String(process.env.SLIPPAGE),
  SLEEP: Number(process.env.SLEEP),
};
