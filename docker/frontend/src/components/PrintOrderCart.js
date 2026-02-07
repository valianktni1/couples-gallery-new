import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ShoppingCart, X, Plus, Minus, Trash2, ChevronRight, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const SHIPPING_FEE = 2.50;
const MIN_ORDER = 15.00;

export function PrintOrderCart({ shareToken, isOpen, onClose }) {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState('cart'); // cart, details, confirm
  const [loading, setLoading] = useState(false);
  
  const [customerDetails, setCustomerDetails] = useState({
    email: '',
    name: '',
    line1: '',
    line2: '',
    city: '',
    county: '',
    postcode: '',
    phone: ''
  });

  useEffect(() => {
    fetchProducts();
    // Load cart from localStorage
    const saved = localStorage.getItem(`print_cart_${shareToken}`);
    if (saved) {
      try {
        setCart(JSON.parse(saved));
      } catch (e) {}
    }
  }, [shareToken]);

  useEffect(() => {
    // Save cart to localStorage
    localStorage.setItem(`print_cart_${shareToken}`, JSON.stringify(cart));
  }, [cart, shareToken]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API}/print-products?active_only=true`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.filter(p => p.price > 0)); // Only show priced products
      }
    } catch (e) {
      console.error('Failed to fetch products');
    }
  };

  const addToCart = (file, product) => {
    const existingIndex = cart.findIndex(
      item => item.file_id === file.id && item.product_id === product.id
    );
    
    if (existingIndex >= 0) {
      const newCart = [...cart];
      newCart[existingIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, {
        file_id: file.id,
        file_name: file.name,
        file_thumbnail: file.thumbnail_url,
        product_id: product.id,
        product_name: product.name,
        size: product.size,
        paper_type: product.paper_type,
        price: product.price,
        quantity: 1
      }]);
    }
    toast.success(`Added ${product.name} to cart`);
  };

  const updateQuantity = (index, delta) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  const removeItem = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const total = subtotal + SHIPPING_FEE;

  const validateDetails = () => {
    const required = ['email', 'name', 'line1', 'city', 'postcode', 'phone'];
    for (const field of required) {
      if (!customerDetails[field].trim()) {
        toast.error(`Please fill in ${field.replace('line1', 'address')}`);
        return false;
      }
    }
    // Basic email validation
    if (!customerDetails.email.includes('@')) {
      toast.error('Please enter a valid email');
      return false;
    }
    // UK postcode basic check
    if (customerDetails.postcode.length < 5) {
      toast.error('Please enter a valid UK postcode');
      return false;
    }
    return true;
  };

  const submitOrder = async () => {
    if (!validateDetails()) return;
    
    setLoading(true);
    try {
      const orderData = {
        share_token: shareToken,
        customer_email: customerDetails.email,
        delivery_address: {
          name: customerDetails.name,
          line1: customerDetails.line1,
          line2: customerDetails.line2,
          city: customerDetails.city,
          county: customerDetails.county,
          postcode: customerDetails.postcode,
          phone: customerDetails.phone
        },
        items: cart.map(item => ({
          file_id: item.file_id,
          file_name: item.file_name,
          product_id: item.product_id,
          product_name: item.product_name,
          size: item.size,
          paper_type: item.paper_type,
          quantity: item.quantity,
          price: item.price
        })),
        shipping: SHIPPING_FEE
      };

      const res = await fetch(`${API}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (res.ok) {
        const data = await res.json();
        setCart([]);
        localStorage.removeItem(`print_cart_${shareToken}`);
        setStep('confirm');
        toast.success('Order submitted successfully!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to submit order');
      }
    } catch (e) {
      toast.error('Failed to submit order');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => `£${price.toFixed(2)}`;

  // Group products by paper type for the selector
  const productsByType = products.reduce((acc, p) => {
    if (!acc[p.paper_type]) acc[p.paper_type] = [];
    acc[p.paper_type].push(p);
    return acc;
  }, {});

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#ad946d]" />
            {step === 'cart' && 'Your Print Order'}
            {step === 'details' && 'Delivery Details'}
            {step === 'confirm' && 'Order Confirmed!'}
          </DialogTitle>
        </DialogHeader>

        {/* Cart Step */}
        {step === 'cart' && (
          <div className="space-y-4">
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">Your cart is empty</p>
                <p className="text-gray-400 text-sm mt-1">
                  Click "Order Print" on any image to add it to your cart
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {cart.map((item, index) => (
                    <motion.div
                      key={`${item.file_id}-${item.product_id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="w-16 h-16 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                        {item.file_thumbnail && (
                          <img
                            src={`${BACKEND_URL}${item.file_thumbnail}`}
                            alt={item.file_name}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.file_name}</p>
                        <p className="text-xs text-gray-500">{item.product_name}</p>
                        <p className="text-sm text-[#ad946d] font-medium">{formatPrice(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Totals */}
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Shipping (UK)</span>
                    <span>{formatPrice(SHIPPING_FEE)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                    <span>Total</span>
                    <span className="text-[#ad946d]">{formatPrice(total)}</span>
                  </div>
                  {subtotal < MIN_ORDER && (
                    <p className="text-red-500 text-sm mt-2">
                      Minimum order is £{MIN_ORDER.toFixed(2)} (£{(MIN_ORDER - subtotal).toFixed(2)} more needed)
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => setStep('details')}
                  disabled={subtotal < MIN_ORDER}
                  className="w-full bg-[#ad946d] hover:bg-[#9a8460] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue to Checkout
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </>
            )}
          </div>
        )}

        {/* Details Step */}
        {step === 'details' && (
          <div className="space-y-4">
            <Button
              variant="ghost"
              onClick={() => setStep('cart')}
              className="text-gray-500 -ml-2"
            >
              ← Back to cart
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={customerDetails.email}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, email: e.target.value })}
                  placeholder="your@email.com"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Full Name *</Label>
                <Input
                  value={customerDetails.name}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, name: e.target.value })}
                  placeholder="John Smith"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Address Line 1 *</Label>
                <Input
                  value={customerDetails.line1}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, line1: e.target.value })}
                  placeholder="123 Main Street"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Address Line 2</Label>
                <Input
                  value={customerDetails.line2}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, line2: e.target.value })}
                  placeholder="Apartment, suite, etc."
                  className="mt-1"
                />
              </div>
              <div>
                <Label>City *</Label>
                <Input
                  value={customerDetails.city}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, city: e.target.value })}
                  placeholder="London"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>County</Label>
                <Input
                  value={customerDetails.county}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, county: e.target.value })}
                  placeholder="Greater London"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Postcode *</Label>
                <Input
                  value={customerDetails.postcode}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, postcode: e.target.value.toUpperCase() })}
                  placeholder="SW1A 1AA"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input
                  value={customerDetails.phone}
                  onChange={(e) => setCustomerDetails({ ...customerDetails, phone: e.target.value })}
                  placeholder="07123 456789"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium">Order Summary</h4>
              <div className="text-sm text-gray-600">
                {cart.length} item(s) • {formatPrice(subtotal)} + {formatPrice(SHIPPING_FEE)} shipping
              </div>
              <div className="text-lg font-semibold text-[#ad946d]">
                Total: {formatPrice(total)}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              UK delivery only. You will receive an invoice via email for payment.
            </p>

            <Button
              onClick={submitOrder}
              disabled={loading}
              className="w-full bg-[#ad946d] hover:bg-[#9a8460] text-white"
            >
              {loading ? 'Submitting...' : 'Submit Order'}
            </Button>
          </div>
        )}

        {/* Confirmation Step */}
        {step === 'confirm' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Package className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold">Thank You!</h3>
            <p className="text-gray-600">
              Your order has been submitted. Please complete payment below:
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <p className="text-2xl font-bold text-[#ad946d]">{formatPrice(total)}</p>
              <a
                href={`https://paypal.me/weddingsbymark/${total.toFixed(2)}GBP`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-full bg-[#0070ba] hover:bg-[#005ea6] text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Pay with PayPal
              </a>
              <p className="text-xs text-gray-500">
                Click above to pay securely via PayPal
              </p>
            </div>
            
            <p className="text-sm text-gray-500">
              Once payment is received, your prints will be processed and shipped to you.
            </p>
            <Button
              onClick={() => { setStep('cart'); onClose(); }}
              variant="outline"
              className="mt-4"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Product selector modal for adding items
export function PrintProductSelector({ file, products, onSelect, onClose }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // Group products by paper type
  const productsByType = products.reduce((acc, p) => {
    if (!acc[p.paper_type]) acc[p.paper_type] = [];
    acc[p.paper_type].push(p);
    return acc;
  }, {});

  const paperLabels = {
    matte: 'Matte',
    lustre: 'Lustre',
    silk: 'Silk',
    gloss: 'Gloss',
    canvas: 'Canvas'
  };

  const formatPrice = (price) => `£${price.toFixed(2)}`;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Order Print</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Image preview - fixed height */}
          <div className="flex-shrink-0 h-32 bg-gray-100 rounded-lg overflow-hidden mb-2">
            {file.thumbnail_url && (
              <img
                src={`${BACKEND_URL}${file.thumbnail_url}`}
                alt={file.name}
                className="w-full h-full object-contain"
              />
            )}
          </div>
          <p className="text-sm text-gray-500 truncate flex-shrink-0 mb-3">{file.name}</p>

          {/* Product Selection - scrollable */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
            {Object.entries(productsByType).map(([type, typeProducts]) => (
              <div key={type}>
                <h4 className="text-sm font-medium text-gray-700 mb-2 sticky top-0 bg-white py-1">
                  {paperLabels[type] || type}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                  {typeProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        selectedProduct?.id === product.id
                          ? 'border-[#ad946d] bg-[#ad946d]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-xs">{product.size}</p>
                      <p className="text-[#ad946d] font-semibold text-sm">{formatPrice(product.price)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {products.length === 0 && (
            <p className="text-center text-gray-500 py-4">
              No print products available at the moment
            </p>
          )}

          <Button
            onClick={() => selectedProduct && onSelect(file, selectedProduct)}
            disabled={!selectedProduct}
            className="w-full bg-[#ad946d] hover:bg-[#9a8460] text-white flex-shrink-0 mt-3"
          >
            Add to Cart
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
