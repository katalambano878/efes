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

interface CardDraft {
    delivery_fee: string;
    delivery_notes: string;
    failure_reason: string;
    showFail: boolean;
    extrasOpen: boolean;
}

const STATUS_STYLES: Record<string, { badge: string; accent: string; label: string }> = {
    assigned: { badge: 'bg-amber-50 text-amber-800 border-amber-200', accent: 'border-l-amber-500', label: 'Ready for pickup' },
    picked_up: { badge: 'bg-blue-50 text-blue-800 border-blue-200', accent: 'border-l-blue-500', label: 'Out for delivery' },
    in_transit: { badge: 'bg-blue-50 text-blue-800 border-blue-200', accent: 'border-l-blue-500', label: 'Out for delivery' },
    delivered: { badge: 'bg-green-50 text-green-800 border-green-200', accent: 'border-l-green-500', label: 'Delivered' },
    failed: { badge: 'bg-red-50 text-red-800 border-red-200', accent: 'border-l-red-500', label: 'Failed' },
    returned: { badge: 'bg-gray-50 text-gray-700 border-gray-200', accent: 'border-l-gray-400', label: 'Returned' },
};

function formatAddress(addr: Record<string, string>) {
    const line1 = addr.address || '';
    const line2 = [addr.city, addr.region].filter(Boolean).join(', ');
    return { line1, line2, full: [line1, line2].filter(Boolean).join(', ') || 'No address on file' };
}

function mapsUrl(addr: Record<string, string>) {
    const { full } = formatAddress(addr);
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
}

function draftFromAssignment(a: Assignment): CardDraft {
    return {
        delivery_fee: a.delivery_fee != null && a.delivery_fee > 0 ? String(a.delivery_fee) : '',
        delivery_notes: a.delivery_notes || '',
        failure_reason: '',
        showFail: false,
        extrasOpen: !!(a.delivery_fee > 0 || a.delivery_notes),
    };
}

function primaryAction(status: string): { label: string; sub: string; nextStatus: string; icon: string } | null {
    if (status === 'assigned') {
        return { label: 'I picked up this order', sub: 'Tap when you have the package', nextStatus: 'picked_up', icon: 'ri-hand-heart-line' };
    }
    if (status === 'picked_up' || status === 'in_transit') {
        return { label: 'Delivered to customer', sub: 'Tap when handoff is complete', nextStatus: 'delivered', icon: 'ri-checkbox-circle-line' };
    }
    return null;
}

function stepIndex(status: string): number {
    if (status === 'assigned') return 0;
    if (status === 'picked_up' || status === 'in_transit') return 1;
    if (status === 'delivered') return 2;
    return -1;
}

