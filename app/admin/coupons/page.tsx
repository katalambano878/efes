'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number | null;
  per_user_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

const TYPE_LABELS: Record<CouponType, string> = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed Amount',
  free_shipping: 'Free Shipping',
};

const emptyForm = {
  code: '',
  description: '',
  type: 'percentage' as CouponType,
  value: '',
  minimum_purchase: '',
  maximum_discount: '',
  usage_limit: '',
  start_date: '',
  end_date: '',
  is_active: true,
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Error fetching coupons:', error);
    } else if (data) {
      setCoupons(data as Coupon[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const isActive = (c: Coupon) => {
    if (!c.is_active) return false;
    if (c.end_date && new Date(c.end_date) < new Date()) return false;
    return true;
  };

  const statusLabel = (c: Coupon) => {
    if (!c.is_active) return 'Disabled';
    if (c.start_date && new Date(c.start_date) > new Date()) return 'Scheduled';
    if (c.end_date && new Date(c.end_date) < new Date()) return 'Expired';
    return 'Active';
  };

  const statusColors: Record<string, string> = {
    Active: 'bg-green-100 text-green-700',
    Scheduled: 'bg-blue-100 text-blue-700',
    Expired: 'bg-gray-100 text-gray-700',
    Disabled: 'bg-red-100 text-red-700',
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setError('');
    setShowModal(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description || '',
      type: c.type,
      value: String(c.value ?? ''),
      minimum_purchase: c.minimum_purchase != null ? String(c.minimum_purchase) : '',
      maximum_discount: c.maximum_discount != null ? String(c.maximum_discount) : '',
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : '',
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
      is_active: c.is_active,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.code.trim()) {
      setError('Coupon code is required.');
      return;
    }
    if (form.type !== 'free_shipping' && (!form.value || Number(form.value) <= 0)) {
      setError('Enter a discount value greater than 0.');
      return;
    }

    setSaving(true);

    const payload: Record<string, any> = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      type: form.type,
      value: form.type === 'free_shipping' ? 0 : Number(form.value),
      minimum_purchase: form.minimum_purchase ? Number(form.minimum_purchase) : 0,
      maximum_discount: form.maximum_discount ? Number(form.maximum_discount) : null,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      start_date: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_date: form.end_date ? new Date(form.end_date).toISOString() : null,
      is_active: form.is_active,
    };

    let result;
    if (editingId) {
      result = await supabase.from('coupons').update(payload).eq('id', editingId);
    } else {
      result = await supabase.from('coupons').insert([payload]);
    }

    setSaving(false);

    if (result.error) {
      if (result.error.code === '23505') {
        setError('A coupon with this code already exists.');
      } else {
        setError(result.error.message);
      }
      return;
    }

    setShowModal(false);
    fetchCoupons();
  };

  const handleToggleActive = async (c: Coupon) => {
    await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    fetchCoupons();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) {
      alert('Failed to delete: ' + error.message);
      return;
    }
    setDeletingId(null);
    fetchCoupons();
  };

  const activeCoupons = coupons.filter(isActive);
  const totalUses = coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0);

  const formatValue = (c: Coupon) => {
    if (c.type === 'percentage') return `${c.value}%`;
    if (c.type === 'fixed_amount') return `GH₵ ${Number(c.value).toFixed(2)}`;
    return 'Free Shipping';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons & Promotions</h1>
          <p className="text-gray-600 mt-1">Create and manage discount codes</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
        >
          <i className="ri-add-line mr-2"></i>
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Coupons</p>
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-gray-900">{activeCoupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Uses</p>
          <p className="text-2xl font-bold text-gray-900">{totalUses}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">All Coupons</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Code</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Type</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Value</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Min Purchase</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Usage</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Valid Period</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">Loading coupons...</td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-gray-500">No coupons yet. Create your first one.</td></tr>
              ) : (
                coupons.map((coupon) => {
                  const status = statusLabel(coupon);
                  return (
                    <tr key={coupon.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">{coupon.code}</span>
                      </td>
                      <td className="py-4 px-4 text-gray-700">{TYPE_LABELS[coupon.type]}</td>
                      <td className="py-4 px-4 font-semibold text-gray-900">{formatValue(coupon)}</td>
                      <td className="py-4 px-4 text-gray-700 whitespace-nowrap">
                        {coupon.minimum_purchase && coupon.minimum_purchase > 0 ? `GH₵ ${Number(coupon.minimum_purchase).toFixed(2)}` : 'No minimum'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-900 font-semibold">{coupon.usage_count || 0}</span>
                          <span className="text-gray-500">/</span>
                          <span className="text-gray-600">{coupon.usage_limit || '∞'}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-700 whitespace-nowrap">{coupon.start_date ? new Date(coupon.start_date).toLocaleDateString() : 'Anytime'}</p>
                        <p className="text-sm text-gray-500 whitespace-nowrap">{coupon.end_date ? new Date(coupon.end_date).toLocaleDateString() : 'No expiry'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => handleToggleActive(coupon)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer ${statusColors[status] || 'bg-gray-100'}`}
                          title="Click to toggle active"
                        >
                          {status}
                        </button>
                      </td>
                      <td className="py-4 px-4">
                        {deletingId === coupon.id ? (
                          <div className="flex items-center space-x-2">
                            <button onClick={() => handleDelete(coupon.id)} className="text-xs font-semibold text-white bg-red-600 px-2 py-1 rounded cursor-pointer">Confirm</button>
                            <button onClick={() => setDeletingId(null)} className="text-xs font-semibold text-gray-600 px-2 py-1 rounded cursor-pointer">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => openEdit(coupon)}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <i className="ri-edit-line text-lg"></i>
                            </button>
                            <button
                              onClick={() => setDeletingId(coupon.id)}
                              className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <i className="ri-delete-bin-line text-lg"></i>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-gray-900">{editingId ? 'Edit Coupon' : 'Create Coupon'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                  <i className="ri-error-warning-line text-lg" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Coupon Code *</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  required
                  placeholder="e.g. WELCOME10"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. 10% off your first order"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type *</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CouponType }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed_amount">Fixed Amount (GH₵)</option>
                    <option value="free_shipping">Free Shipping</option>
                  </select>
                </div>
                {form.type !== 'free_shipping' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      {form.type === 'percentage' ? 'Percent *' : 'Amount (GH₵) *'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.value}
                      onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                      placeholder={form.type === 'percentage' ? '10' : '20'}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Min. Purchase (GH₵)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minimum_purchase}
                    onChange={(e) => setForm((f) => ({ ...f, minimum_purchase: e.target.value }))}
                    placeholder="0"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                  />
                </div>
                {form.type === 'percentage' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Max. Discount (GH₵)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.maximum_discount}
                      onChange={(e) => setForm((f) => ({ ...f, maximum_discount: e.target.value }))}
                      placeholder="Optional cap"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Usage Limit</label>
                  <input
                    type="number"
                    min="0"
                    value={form.usage_limit}
                    onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
                    placeholder="Unlimited"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <span className="text-sm font-medium text-gray-700">Active</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-gray-600 focus:border-gray-600 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
