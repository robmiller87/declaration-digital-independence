'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Signature {
  id: string;
  name: string;
  message?: string;
  timestamp: string;
  signerWallet?: string;
  attestedBy: string;
  txHash?: string;
}

export default function Declaration() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    loadSignatures();
    checkWallet();
  }, []);

  const checkWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ 
          method: 'eth_accounts' 
        });
        if (accounts.length > 0) {
          setWalletConnected(true);
          setWalletAddress(accounts[0]);
        }
      } catch (err) {
        console.error('Error checking wallet:', err);
      }
    }
  };

  const connectWallet = async () => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        const accounts = await (window as any).ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        if (accounts.length > 0) {
          setWalletConnected(true);
          setWalletAddress(accounts[0]);
        }
      } catch (err) {
        console.error('Error connecting wallet:', err);
      }
    } else {
      alert('No wallet detected. Install MetaMask or sign without a wallet.');
    }
  };

  const loadSignatures = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/signatures');
      const data = await res.json();
      if (data.ok) {
        setSignatures(data.signatures || []);
      }
    } catch (error) {
      console.error('Error loading signatures:', error);
    } finally {
      setLoading(false);
    }
  };

  const submitSignature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: name.trim(),
          message: message.trim() || undefined,
          signerWallet: walletAddress || undefined
        }),
      });
      const data = await res.json();
      
      if (data.ok) {
        setName('');
        setMessage('');
        setTimeout(loadSignatures, 2000);
        alert('Your signature has been recorded on-chain. Thank you for signing the Declaration!');
      } else {
        alert('Error: ' + (data.error || 'Failed to submit'));
      }
    } catch (error) {
      console.error('Error submitting signature:', error);
      alert('Error submitting signature');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <section className="py-16 px-6 md:px-16 lg:px-24 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
          Declaration of Digital Independence
        </h1>
        <p className="text-slate-400 text-lg">
          {signatures.length} {signatures.length === 1 ? 'person has' : 'people have'} signed
        </p>
      </section>

      {/* Declaration Text */}
      <section className="px-6 md:px-16 lg:px-24 max-w-3xl mx-auto mb-16">
        <div className="bg-gradient-to-br from-purple-900/30 to-slate-900 border border-purple-500/30 rounded-2xl p-8 md:p-12">
          <p className="text-xl md:text-2xl leading-relaxed text-slate-200 italic">
            "We hold these truths to be self-evident: that our data belongs to us, 
            that no corporation should hold our digital lives hostage, 
            and that sovereignty is not a feature — it is a right."
          </p>
          <p className="text-slate-500 mt-6 text-sm">
            Your signature is stored on-chain. No company can delete it.
          </p>
        </div>
      </section>

      {/* Sign Form */}
      <section className="px-6 md:px-16 lg:px-24 max-w-xl mx-auto mb-20">
        <form onSubmit={submitSignature} className="space-y-4">
          {/* Wallet Connection */}
          <div className="flex justify-between items-center mb-4">
            {walletConnected ? (
              <span className="text-sm text-green-400">
                ✓ Wallet connected: {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
              </span>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                className="text-sm text-purple-400 hover:text-purple-300 underline"
              >
                Connect wallet (optional)
              </button>
            )}
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name *"
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            disabled={submitting}
            required
          />
          
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message (optional)"
            rows={3}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            disabled={submitting}
          />
          
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Signing...' : 'Sign the Declaration'}
          </button>
        </form>
      </section>

      {/* Signatures List */}
      <section className="px-6 md:px-16 lg:px-24 max-w-4xl mx-auto pb-20">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-semibold">Signatories</h2>
          <button
            onClick={loadSignatures}
            className="text-sm text-purple-400 hover:text-purple-300"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading signatures...</div>
        ) : signatures.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No signatures yet. Be the first to sign!
          </div>
        ) : (
          <div className="grid gap-4">
            {signatures.map((sig) => (
              <div
                key={sig.id}
                className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 hover:border-purple-500/30 transition"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{sig.name}</h3>
                  <span className="text-xs text-slate-500">
                    {new Date(sig.timestamp).toLocaleDateString()}
                  </span>
                </div>
                {sig.message && (
                  <p className="text-slate-400 mb-3 italic">"{sig.message}"</p>
                )}
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  {sig.signerWallet && (
                    <span>Wallet: {sig.signerWallet.slice(0, 8)}...</span>
                  )}
                  {sig.txHash && (
                    <a
                      href={`https://explorer.mendoza.hoodi.arkiv.network/tx/${sig.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline"
                    >
                      Verify on-chain →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800 text-center text-slate-500 text-sm">
        Powered by <a href="https://arkiv.network" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline">Arkiv</a> — 
        Data stored on Mendoza Testnet
      </footer>
    </div>
  );
}
