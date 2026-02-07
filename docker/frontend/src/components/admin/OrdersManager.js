import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  ShoppingBag, Package, Truck, CheckCircle, Clock, XCircle,
  ChevronDown, ChevronUp, Mail, Phone, MapPin, Image, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  paid: { label: 'Paid', icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
  processing: { label: 'Processing', icon: Package, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  shipped: { label: 'Shipped', icon: Truck, color: 'text-purple-400', bg: 'bg-purple-400/10' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
};

export function OrdersManager() {
  const { token } = useAuth();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [filterStatus]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const statusParam = filterStatus !== 'all' ? `?status=${filterStatus}` : '';
      const res = await fetch(`${API}/orders${statusParam}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
      }
    } catch (e) {
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/orders/stats/summary`, { headers });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch stats');
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      const res = await fetch(`${API}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success(`Order updated to ${newStatus}`);
        fetchOrders();
        fetchStats();
      } else {
        toast.error('Failed to update order');
      }
    } catch (e) {
      toast.error('Failed to update order');
    }
  };

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatPrice = (price) => `£${price.toFixed(2)}`;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
            <ShoppingBag className="w-7 h-7 text-[#ad946d]" />
            Print Orders
          </h1>
          <p className="text-gray-400 mt-1">Manage customer print orders</p>
        </div>
        <Button
          variant="outline"
          onClick={() => { fetchOrders(); fetchStats(); }}
          className="border-[#333] text-gray-300 hover:bg-[#252525]"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-gray-400 text-sm">Total Orders</p>
            <p className="text-2xl font-semibold text-white">{stats.total_orders}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-yellow-400 text-sm">Pending</p>
            <p className="text-2xl font-semibold text-white">{stats.pending}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-green-400 text-sm">Paid</p>
            <p className="text-2xl font-semibold text-white">{stats.paid}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-blue-400 text-sm">Processing</p>
            <p className="text-2xl font-semibold text-white">{stats.processing}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-purple-400 text-sm">Shipped</p>
            <p className="text-2xl font-semibold text-white">{stats.shipped}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
            <p className="text-emerald-400 text-sm">Completed</p>
            <p className="text-2xl font-semibold text-white">{stats.completed}</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg border border-[#ad946d]/30 p-4">
            <p className="text-[#ad946d] text-sm">Revenue</p>
            <p className="text-2xl font-semibold text-white">{formatPrice(stats.total_revenue)}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-4">
        <span className="text-gray-400 text-sm">Filter:</span>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40 bg-[#1a1a1a] border-[#333] text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#1a1a1a] border-[#333]">
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No orders yet</p>
            <p className="text-gray-500 text-sm mt-1">Orders will appear here when customers place them</p>
          </div>
        ) : (
          orders.map((order, index) => {
            const statusConfig = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;
            const isExpanded = expandedOrder === order.id;

            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden"
              >
                {/* Order Header */}
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-[#202020]"
                  onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${statusConfig.bg}`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    </div>
                    <div>
                      <p className="text-white font-medium">{order.order_number}</p>
                      <p className="text-gray-400 text-sm">{order.gallery_name}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-white font-semibold">{formatPrice(order.total)}</p>
                      <p className="text-gray-500 text-xs">{order.items?.length || 0} items</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-sm">{formatDate(order.created_at)}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-[#2a2a2a] p-4 space-y-4">
                    {/* Customer Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <h4 className="text-gray-400 text-sm font-medium">Customer</h4>
                        <div className="flex items-center gap-2 text-white">
                          <Mail className="w-4 h-4 text-gray-500" />
                          {order.customer_email}
                        </div>
                        <div className="flex items-center gap-2 text-white">
                          <Phone className="w-4 h-4 text-gray-500" />
                          {order.delivery_address?.phone || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-gray-400 text-sm font-medium">Delivery Address</h4>
                        <div className="flex items-start gap-2 text-white">
                          <MapPin className="w-4 h-4 text-gray-500 mt-0.5" />
                          <div>
                            <p>{order.delivery_address?.name}</p>
                            <p>{order.delivery_address?.line1}</p>
                            {order.delivery_address?.line2 && <p>{order.delivery_address.line2}</p>}
                            <p>{order.delivery_address?.city}, {order.delivery_address?.county}</p>
                            <p>{order.delivery_address?.postcode}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Order Items */}
                    <div>
                      <h4 className="text-gray-400 text-sm font-medium mb-2">Items</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {order.items?.map((item, idx) => (
                          <div key={idx} className="bg-[#252525] rounded-lg p-2">
                            <div className="aspect-square bg-[#1a1a1a] rounded mb-2 flex items-center justify-center overflow-hidden">
                              {item.thumbnail_url ? (
                                <img 
                                  src={`${BACKEND_URL}${item.thumbnail_url}`}
                                  alt={item.file_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Image className="w-8 h-8 text-gray-600" />
                              )}
                            </div>
                            <p className="text-white text-sm truncate">{item.file_name}</p>
                            <p className="text-gray-400 text-xs">{item.size} - {item.paper_type}</p>
                            <p className="text-[#ad946d] text-sm">{formatPrice(item.price)} x {item.quantity}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Order Total */}
                    <div className="flex justify-between items-center pt-4 border-t border-[#333]">
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between gap-8">
                          <span className="text-gray-400">Subtotal:</span>
                          <span className="text-white">{formatPrice(order.subtotal)}</span>
                        </div>
                        <div className="flex justify-between gap-8">
                          <span className="text-gray-400">Shipping:</span>
                          <span className="text-white">{formatPrice(order.shipping)}</span>
                        </div>
                        <div className="flex justify-between gap-8 font-semibold">
                          <span className="text-gray-300">Total:</span>
                          <span className="text-[#ad946d]">{formatPrice(order.total)}</span>
                        </div>
                      </div>

                      {/* Status Update */}
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm">Update Status:</span>
                        <Select 
                          value={order.status} 
                          onValueChange={(value) => updateStatus(order.id, value)}
                        >
                          <SelectTrigger className="w-36 bg-[#252525] border-[#333] text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#252525] border-[#333]">
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="processing">Processing</SelectItem>
                            <SelectItem value="shipped">Shipped</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
