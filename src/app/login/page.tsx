'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Toggle from '@/components/ui/Toggle';

function LoginForm() {
  const sp = useSearchParams();
  const next = sp.get('next') || '/dashboard';

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bgFailed, setBgFailed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, remember }),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Login failed');
        setLoading(false);
        return;
      }
      // Hard navigation: ensures the cookie is attached before the proxy runs.
      window.location.href = next;
    } catch {
      setError('Network error');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left: form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <div className="mb-10">
            <svg
              viewBox="0 0 64 24"
              className="h-8 w-auto text-primary-600"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M2 6c4-6 10-6 14 0s10 6 14 0v6c-4 6-10 6-14 0S6 6 2 12V6z" />
            </svg>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Customs clearance &amp; logistics ERP
          </p>

          {error && (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                Remember me
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-slate-500 text-center">
            Default: <code className="bg-slate-100 px-1 rounded">admin</code> /{' '}
            <code className="bg-slate-100 px-1 rounded">Admin@123</code>
          </p>
        </div>
      </div>

      {/* Right: image panel (hidden on mobile) */}
      <div className="relative hidden lg:block lg:w-1/2">
        {/* Gradient fallback shown until the image loads (or if it's missing) */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary-600 via-primary-700 to-slate-900"
          aria-hidden="true"
        />
        {!bgFailed && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/login-bg.jpg"
              alt="Shipping containers at port"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => setBgFailed(true)}
            />
            {/* Dark overlay for headline legibility */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent"
              aria-hidden="true"
            />
          </>
        )}
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <h3 className="text-3xl font-semibold leading-tight">
            From license to payment.
          </h3>
          <p className="mt-3 max-w-md text-sm text-white/80">
            Track every consignment through clearance, invoicing, and approvals
            — all in one place.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
