import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { 
  Tag, Plus, Trash2, Save, RefreshCw, Check, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/context/AuthContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export function ProductsManager() {
  const { token } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrices, setEditingPrices] = useState({});
  const [newProduct, setNewProduct] = useState({
    name: '',
    size: '',
    paper_type: 'gloss',
    price: 0
  });
  
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/print-products`, { headers });
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
        // Initialize editing prices
        const prices = {};
        data.forEach(p => { prices[p.id] = p.price; });
        setEditingPrices(prices);
      }
    } catch (e) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const initProducts = async () => {
    try {
      const res = await fetch(`${API}/print-products/init`, { 
        method: 'POST',
        headers 
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchProducts();
      }
    } catch (e) {
      toast.error('Failed to initialize products');
    }
  };

  const updateProduct = async (productId, updates) => {
    try {
      const res = await fetch(`${API}/print-products/${productId}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        toast.success('Product updated');
        fetchProducts();
      } else {
        toast.error('Failed to update product');
      }
    } catch (e) {
      toast.error('Failed to update product');
    }
  };

  const savePrice = async (productId) => {
    const price = parseFloat(editingPrices[productId]) || 0;
    await updateProduct(productId, { price });
  };

  const toggleActive = async (productId, currentActive) => {
    await updateProduct(productId, { active: !currentActive });
  };

  const deleteProduct = async (productId) => {
    if (!confirm('Delete this product?')) return;
    try {
      const res = await fetch(`${API}/print-products/${productId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        toast.success('Product deleted');
        fetchProducts();
      } else {
        toast.error('Failed to delete product');
      }
    } catch (e) {
      toast.error('Failed to delete product');
    }
  };

  const addProduct = async () => {
    if (!newProduct.name || !newProduct.size) {
      toast.error('Please fill in name and size');
      return;
    }
    try {
      const res = await fetch(`${API}/print-products`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct)
      });
      if (res.ok) {
        toast.success('Product added');
        setShowAddDialog(false);
        setNewProduct({ name: '', size: '', paper_type: 'gloss', price: 0 });
        fetchProducts();
      } else {
        toast.error('Failed to add product');
      }
    } catch (e) {
      toast.error('Failed to add product');
    }
  };

  // Group products by paper type
  const groupedProducts = products.reduce((acc, product) => {
    const type = product.paper_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(product);
    return acc;
  }, {});

  const paperTypeLabels = {
    matte: 'Matte Prints',
    lustre: 'Lustre Prints',
    silk: 'Silk Prints',
    gloss: 'Gloss Prints',
    canvas: 'Canvas',
    other: 'Other'
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
            <Tag className="w-7 h-7 text-[#ad946d]" />
            Print Products
          </h1>
          <p className="text-gray-400 mt-1">Manage print sizes and prices</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchProducts}
            className="border-[#333] text-gray-300 hover:bg-[#252525]"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {products.length === 0 && (
            <Button
              onClick={initProducts}
              className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
            >
              Initialize Default Products
            </Button>
          )}
          <Button
            onClick={() => setShowAddDialog(true)}
            className="bg-[#ad946d] hover:bg-[#9a8460] text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Products by Type */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading products...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-12">
          <Tag className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No products set up</p>
          <p className="text-gray-500 text-sm mt-1">Click "Initialize Default Products" to get started</p>
        </div>
      ) : (
        Object.entries(groupedProducts).map(([paperType, typeProducts]) => (
          <div key={paperType} className="space-y-3">
            <h2 className="text-lg font-medium text-white capitalize">
              {paperTypeLabels[paperType] || paperType}
            </h2>
            <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] overflow-hidden">
              <table className="w-full">
                <thead className="bg-[#252525] border-b border-[#333]">
                  <tr>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Product</th>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Size</th>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Price</th>
                    <th className="text-left p-4 text-gray-400 font-medium text-sm">Active</th>
                    <th className="text-right p-4 text-gray-400 font-medium text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {typeProducts.map((product, index) => (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-[#2a2a2a] hover:bg-[#202020]"
                    >
                      <td className="p-4">
                        <span className="text-white">{product.name}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-300">{product.size}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">£</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={editingPrices[product.id] ?? product.price}
                            onChange={(e) => setEditingPrices({
                              ...editingPrices,
                              [product.id]: e.target.value
                            })}
                            className="w-24 bg-[#252525] border-[#333] text-white"
                          />
                          {parseFloat(editingPrices[product.id]) !== product.price && (
                            <Button
                              size="sm"
                              onClick={() => savePrice(product.id)}
                              className="bg-green-600 hover:bg-green-700 text-white h-8 w-8 p-0"
                            >
                              <Save className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <Switch
                          checked={product.active}
                          onCheckedChange={() => toggleActive(product.id, product.active)}
                        />
                      </td>
                      <td className="p-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteProduct(product.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {/* Shipping Info */}
      <div className="bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-4">
        <p className="text-gray-400 text-sm">
          <strong className="text-white">Shipping:</strong> £2.50 flat rate (UK only) - applied at checkout
        </p>
      </div>

      {/* Add Product Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-[#1a1a1a] border-[#2a2a2a] text-white">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-gray-300">Product Name</Label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="e.g. 8x6 Gloss"
                className="mt-1 bg-[#252525] border-[#333] text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Size</Label>
              <Input
                value={newProduct.size}
                onChange={(e) => setNewProduct({ ...newProduct, size: e.target.value })}
                placeholder="e.g. 8x6"
                className="mt-1 bg-[#252525] border-[#333] text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300">Paper Type</Label>
              <Select 
                value={newProduct.paper_type} 
                onValueChange={(v) => setNewProduct({ ...newProduct, paper_type: v })}
              >
                <SelectTrigger className="mt-1 bg-[#252525] border-[#333] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-[#333]">
                  <SelectItem value="gloss">Gloss</SelectItem>
                  <SelectItem value="luster">Luster</SelectItem>
                  <SelectItem value="canvas">Canvas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-300">Price (£)</Label>
              <Input
                type="number"
                step="0.01"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })}
                className="mt-1 bg-[#252525] border-[#333] text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)} className="text-gray-400">
              Cancel
            </Button>
            <Button onClick={addProduct} className="bg-[#ad946d] hover:bg-[#9a8460] text-white">
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
