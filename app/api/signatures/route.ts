import { NextRequest, NextResponse } from 'next/server';
import { getPublicClient, getWalletClientFromPrivateKey } from '../../../lib/arkiv/client';
import { SPACE_ID, getPrivateKey } from '../../../lib/config';
import { handleTransactionWithTimeout } from '../../../lib/arkiv/transaction-utils';
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
  } catch (error) {
    console.error('[signatures/route] GET error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to fetch signatures' }, { status: 500 });
  }
}

// POST: Create new signature
export async function POST(request: NextRequest) {
  try {
    const { name, message, signerWallet } = await request.json();
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ ok: false, error: 'Name is required' }, { status: 400 });
    }
    
    const privateKey = getPrivateKey();
    if (!privateKey) {
      return NextResponse.json({ ok: false, error: 'Server wallet not configured' }, { status: 500 });
    }
    
    const walletClient = getWalletClientFromPrivateKey(privateKey);
    const attestedBy = walletClient.account.address;
    const timestamp = new Date().toISOString();
    
    const payload = {
      name: name.trim(),
      message: message?.trim() || '',
      timestamp,
      signerWallet: signerWallet || null,
      attestedBy,
    };
    
    const spaceId = process.env.BETA_SPACE_ID || SPACE_ID;
    
    // Create the signature entity
    const result = await handleTransactionWithTimeout(async () => {
      return walletClient.createEntity({
        spaceId,
        payload: enc.encode(JSON.stringify(payload)),
        attributes: [
          { key: 'type', value: 'declaration_signature' },
          { key: 'name', value: payload.name },
          { key: 'timestamp', value: timestamp },
          { key: 'attestedBy', value: attestedBy },
          ...(signerWallet ? [{ key: 'signerWallet', value: signerWallet }] : []),
        ],
      });
    }, 30000);
    
    // Store txHash in companion entity
    if (result && result.hash) {
      try {
        await walletClient.createEntity({
          spaceId,
          payload: enc.encode(JSON.stringify({ txHash: result.hash })),
          attributes: [
            { key: 'type', value: 'declaration_signature_txhash' },
            { key: 'signatureKey', value: result.key || '' },
            { key: 'txHash', value: result.hash },
          ],
        });
      } catch (e) {
        console.error('[signatures/route] Failed to store txHash entity:', e);
      }
    }
    
    return NextResponse.json({ 
      ok: true, 
      signature: {
        id: result?.key || '',
        ...payload,
        txHash: result?.hash || '',
      }
    });
  } catch (error: any) {
    console.error('[signatures/route] POST error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Failed to create signature' 
    }, { status: 500 });
  }
}
