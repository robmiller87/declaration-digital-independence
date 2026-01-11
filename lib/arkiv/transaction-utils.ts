/**
 * Transaction utility functions
 * 
 * Handles transaction receipt timeouts and rate limits gracefully (common on testnets).
 */

/**
 * Checks if an error is a rate limit error
 */
export function isRateLimitError(error: any): boolean {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';
  const errorCode = error?.code || error?.status || error?.statusCode;
  
  return errorCode === 429 ||
         errorCode === -32016 ||
         errorMessage.includes('rate limit') ||
         errorMessage.includes('over rate limit') ||
         errorMessage.includes('too many requests') ||
         (errorMessage.includes('429') && errorMessage.toLowerCase().includes('limit'));
}

/**
 * Checks if an error is a transaction receipt timeout
 */
export function isTransactionTimeoutError(error: any): boolean {
  const errorMessage = typeof error === 'string' ? error : error?.message || '';
  return errorMessage.includes('Transaction receipt') ||
         errorMessage.includes('confirmation pending') ||
         errorMessage.includes('Transaction submitted') ||
         (errorMessage.includes('could not be found') && errorMessage.includes('hash'));
}

/**
 * Wraps createEntity calls to handle transaction receipt timeouts and rate limits
 */
export async function handleTransactionWithTimeout<T extends { entityKey: string; txHash: string }>(
  createEntityFn: () => Promise<T>
): Promise<T> {
  try {
    return await createEntityFn();
  } catch (error: any) {
    const errorMessage = error?.message || String(error || '');
    const errorCode = error?.code || error?.status || error?.statusCode;
    
    // Handle rate limit errors
    if (isRateLimitError(error)) {
      throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }
    
    // Handle transaction receipt timeout - common on testnets
    const receiptError = errorMessage.includes('Transaction receipt') && 
                         (errorMessage.includes('could not be found') ||
                          errorMessage.includes('not be processed'));
    
    if (receiptError || isTransactionTimeoutError(error)) {
      const txHashMatch = errorMessage.match(/0x[a-fA-F0-9]{40,64}/);
      if (txHashMatch) {
        throw new Error(`Transaction submitted (${txHashMatch[0].slice(0, 10)}...) but confirmation pending. Please wait a moment and refresh.`);
      }
      throw new Error('Transaction submitted but confirmation pending. Please wait a moment and refresh.');
    }
    
    // Re-throw for other cases
    throw error;
  }
}
