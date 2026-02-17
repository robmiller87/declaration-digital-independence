import { NextRequest, NextResponse } from 'next/server';
import { getPublicClient, getWalletClientFromPrivateKey } from '../../../lib/arkiv/client';
import { SPACE_ID, getPrivateKey } from '../../../lib/config';
import { handleTransactionWithTimeout } from '../../../lib/arkiv/transaction-utils';
import { isTransactionTimeoutError, isRateLimitError } from '../../../lib/arkiv/transaction-utils';
import { eq } from '@arkiv-network/sdk/query';

const enc = new TextEncoder();

// GET: List signatures
export async function GET() {
  try {
    const publicClient = getPublicClient();
    const querySpaceId = process.env.BETA_SPACE_ID || SPACE_ID;
    const spaceIdsToQuery = Array.from(new Set([querySpaceId, 'ns']));
    
    const [signatureResults, txHashResults] = await Promise.all([
      Promise.all(
        spaceIdsToQuery.map(spaceId =>
          publicClient
            .buildQuery()
            .where(eq('type', 'declaration_signature'))
            .where(eq('spaceId', spaceId))
            .withAttributes(true)
            .withPayload(true)
            .limit(500)
            .fetch()
        )
      ),
      Promise.all(
        spaceIdsToQuery.map(spaceId =>
          publicClient
            .buildQuery()
            .where(eq('type', 'declaration_signature_txhash'))
            .where(eq('spaceId', spaceId))
            .withAttributes(true)
            .withPayload(true)
            .limit(500)
            .fetch()
        )
      ),
    ]);
    
    const result = {
      entities: signatureResults.flatMap(r => r.entities || []),
    };
    const txHashResult = {
      entities: txHashResults.flatMap(r => r.entities || []),
    };
    
    // Build txHash map
    const txHashMap: Record<string, string> = {};
    if (txHashResult?.entities && Array.isArray(txHashResult.entities)) {
      txHashResult.entities.forEach((entity: any) => {
        try {
          const attrs = entity.attributes || {};
          const getAttr = (key: string): string => {
            if (Array.isArray(attrs)) {
              const attr = attrs.find((a: any) => a.key === key);
              return String(attr?.value || '');
            }
            return String(attrs[key] || '');
          };
          const signatureKey = getAttr('signatureKey');
          if (signatureKey) {
            let payload: any = {};
            if (entity.payload) {
              const decoded = entity.payload instanceof Uint8Array
                ? new TextDecoder().decode(entity.payload)
                : typeof entity.payload === 'string'
                ? entity.payload
                : JSON.stringify(entity.payload);
              payload = JSON.parse(decoded);
            }
            txHashMap[signatureKey] = payload.txHash || getAttr('txHash') || '';
          }
        } catch (e) {
          console.error('[signatures/route] Error processing txHash entity:', e);
        }
      });
    }
    
    // Parse signatures
    const signatures = (result.entities || []).map((entity: any) => {
      let payload: any = {};
      try {
        if (entity.payload) {
          const decoded = entity.payload instanceof Uint8Array
            ? new TextDecoder().decode(entity.payload)
            : typeof entity.payload === 'string'
            ? entity.payload
            : JSON.stringify(entity.payload);
          payload = JSON.parse(decoded);
        }
      } catch (e) {
        console.error('Error decoding payload:', e);
      }
      
      const attrs = entity.attributes || {};
      const getAttr = (key: string): string => {
        if (Array.isArray(attrs)) {
          const attr = attrs.find((a: any) => a.key === key);
          return String(attr?.value || '');
        }
        return String(attrs[key] || '');
      };
      
      const entityKey = entity.key || entity.entityKey || '';
      return {
        id: entityKey,
        name: payload.name || getAttr('name') || 'Anonymous',
        message: payload.message || getAttr('message') || '',
        timestamp: payload.timestamp || getAttr('timestamp') || '',
        signerWallet: payload.signerWallet || getAttr('signerWallet') || '',
        attestedBy: payload.attestedBy || getAttr('attestedBy') || '',
        txHash: txHashMap[entityKey] || getAttr('txHash') || '',
      };
    });
    
    // Deduplicate
    const seenKeys = new Set<string>();
    const uniqueSignatures = signatures.filter(sig => {
      if (seenKeys.has(sig.id)) return false;
      seenKeys.add(sig.id);
      return true;
    });
    
    // Sort by timestamp (newest first)
    uniqueSignatures.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });
    
    return NextResponse.json({ ok: true, signatures: uniqueSignatures });
  } catch (error: any) {
    console.error('[signatures/route] GET error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch signatures', signatures: [] }, { status: 500 });
  }
}

// POST: Create new signature
export async function POST(request: NextRequest) {
  try {
    const privateKey = getPrivateKey(); // Throws if not configured
    const body = await request.json();
    const { name, message, signerWallet } = body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }
    
    const walletClient = getWalletClientFromPrivateKey(privateKey);
    const attestedBy = walletClient.account.address.toLowerCase();
    const timestamp = new Date().toISOString();
    
    const querySpaceId = process.env.BETA_SPACE_ID || SPACE_ID;
    
    // Create payload
    const payload = JSON.stringify({
      name: name.trim(),
      message: message?.trim() || '',
      timestamp,
      signerWallet: signerWallet || null,
      attestedBy,
    });
    
    // Create attributes
    const attributes = [
      { key: 'type', value: 'declaration_signature' },
      { key: 'name', value: name.trim() },
      { key: 'attestedBy', value: attestedBy },
      { key: 'spaceId', value: querySpaceId },
      { key: 'timestamp', value: timestamp },
    ];
    
    if (signerWallet) {
      attributes.push({ key: 'signerWallet', value: signerWallet.toLowerCase() });
    }
    
    // Create entity on Arkiv
    const result = await handleTransactionWithTimeout(async () => {
      return await walletClient.createEntity({
        payload: enc.encode(payload),
        attributes,
        contentType: 'application/json',
        expiresIn: 15768000, // 6 months
      });
    });
    
    const { entityKey, txHash } = result;
    
    // Create txHash companion entity
    try {
      await walletClient.createEntity({
        payload: enc.encode(JSON.stringify({ txHash })),
        contentType: 'application/json',
        attributes: [
          { key: 'type', value: 'declaration_signature_txhash' },
          { key: 'signatureKey', value: entityKey },
          { key: 'txHash', value: txHash },
          { key: 'spaceId', value: querySpaceId },
        ],
        expiresIn: 15768000,
      });
    } catch (error: any) {
      console.warn('[signatures/route] Failed to create txhash entity:', error);
    }
    
    return NextResponse.json({
      ok: true,
      status: 'submitted',
      entityKey,
      txHash,
      message: 'Signature recorded! It may take a moment to appear.',
    });
  } catch (error: any) {
    console.error('[signatures/route] POST error:', error);
    
    if (isTransactionTimeoutError(error)) {
      return NextResponse.json(
        { ok: false, error: 'Transaction submitted but pending. Please wait and refresh.', status: 'submitted_or_pending' },
        { status: 202 }
      );
    }
    
    if (isRateLimitError(error)) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded. Please wait and try again.' },
        { status: 429 }
      );
    }
    
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create signature' },
      { status: 500 }
    );
  }
}
