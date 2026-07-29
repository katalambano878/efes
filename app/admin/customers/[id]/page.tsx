'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { money } from '@/lib/format-money';

export default function CustomerDetailsPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) fetchCustomerData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when customerId changes
  }, [customerId]);

  const fetchCustomerData = async () => {
    try {
      setLoading(true);
      const { data: row, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (customerError) throw customerError;

      const email = row.email;
      let ordersQuery = supabase.from('orders').select('*').order('created_at', { ascending: false });

      if (row.user_id) {
        ordersQuery = ordersQuery.eq('user_id', row.user_id);
      } else if (email) {
        ordersQuery = ordersQuery.eq('email', email);
      } else {
        ordersQuery = ordersQuery.eq('email', '__none__');
      }

      const { data: ordersData } = await ordersQuery;

      setCustomer(row);
      setOrders(ordersData || []);
    } catch (err) {
      console.error('Error fetching customer:', err);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  };

  const displayName =
    customer?.full_name ||
    (customer?.first_name && customer?.last_name
      ? `${customer.first_name} ${customer.last_name}`
      : null) ||
    customer?.first_name ||
    'No Name';

  const handleEmail = () => {
    const email = customer?.email;
    if (!email || email.endsWith('@manual.local')) {
      alert('No valid email on file for this customer.');
      return;
    }
    window.location.href = `mailto:${encodeURIComponent(email)}`;
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${displayName}? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/customers/${customerId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = '/admin/customers';
    } else {
      alert(data.error || 'Could not delete customer');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading customer details...</div>;
  if (!customer) return <div className="p-8 text-center text-red-500">Customer not found</div>;

  const totalSpent = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <Link href="/admin/customers" className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
            <i className="ri-arrow-left-line text-xl"></i>
          </Link>
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-gray-900 text-2xl font-bold">
            {(displayName !== 'No Name' ? displayName : customer.email).charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-gray-500">{customer.email}</p>
          </div>
        </div>
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={handleEmail}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 cursor-pointer"
          >
            <i className="ri-mail-send-line mr-2"></i>
            Send Email
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 border border-red-200 text-red-700 rounded-lg font-medium hover:bg-red-50 cursor-pointer"
          >
            <i className="ri-delete-bin-line mr-2"></i>
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">Total Spent</p>
          <p className="text-2xl font-bold text-gray-900">GH₵{money(totalSpent)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">Last Order</p>
          <p className="text-xl font-bold text-gray-900">
            {orders[0] ? new Date(orders[0].created_at).toLocaleDateString() : 'Never'}
          </p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <p className="text-sm font-medium text-gray-500 mb-1">Phone</p>
          <p className="text-lg font-bold text-gray-900">{customer.phone || 'N/A'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Order History</h2>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No orders found.</div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4">Order ID</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-700">
                    <Link href={`/admin/orders/${order.id}`}>#{order.id.slice(0, 8)}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                      ${order.status === 'completed' || order.status === 'delivered' ? 'bg-gray-100 text-gray-800' :
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                            order.status === 'dispatched_to_rider' ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'}`}
                    >
                      {order.status === 'dispatched_to_rider' ? 'Dispatched To Rider' : order.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    GH₵{money(order.total || 0)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/orders/${order.id}`} className="text-gray-400 hover:text-gray-700">
                      <i className="ri-eye-line text-lg"></i>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
