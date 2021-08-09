import axios from 'axios';
import * as config from '../config.json';

const polygonScanUrl = config.chains.polygon.polygonScanUrl;
const polygonScanApiKey = String(process.env.POLYGONSCAN_API_KEY);

export const getPolygonScanABI = async (address: string): Promise<string> => {
  const url = polygonScanUrl + address + '&apikey=' + polygonScanApiKey;
  try {
    const response = await axios.get(url);
    if (response.status !== 200) {
      console.log(`[!] Error: Response Code is ${response.status}`);
      throw new Error(response.data);
    } else if (Number(response.data.status) !== 1) {
      console.log(`[!] Error: ${response.data.result}`);
      throw new Error(response.data.result);
    }
    console.log(`[!] ABI found for ${address}`);
    const abi: string = response.data.result;
    return abi;
  } catch (error) {
    throw new Error(error);
  }
};
