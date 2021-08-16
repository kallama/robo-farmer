import axios from 'axios';
import config from '../config';

export const getPolygonScanABI = async (address: string): Promise<string> => {
  const url = config.POLYGON.POLYGONSCAN_URL + address + '&apikey=' + config.POLYGONSCAN_API_KEY;
  try {
    const response = await axios.get(url);
    if (response.status !== 200) {
      console.log(`[!] Error: Response Code is ${response.status}`);
      throw new Error(response.data);
    } else if (Number(response.data.status) !== 1) {
      console.log(`[!] Error: ${response.data.result}`);
      throw new Error(response.data.result);
    }
    console.log(`ABI found for ${address}`);
    const abi: string = response.data.result;
    return abi;
  } catch (error) {
    throw new Error(error);
  }
};
