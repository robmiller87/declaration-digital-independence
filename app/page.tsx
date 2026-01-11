import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          🌍 Arkiv Hello World
        </h1>
        <p className="text-gray-600 mb-6">
          A simple decentralized message board powered by Arkiv
        </p>
        <Link
          href="/hello-world"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          View Demo →
        </Link>
      </div>
    </div>
  );
}
