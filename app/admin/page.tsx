'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { money, asNumber } from '@/lib/format-money';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type SectionError = string | null;

export default function AdminDashboard() {
  const [dateRange, setDateRange] = useState('7days');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, SectionError>>({});

  const [stats, setStats] = useState([
    { title: 'Total Revenue', value: 'GH₵ 0.00', change: '0%', trend: 'up', icon: 'ri-money-dollar-circle-line', color: 'gray' },
    { title: 'Orders', value: '0', change: '0%', trend: 'up', icon: 'ri-shopping-bag-line', color: 'blue' },
    { title: 'Customers', value: '0', change: '0%', trend: 'up', icon: 'ri-group-line', color: 'purple' },
    { title: 'Avg Order Value', value: 'GH₵ 0.00', change: '0%', trend: 'up', icon: 'ri-line-chart-line', color: 'amber' },
  ]);

  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchDashboardData() {
      setLoading(true);
      setPageError(null);
      setSectionErrors({});

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetchWithTimeout(
          '/api/admin/dashboard',
          { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' },
          15_000
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Dashboard request failed (${res.status})`);
        }

        const json = await res.json();
        if (cancelled) return;

        const errs = (json.errors || {}) as Record<string, string>;
        setSectionErrors(errs);

        const s = json.sections?.stats;
        if (s) {
          setStats([
            {
              title: 'Total Revenue',
              value: `GH₵ ${money(s.revenue)}`,
              change: '+0%',
              trend: 'up',
              icon: 'ri-money-dollar-circle-line',
              color: 'gray',
            },
            {
              title: 'Orders',
              value: String(s.totalOrders ?? 0),
              change: '+0%',
              trend: 'up',
              icon: 'ri-shopping-bag-line',
              color: 'blue',
            },
            {
              title: 'Customers (Active)',
              value: String(s.customers ?? 0),
              change: '+0%',
              trend: 'up',
              icon: 'ri-group-line',
              color: 'purple',
            },
            {
              title: 'Avg Order Value',
              value: `GH₵ ${money(s.avgOrderValue)}`,
              change: '+0%',
              trend: 'up',
              icon: 'ri-line-chart-line',
              color: 'amber',
            },
          ]);
        }

        if (Array.isArray(json.sections?.chart)) {
          setChartData(json.sections.chart);
        }

        if (Array.isArray(json.sections?.recentOrders)) {
          setRecentOrders(
            json.sections.recentOrders.map((o: any) => {
              const addr = o.shipping_address || {};
              const customerName =
                addr.firstName && addr.lastName
                  ? `${addr.firstName.trim()} ${addr.lastName.trim()}`
                  : addr.full_name || addr.firstName || (o.email || '').split('@')[0];
              return {
                id: o.id,
                displayId: o.order_number,
                customer: customerName,
                email: o.email,
                date: new Date(o.created_at).toLocaleDateString(),
                total: o.total,
                status: o.status,
                items: 1,
              };
            })
          );
        }

        if (Array.isArray(json.sections?.lowStock)) {
          setLowStockProducts(
            json.sections.lowStock.map((p: any) => ({
              name: p.name,
              stock: p.quantity,
              status: p.quantity === 0 ? 'critical' : 'low',
            }))
          );
        }

        if (Array.isArray(json.sections?.topProducts)) {
          setTopProducts(
            json.sections.topProducts.map((p: any) => ({
              id: p.slug,
              name: p.name,
              image: p.product_images?.[0]?.url || '/logo-efes.png',
              sales: 0,
              revenue: 0,
              stock: p.quantity,
            }))
          );
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error('Error loading dashboard:', error);
          setPageError(error?.message || 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDashboardData();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusColors: any = {
    pending: 'bg-amber-100 text-amber-700',
    processing: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    dispatched_to_rider: 'bg-indigo-100 text-indigo-700',
    delivered: 'bg-gray-100 text-gray-900',
    cancelled: 'bg-red-100 text-red-700',
  };

  const quickActions = [
    { title: 'Feature Modules', description: 'Manage 40+ store features', icon: 'ri-puzzle-line', color: 'purple', href: '/admin/modules' },
    { title: 'Add Product', description: 'Create a new product', icon: 'ri-add-circle-line', color: 'blue', href: '/admin/products/new' },
    { title: 'View Orders', description: 'Manage customer orders', icon: 'ri-shopping-bag-line', color: 'green', href: '/admin/orders' },
    { title: 'POS System', description: 'Point of sale checkout', icon: 'ri-store-3-line', color: 'amber', href: '/admin/pos' },
  ];

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[40vh] gap-3 text-gray-500">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
        <p>Loading Dashboard…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Store overview</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
          </select>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {pageError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between gap-3">
          <span>{pageError}</span>
          <button type="button" className="underline" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{stat.title}</span>
              <i className={`${stat.icon} text-xl text-gray-400`} />
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
            {sectionErrors.stats && (
              <p className="text-xs text-amber-600 mt-2">Stats unavailable</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue (7 days)</h2>
          {sectionErrors.chart ? (
            <p className="text-sm text-amber-700">Unable to load revenue chart. {sectionErrors.chart}</p>
          ) : chartData.length === 0 ? (
            <p className="text-sm text-gray-500">No paid revenue in the last 7 days.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: any) => `GH₵ ${money(asNumber(v))}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#111827" fill="#e5e7eb" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100"
              >
                <i className={`${a.icon} text-xl text-gray-700 mt-0.5`} />
                <div>
                  <p className="font-medium text-gray-900 text-sm">{a.title}</p>
                  <p className="text-xs text-gray-500">{a.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Paid Orders</h2>
            <Link href="/admin/orders" className="text-sm text-gray-600 hover:underline">
              View all
            </Link>
          </div>
          {sectionErrors.recentOrders ? (
            <p className="text-sm text-amber-700">Unable to load orders. {sectionErrors.recentOrders}</p>
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500">No paid orders yet.</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/admin/orders/${o.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-sm text-gray-900">{o.displayId}</p>
                    <p className="text-xs text-gray-500">{o.customer} · {o.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">GH₵ {money(o.total)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[o.status] || 'bg-gray-100'}`}>
                      {o.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Low Stock</h2>
          {sectionErrors.lowStock ? (
            <p className="text-sm text-amber-700">Unable to load inventory. {sectionErrors.lowStock}</p>
          ) : lowStockProducts.length === 0 ? (
            <p className="text-sm text-gray-500">No low-stock products.</p>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.map((p) => (
                <div key={p.name} className="flex justify-between text-sm py-2 border-b last:border-0">
                  <span className="text-gray-800">{p.name}</span>
                  <span className={p.status === 'critical' ? 'text-red-600 font-medium' : 'text-amber-600'}>
                    {p.stock} left
                  </span>
                </div>
              ))}
            </div>
          )}

          <h2 className="font-semibold text-gray-900 mt-6 mb-4">Products</h2>
          {sectionErrors.topProducts ? (
            <p className="text-sm text-amber-700">Unable to load products.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {topProducts.map((p) => (
                <Link key={p.id} href={`/admin/products`} className="border rounded-lg p-2 hover:bg-gray-50">
                  <p className="text-xs font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">Stock {p.stock}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
