declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PRIVATE_KEY: string | undefined;
      POLYGONSCAN_API_KEY: string | undefined;
      CUSTOM_RPC: string | undefined;
      FARM_BASE_TOKEN: string | undefined;
      FARM_MIN_CONFIRMs: string | undefined;
      FARM_STRATEGY: string | undefined;
      FARM_SLIPPAGE: string | undefined;
      FARM_DELAY: string | undefined;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
