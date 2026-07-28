import * as Network from 'expo-network';

export async function getLocalIpAddress() {
  try {
    const networkState = await Network.getNetworkStateAsync();
    if (networkState.isConnected && networkState.type === Network.NetworkStateType.WIFI) {
      const ip = await Network.getIpAddressAsync();
      return ip;
    }
  } catch (error) {
    console.warn('Unable to detect local IP address:', error);
  }
  return null;
}
