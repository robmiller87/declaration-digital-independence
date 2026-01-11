/**
 * Configuration for hello-world demo
 * 
 * Environment variables:
 * - SPACE_ID: Space ID for data isolation (default: 'ns' for shared workshop space)
 * - ARKIV_PRIVATE_KEY: Private key for signing transactions (required for writes)
 * 
 * IMPORTANT: Uses SPACE_ID=ns by default to share messages across all participants.
 * This allows messages from any wallet to appear on the main demo page.
 */

export const SPACE_ID = process.env.SPACE_ID || process.env.BETA_SPACE_ID || 'ns';

/**
 * Get private key from environment
 * Throws if not configured (required for writes)
 */
export function getPrivateKey(): `0x${string}` {
  const privateKey = process.env.ARKIV_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ARKIV_PRIVATE_KEY environment variable is required for writes');
  }
  if (!privateKey.startsWith('0x')) {
    throw new Error('ARKIV_PRIVATE_KEY must start with 0x');
  }
  return privateKey as `0x${string}`;
}
