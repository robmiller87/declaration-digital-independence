/**
 * Arkiv client wrapper
 * 
 * Standalone client for hello-world demo.
 * Provides public client for reads and wallet client for writes.
 */

import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk"
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts"
import { mendoza } from "@arkiv-network/sdk/chains"

/**
 * Get public client for read operations
 * No authentication required - can be used on both client and server
 */
export function getPublicClient() {
  return createPublicClient({
    chain: mendoza,
    transport: http(),
  });
}

/**
 * Get wallet client from private key (server-side use)
 * 
 * @param privateKey - Private key in format 0x...
 * @returns Wallet client configured for Mendoza testnet
 */
export function getWalletClientFromPrivateKey(privateKey: `0x${string}`) {
  return createWalletClient({
    chain: mendoza,
    transport: http(),
    account: privateKeyToAccount(privateKey),
  });
}