function DeliveryProgress({ status }: { status: string }) {
    const current = stepIndex(status);
    const steps = ['Pick up', 'Deliver'];
    if (current < 0) return null;

    return (
        <div className="px-1 py-3">
            <div className="flex items-center">
                {steps.map((label, i) => {
                    const done = current > i;
                    const active = current === i;
                    return (
                        <div key={label} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center min-w-[4.5rem]">
                                <div
                                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                                        done ? 'bg-green-600 text-white'
                                            : active ? 'bg-gray-900 text-white ring-4 ring-gray-200'
                                                : 'bg-gray-100 text-gray-400'
                                    }`}
                                >
                                    {done ? <i className="ri-check-line text-lg" /> : i + 1}
                                </div>
                                <span className={`text-[11px] font-semibold mt-1.5 ${active || done ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {label}
                                </span>
                            </div>
                            {i < steps.length - 1 && (
                                <div className={`h-1 flex-1 mx-1 rounded-full mb-5 ${current > i ? 'bg-green-500' : 'bg-gray-200'}`} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function MyDeliveriesPage() {
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [rider, setRider] = useState<{ full_name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [filter, setFilter] = useState('active');
    const [toast, setToast] = useState('');
    const [cardDrafts, setCardDrafts] = useState<Record<string, CardDraft>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    }, []);

    const fetchData = useCallback(async () => {
        try {
            const headers = await authHeaders();
            const res = await fetch('/api/delivery/my-deliveries', { credentials: 'include', headers });
            const data = await res.json();
            const list: Assignment[] = data.assignments || [];
            setAssignments(list);
            setRider(data.rider || null);
            setMessage(data.message || '');
            setCardDrafts(prev => {
                const next = { ...prev };
                for (const a of list) {
                    if (!next[a.id]) next[a.id] = draftFromAssignment(a);
                }
                return next;
            });
        } catch {
            setMessage('Could not load your deliveries.');
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { fetchData(); }, [fetchData]);

    function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

    function getDraft(a: Assignment): CardDraft {
        return cardDrafts[a.id] ?? draftFromAssignment(a);
    }

    function setDraft(a: Assignment, patch: Partial<CardDraft>) {
        setCardDrafts(prev => ({ ...prev, [a.id]: { ...getDraft(a), ...patch } }));
    }

    async function patchAssignment(
        a: Assignment,
        body: { status?: string; delivery_fee?: string | null; delivery_notes?: string | null; failure_reason?: string | null }
    ) {
        setBusyId(a.id);
        try {
            const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };
            const res = await fetch('/api/delivery/my-deliveries', {
                method: 'PATCH',
                headers,
                credentials: 'include',
                body: JSON.stringify({ id: a.id, ...body }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return data;
        } finally {
            setBusyId(null);
        }
    }

    async function handlePrimaryAction(a: Assignment) {
        const action = primaryAction(a.status);
        if (!action) return;
        const draft = getDraft(a);
        try {
            await patchAssignment(a, {
                status: action.nextStatus,
                delivery_fee: draft.delivery_fee === '' ? null : draft.delivery_fee,
                delivery_notes: draft.delivery_notes || null,
            });
            showToast(action.nextStatus === 'delivered' ? 'Delivery completed' : 'Marked as picked up');
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    async function handleSaveDetails(a: Assignment) {
        const draft = getDraft(a);
        try {
            await patchAssignment(a, {
                delivery_fee: draft.delivery_fee === '' ? null : draft.delivery_fee,
                delivery_notes: draft.delivery_notes || null,
            });
            showToast('Fee and notes saved');
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    async function handleFailed(a: Assignment) {
        const draft = getDraft(a);
        if (!draft.failure_reason.trim()) {
            showToast('Error: Add a short reason first');
            return;
        }
        try {
            await patchAssignment(a, {
                status: 'failed',
                failure_reason: draft.failure_reason.trim(),
                delivery_fee: draft.delivery_fee === '' ? null : draft.delivery_fee,
                delivery_notes: draft.delivery_notes || null,
            });
            showToast('Marked as could not deliver');
            fetchData();
        } catch (err: any) {
            showToast(`Error: ${err.message}`);
        }
    }

    const visible = assignments.filter(a => {
        if (filter === 'active') return !['delivered', 'failed', 'returned'].includes(a.status);
        if (filter === 'completed') return ['delivered', 'failed', 'returned'].includes(a.status);
        return true;
    });

    const activeCount = assignments.filter(a => !['delivered', 'failed', 'returned'].includes(a.status)).length;

    return (
        <div className="space-y-5 max-w-lg mx-auto pb-10">
            {toast && (
                <div className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-center ${
                    toast.startsWith('Error') ? 'bg-red-600 text-white' : 'bg-gray-900 text-white'
                }`}>{toast}</div>
            )}

            <header>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">My Deliveries</h1>
                <p className="text-gray-500 text-sm mt-1">
                    {rider ? `${rider.full_name} · ${activeCount} job${activeCount === 1 ? '' : 's'} to finish` : 'Your delivery list'}
                </p>
            </header>

            {message && !rider && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
                    <i className="ri-information-line mr-1" /> {message}
                </div>
            )}

            <div className="flex p-1 bg-gray-100 rounded-xl">
                {(['active', 'completed', 'all'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all ${
                            filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                    <i className="ri-loader-4-line animate-spin text-3xl mb-3" />
                    <p className="text-sm">Loading your deliveries...</p>
                </div>
            ) : visible.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-14 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-e-bike-2-line text-3xl text-gray-400" />
                    </div>
                    <p className="font-semibold text-gray-800">Nothing here</p>
                    <p className="text-sm text-gray-500 mt-1">No {filter !== 'all' ? filter : ''} deliveries right now</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {visible.map(a => {
                        const addr = (a.orders?.shipping_address || {}) as Record<string, string>;
                        const address = formatAddress(addr);
                        const draft = getDraft(a);
                        const action = primaryAction(a.status);
                        const isActive = !['delivered', 'failed', 'returned'].includes(a.status);
                        const busy = busyId === a.id;
                        const phone = a.orders?.phone;
                        const style = STATUS_STYLES[a.status] || STATUS_STYLES.assigned;

                        return (
                            <article
                                key={a.id}
                                className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ${style.accent}`}
                            >
                                {/* Header */}
                                <div className="px-4 pt-4 pb-0 flex items-center justify-between gap-2">
                                    <p className="font-bold text-gray-900 text-lg leading-tight">
                                        #{a.orders?.order_number}
                                    </p>
                                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.badge}`}>
                                        {style.label}
                                    </span>
                                </div>

                                {isActive && <div className="px-4 border-b border-gray-100"><DeliveryProgress status={a.status} /></div>}

                                {/* Where to go */}
                                <section className="px-4 py-4 border-b border-gray-100">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Deliver to</p>
                                    <p className="text-base font-semibold text-gray-900 leading-snug">{address.line1 || address.full}</p>
                                    {address.line2 && <p className="text-sm text-gray-600 mt-0.5">{address.line2}</p>}
                                    <a
                                        href={mapsUrl(addr)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-3 flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
                                    >
                                        <i className="ri-map-pin-2-line text-lg" />
                                        Open in Google Maps
                                    </a>
                                </section>

                                {/* Customer */}
                                <section className="px-4 py-4 border-b border-gray-100">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Customer</p>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-lg font-semibold text-gray-900 truncate">{phone || 'No phone'}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                Order value · GH₵ {a.orders?.total?.toFixed(2) ?? '0.00'}
                                            </p>
                                        </div>
                                        {phone && (
                                            <a
                                                href={`tel:${phone}`}
                                                className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                                aria-label="Call customer"
                                            >
                                                <i className="ri-phone-fill text-2xl" />
                                                <span className="text-[10px] font-bold mt-0.5">Call</span>
                                            </a>
                                        )}
                                    </div>
                                </section>

                                {/* Primary action — the main thing riders do */}
                                {isActive && action && (
                                    <section className="px-4 py-4 bg-gray-50 border-b border-gray-100">
                                        <button
                                            type="button"
                                            onClick={() => handlePrimaryAction(a)}
                                            disabled={busy}
                                            className={`w-full py-4 px-4 rounded-2xl font-bold text-base transition-all disabled:opacity-60 flex flex-col items-center gap-0.5 shadow-md active:scale-[0.98] ${
                                                action.nextStatus === 'delivered'
                                                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/25'
                                                    : 'bg-gray-900 hover:bg-gray-800 text-white shadow-gray-900/20'
                                            }`}
                                        >
                                            {busy ? (
                                                <span className="flex items-center gap-2"><i className="ri-loader-4-line animate-spin" /> Updating...</span>
                                            ) : (
                                                <>
                                                    <span className="flex items-center gap-2">
                                                        <i className={`${action.icon} text-xl`} />
                                                        {action.label}
                                                    </span>
                                                    <span className={`text-xs font-medium mt-1 ${action.nextStatus === 'delivered' ? 'text-green-100' : 'text-gray-400'}`}>
                                                        {action.sub}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </section>
                                )}

                                {/* Optional fee & notes — tucked away, not in the way */}
                                {isActive && (
                                    <section className="px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => setDraft(a, { extrasOpen: !draft.extrasOpen })}
                                            className="w-full flex items-center justify-between py-2 text-sm text-gray-600 hover:text-gray-900"
                                        >
                                            <span className="font-medium">Delivery fee & notes (optional)</span>
                                            <i className={`ri-arrow-down-s-line text-lg transition-transform ${draft.extrasOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {draft.extrasOpen && (
                                            <div className="mt-2 space-y-3 pb-1">
                                                <p className="text-xs text-gray-500 leading-relaxed">
                                                    Only if you need to record a fee in the system. You can also tell the customer the amount in person.
                                                </p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-1">Fee (GH₵)</label>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={draft.delivery_fee}
                                                            onChange={e => setDraft(a, { delivery_fee: e.target.value })}
                                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                                                            placeholder="40"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                                                        <input
                                                            type="text"
                                                            value={draft.delivery_notes}
                                                            onChange={e => setDraft(a, { delivery_notes: e.target.value })}
                                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                                                            placeholder="Handle with care"
                                                        />
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSaveDetails(a)}
                                                    disabled={busy}
                                                    className="text-sm font-semibold text-gray-700 underline underline-offset-2 disabled:opacity-50"
                                                >
                                                    Save without changing status
                                                </button>
                                            </div>
                                        )}
                                    </section>
                                )}

                                {/* Completed summary */}
                                {!isActive && (a.delivery_fee > 0 || a.delivery_notes) && (
                                    <section className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100 bg-gray-50/50">
                                        {a.delivery_fee > 0 && <p>Fee recorded: GH₵ {a.delivery_fee.toFixed(2)}</p>}
                                        {a.delivery_notes && <p className="italic mt-1">{a.delivery_notes}</p>}
                                    </section>
                                )}

                                {/* Problem path */}
                                {isActive && (
                                    <footer className="px-4 py-3 border-t border-gray-100">
                                        {!draft.showFail ? (
                                            <button
                                                type="button"
                                                onClick={() => setDraft(a, { showFail: true })}
                                                className="text-sm text-gray-500 hover:text-red-600 transition-colors"
                                            >
                                                Problem with this delivery?
                                            </button>
                                        ) : (
                                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                                                <p className="text-sm font-semibold text-red-900">What went wrong?</p>
                                                <input
                                                    type="text"
                                                    value={draft.failure_reason}
                                                    onChange={e => setDraft(a, { failure_reason: e.target.value })}
                                                    className="w-full px-3 py-2.5 border border-red-200 rounded-lg text-sm bg-white"
                                                    placeholder="e.g. Customer not available"
                                                    autoFocus
                                                />
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDraft(a, { showFail: false, failure_reason: '' })}
                                                        className="flex-1 py-2.5 text-sm font-medium text-red-800 rounded-lg hover:bg-red-100"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleFailed(a)}
                                                        disabled={busy}
                                                        className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-lg disabled:opacity-50"
                                                    >
                                                        Confirm
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </footer>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
