'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Order {
    id: string; order_number: string; email: string; phone: string;
    shipping_address: any; shipping_method: string; total: number; status: string; created_at: string;
}

interface Assignment {
    id: string; order_id: string; status: string; priority: string;
    assigned_at: string; delivery_notes: string | null; failure_reason: string | null;
    delivery_fee: number; orders: Order | null;
}

const STATUS_COLORS: Record<string, string> = {
    assigned: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    picked_up: 'bg-blue-100 text-blue-800 border-blue-200',
    in_transit: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    delivered: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    returned: 'bg-gray-100 text-gray-800 border-gray-200',
};

const STATUS_ICONS: Record<string, string> = {
    assigned: 'ri-time-line', picked_up: 'ri-hand-heart-line', in_transit: 'ri-truck-line',
    delivered: 'ri-checkbox-circle-line', failed: 'ri-close-circle-line', returned: 'ri-arrow-go-back-line',
};

// What a rider can transition to next
const NEXT_STATUSES: Record<string, string[]> = {
    assigned: ['picked_up', 'failed'],
    picked_up: ['in_transit', 'failed'],
    in_transit: ['delivered', 'failed'],
    delivered: [],
    failed: [],
    returned: [],
};

export default function MyDeliveriesPage() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [rider, setRider] = useState<{ full_name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [filter, setFilter] = useState('active');
    const [toast, setToast] = useState('');

    const [updating, setUpdating] = useState<Assignment | null>(null);
    const [form, setForm] = useState({ status: '', delivery_fee: '', delivery_notes: '', failure_reason: '' });
    const [saving, setSaving] = useState(false);

    const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const headers = await authHeaders();
            const res = await fetch('/api/delivery/my-deliveries', { credentials: 'include', headers });
            const data = await res.json();
            setAssignments(data.assignments || []);
            setRider(data.rider || null);
            setMessage(data.message || '');
        } catch {
            setMessage('Could not load your deliveries.');
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

    function openUpdate(a: Assignment) {
        setUpdating(a);
        setForm({
            status: a.status,
            delivery_fee: a.delivery_fee != null ? String(a.delivery_fee) : '',
            delivery_notes: a.delivery_notes || '',
            failure_reason: '',
        });
    }

    async function saveUpdate() {
        if (!updating) return;
        setSaving(true);
        try {
            const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
            const res = await fetch('/api/delivery/my-deliveries', {
                method: 'PATCH',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    id: updating.id,
                    status: form.status,
                    delivery_fee: form.delivery_fee === '' ? null : form.delivery_fee,
                    delivery_notes: form.delivery_notes || null,
                    failure_reason: form.failure_reason || null,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Delivery updated');
            setUpdating(null);
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    }

    const visible = assignments.filter(a => {
        if (filter === 'active') return !['delivered', 'failed', 'returned'].includes(a.status);
        if (filter === 'completed') return ['delivered', 'failed', 'returned'].includes(a.status);
        return true;
    });

    const activeCount = assignments.filter(a => !['delivered', 'failed', 'returned'].includes(a.status)).length;

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
                    toast.startsWith('Error') ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'
                }`}>{toast}</div>
            )}

            <div>
                <h1 className="text-2xl font-bold text-gray-900">My Deliveries</h1>
                <p className="text-gray-500 mt-1">
                    {rider ? `Hi ${rider.full_name} — you have ${activeCount} active deliver${activeCount === 1 ? 'y' : 'ies'}` : 'Your assigned deliveries'}
                </p>
            </div>

            {message && !rider && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <i className="ri-information-line mr-1" /> {message}
                </div>
            )}

            <div className="flex gap-2">
                {['active', 'completed', 'all'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                            filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>{f}</button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-2xl mr-2" /> Loading...
                </div>
            ) : visible.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-400">
                    <i className="ri-e-bike-2-line text-4xl mb-3 block" />
                    <p className="font-medium">No {filter !== 'all' ? filter : ''} deliveries right now</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visible.map(a => {
                        const addr = a.orders?.shipping_address || {};
                        return (
                            <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-gray-900">#{a.orders?.order_number}</span>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[a.status]}`}>
                                                <i className={STATUS_ICONS[a.status]} /> {a.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm text-gray-600 space-y-1">
                                            <p><i className="ri-map-pin-line mr-1.5 text-gray-400" />{[addr.address, addr.city, addr.region].filter(Boolean).join(', ') || 'No address'}</p>
                                            <p>
                                                <i className="ri-phone-line mr-1.5 text-gray-400" />
                                                <a href={`tel:${a.orders?.phone}`} className="text-blue-600 font-medium">{a.orders?.phone || a.orders?.email}</a>
                                            </p>
                                            <p><i className="ri-shopping-bag-line mr-1.5 text-gray-400" />Order total: GH₵ {a.orders?.total?.toFixed(2)}</p>
                                            <p><i className="ri-cash-line mr-1.5 text-gray-400" />Delivery fee: {a.delivery_fee > 0 ? `GH₵ ${a.delivery_fee.toFixed(2)}` : 'Not set'}</p>
                                            {a.delivery_notes && <p className="text-gray-500 italic"><i className="ri-sticky-note-line mr-1.5" />{a.delivery_notes}</p>}
                                        </div>
                                    </div>
                                </div>
                                {!['delivered', 'failed', 'returned'].includes(a.status) && (
                                    <button onClick={() => openUpdate(a)}
                                        className="mt-3 w-full py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">
                                        Update Delivery
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Update Modal */}
            {updating && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
                            <h2 className="text-lg font-bold text-gray-900">Update #{updating.orders?.order_number}</h2>
                            <button onClick={() => setUpdating(null)} className="p-2 hover:bg-gray-100 rounded-lg"><i className="ri-close-line text-xl" /></button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Mark as</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {[updating.status, ...NEXT_STATUSES[updating.status]].map(s => (
                                        <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                                            className={`p-3 rounded-xl border-2 text-center text-xs font-semibold capitalize transition-colors ${
                                                form.status === s ? 'border-gray-700 bg-gray-50 text-gray-900' : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}>
                                            <i className={`${STATUS_ICONS[s]} text-lg block mb-1`} />
                                            {s.replace('_', ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Delivery Fee (GH₵) <span className="text-gray-400 font-normal">— optional</span></label>
                                <input type="number" step="0.01" min="0" value={form.delivery_fee}
                                    onChange={e => setForm(f => ({ ...f, delivery_fee: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600"
                                    placeholder="Leave blank to tell the customer verbally" />
                            </div>

                            {form.status === 'failed' && (
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">Failure Reason *</label>
                                    <textarea value={form.failure_reason} onChange={e => setForm(f => ({ ...f, failure_reason: e.target.value }))}
                                        className="w-full px-4 py-3 border-2 border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 resize-none" rows={2}
                                        placeholder="Why did the delivery fail?" />
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">Notes</label>
                                <textarea value={form.delivery_notes} onChange={e => setForm(f => ({ ...f, delivery_notes: e.target.value }))}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-600 resize-none" rows={2}
                                    placeholder="Optional notes..." />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setUpdating(null)} className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
                                <button onClick={saveUpdate} disabled={saving || (form.status === 'failed' && !form.failure_reason)}
                                    className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 font-semibold disabled:opacity-50">
                                    {saving ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
