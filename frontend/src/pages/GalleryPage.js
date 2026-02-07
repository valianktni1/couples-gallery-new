import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  FolderOpen, ChevronRight, Download, X, Heart, Check, Upload,
  Play, Pause, Image as ImageIcon, Film, ChevronLeft, ChevronRight as ChevronRightIcon,
  CheckSquare, Square, Save, ShoppingCart, Printer, Maximize2, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PrintOrderCart, PrintProductSelector } from '@/components/PrintOrderCart';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = "https://customer-assets.emergentagent.com/job_6e5757e7-0b45-46c5-8f03-c1858510b49f/artifacts/fq31etoy_cropped-new-logo-2022-black-with-bevel-1.png";

// Extract couple names from folder name (e.g., "Lisa & Tara 21.01.26" → "Lisa & Tara")
const extractCoupleNames = (folderName) => {
  if (!folderName) return null;
  // Remove date patterns like "21.01.26", "210126", "21-01-26", "21/01/26"
  const withoutDate = folderName
    .replace(/\s*\d{2}[\.\-\/]\d{2}[\.\-\/]\d{2,4}\s*$/, '') // DD.MM.YY or DD.MM.YYYY
    .replace(/\s*\d{6}\s*$/, '') // DDMMYY
    .replace(/\s*\d{8}\s*$/, '') // DDMMYYYY
    .trim();
  return withoutDate || folderName;
};

export default function GalleryPage() {
  const { token } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder');
  
  const [gallery, setGallery] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [path, setPath] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  
  // Slideshow state
  const [slideshowPlaying, setSlideshowPlaying] = useState(false);
  const slideshowInterval = useRef(null);
  
  // Selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [favouritesMode, setFavouritesMode] = useState(false);
  const [savingFavourites, setSavingFavourites] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Print ordering state
  const [showCart, setShowCart] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(null);
  const [printProducts, setPrintProducts] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  
  // Back to top button
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    fetchGallery();
    fetchPrintProducts();
    
    // Show back to top button when scrolled down
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [token]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (gallery) {
      fetchContent();
    }
  }, [gallery, currentFolderId]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const folderId = currentFolderId || gallery?.folder_id;
    if (!folderId) { toast.error('Cannot upload here'); return; }
    
    setUploading(true);
    let uploaded = 0;
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', folderId);
      
      try {
        const res = await fetch(`${API}/gallery/${token}/upload`, {
          method: 'POST',
          body: formData
        });
        if (res.ok) uploaded++;
        else toast.error(`Failed to upload ${file.name}`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    setUploading(false);
    if (uploaded > 0) {
      toast.success(`Uploaded ${uploaded} file(s)`);
      fetchContent();
    }
    e.target.value = '';
  };

  const fetchGallery = async () => {
    try {
      const res = await fetch(`${API}/gallery/${token}`);
      if (!res.ok) throw new Error('Gallery not found');
      const data = await res.json();
      setGallery(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPrintProducts = async () => {
    try {
      const res = await fetch(`${API}/print-products?active_only=true`);
      if (res.ok) {
        const data = await res.json();
        setPrintProducts(data.filter(p => p.price > 0));
      }
    } catch (e) {
      console.error('Failed to fetch print products');
    }
    // Update cart count from localStorage
    updateCartCount();
  };

  const updateCartCount = () => {
    const saved = localStorage.getItem(`print_cart_${token}`);
    if (saved) {
      try {
        const cart = JSON.parse(saved);
        setCartCount(cart.reduce((sum, item) => sum + item.quantity, 0));
      } catch (e) {
        setCartCount(0);
      }
    }
  };

  const handleAddToCart = (file, product) => {
    // Get current cart
    const saved = localStorage.getItem(`print_cart_${token}`);
    let cart = [];
    if (saved) {
      try {
        cart = JSON.parse(saved);
      } catch (e) {}
    }

    // Add item
    const existingIndex = cart.findIndex(
      item => item.file_id === file.id && item.product_id === product.id
    );
    
    if (existingIndex >= 0) {
      cart[existingIndex].quantity += 1;
    } else {
      cart.push({
        file_id: file.id,
        file_name: file.name,
        file_thumbnail: file.thumbnail_url,
        product_id: product.id,
        product_name: product.name,
        size: product.size,
        paper_type: product.paper_type,
        price: product.price,
        quantity: 1
      });
    }

    // Save cart
    localStorage.setItem(`print_cart_${token}`, JSON.stringify(cart));
    updateCartCount();
    setShowProductSelector(null);
    toast.success(`Added ${product.name} to cart`);
  };

  const fetchContent = async () => {
    try {
      const foldersUrl = currentFolderId 
        ? `${API}/gallery/${token}/folders?parent_id=${currentFolderId}`
        : `${API}/gallery/${token}/folders`;
      const foldersRes = await fetch(foldersUrl);
      if (foldersRes.ok) {
        setFolders(await foldersRes.json());
      }

      const filesUrl = currentFolderId
        ? `${API}/gallery/${token}/files?folder_id=${currentFolderId}`
        : `${API}/gallery/${token}/files`;
      const filesRes = await fetch(filesUrl);
      if (filesRes.ok) {
        setFiles(await filesRes.json());
      }

      if (currentFolderId) {
        const pathRes = await fetch(`${API}/gallery/${token}/path?folder_id=${currentFolderId}`);
        if (pathRes.ok) {
          setPath(await pathRes.json());
        }
      } else {
        setPath([]);
      }
    } catch (e) {
      console.error('Failed to fetch content:', e);
    }
  };

  const navigateToFolder = (folderId) => {
    if (folderId) {
      setSearchParams({ folder: folderId });
    } else {
      setSearchParams({});
    }
    // Reset selection when navigating
    setSelectionMode(false);
    setFavouritesMode(false);
    setSelectedFiles(new Set());
  };

  // Selection functions
  const toggleSelectFile = (fileId) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllFiles = () => {
    const imageFiles = files.filter(f => f.file_type === 'image');
    if (selectedFiles.size === imageFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(imageFiles.map(f => f.id)));
    }
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setFavouritesMode(false);
    setSelectedFiles(new Set());
  };

  const enterFavouritesMode = () => {
    setFavouritesMode(true);
    setSelectionMode(true);
    setSelectedFiles(new Set());
    toast.info('Select your favourite photos, then click "Save Album Favourites"');
  };

  const saveFavourites = async () => {
    if (selectedFiles.size === 0) {
      toast.error('Please select at least one photo');
      return;
    }

    setSavingFavourites(true);
    try {
      const res = await fetch(`${API}/gallery/${token}/favourites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: Array.from(selectedFiles) })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`${selectedFiles.size} favourites saved to Album Favourites!`);
        exitSelectionMode();
        fetchContent(); // Refresh to show new folder
      } else {
        const error = await res.json();
        toast.error(error.detail || 'Failed to save favourites');
      }
    } catch (e) {
      console.error('Failed to save favourites:', e);
      toast.error('Failed to save favourites');
    } finally {
      setSavingFavourites(false);
    }
  };

  // Download all files
  const downloadAllFiles = () => {
    const imageFiles = files.filter(f => f.file_type === 'image');
    if (imageFiles.length === 0) { toast.error('No photos to download'); return; }
    toast.info('Preparing ZIP download...');
    // Use public ZIP endpoint
    const folderId = currentFolderId || gallery?.folder_id;
    const url = folderId 
      ? `${BACKEND_URL}/api/gallery/${token}/download-zip?folder_id=${folderId}`
      : `${BACKEND_URL}/api/gallery/${token}/download-zip`;
    window.location.href = url;
  };

  // Download selected files
  const downloadSelectedFiles = () => {
    if (selectedFiles.size === 0) { toast.error('No photos selected'); return; }
    toast.info(`Downloading ${selectedFiles.size} photos...`);
    files.filter(f => selectedFiles.has(f.id)).forEach((file, i) => {
      setTimeout(() => {
        const link = document.createElement('a'); link.href = `${BACKEND_URL}/api/files/${file.id}/download`;
        link.download = file.name; document.body.appendChild(link); link.click(); document.body.removeChild(link);
      }, i * 500);
    });
  };

  const imageFiles = files.filter(f => f.file_type === 'image');
  const videoFiles = files.filter(f => f.file_type === 'video');

  const openLightbox = (index) => {
    if (!selectionMode) {
      setLightboxIndex(index);
    }
  };
  
  const closeLightbox = () => {
    stopSlideshow();
    setLightboxIndex(null);
  };
  
  const nextImage = () => {
    if (lightboxIndex < imageFiles.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    } else if (slideshowPlaying) {
      // Loop back to start in slideshow mode
      setLightboxIndex(0);
    }
  };
  
  const prevImage = () => {
    if (lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  // Slideshow functions
  const startSlideshow = () => {
    setSlideshowPlaying(true);
    slideshowInterval.current = setInterval(() => {
      setLightboxIndex(prev => {
        if (prev < imageFiles.length - 1) {
          return prev + 1;
        } else {
          return 0; // Loop back to start
        }
      });
    }, 4000); // 4 seconds per image
  };

  const stopSlideshow = () => {
    setSlideshowPlaying(false);
    if (slideshowInterval.current) {
      clearInterval(slideshowInterval.current);
      slideshowInterval.current = null;
    }
  };

  const toggleSlideshow = () => {
    if (slideshowPlaying) {
      stopSlideshow();
    } else {
      startSlideshow();
    }
  };

  // Cleanup slideshow on unmount
  useEffect(() => {
    return () => {
      if (slideshowInterval.current) {
        clearInterval(slideshowInterval.current);
      }
    };
  }, []);

  // Check if user has edit or full permission
  const canEdit = gallery?.permission === 'edit' || gallery?.permission === 'full';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center gallery-theme">
        <div className="text-center">
          <img 
            src={LOGO_URL} 
            alt="Weddings By Mark" 
            className="h-16 mx-auto mb-4 animate-pulse"
          />
          <p className="text-gray-500">Loading gallery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center gallery-theme">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-serif text-gray-900 mb-2">Gallery Not Found</h1>
          <p className="text-gray-500">This gallery link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] gallery-theme">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="w-20"></div>
            <img 
              src={LOGO_URL} 
              alt="Weddings By Mark" 
              className="h-10"
            />
            <div className="w-20 flex justify-end">
              {printProducts.length > 0 && (
                <button
                  onClick={() => setShowCart(true)}
                  className="relative p-2 text-gray-600 hover:text-[#ad946d] transition-colors"
                  data-testid="cart-button"
                >
                  <ShoppingCart className="w-6 h-6" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#ad946d] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-[#ad946d]/10 to-transparent py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#ad946d] text-lg mb-2 font-medium"
          >
            Welcome
          </motion.p>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-serif text-4xl md:text-5xl lg:text-6xl text-gray-900 mb-4 italic"
          >
            {extractCoupleNames(gallery?.folder_name)}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-500 text-lg"
          >
            Your special memories, beautifully captured
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-[#ad946d] text-sm mt-3 font-medium"
          >
            ✨ Love a photo? Order professional prints directly from your gallery!
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-gray-400 text-xs mt-1"
          >
            Coming soon: Beautifully crafted wedding albums
          </motion.p>
        </div>
      </div>

      {/* Breadcrumb */}
      {path.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4">
          <nav className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigateToFolder(null)}
              className="text-[#ad946d] hover:underline"
              data-testid="breadcrumb-root"
            >
              {gallery?.folder_name}
            </button>
            {path.slice(1).map((item, index) => (
              <span key={item.id} className="flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-gray-400" />
                <button
                  onClick={() => navigateToFolder(item.id)}
                  className={index === path.length - 2 ? 'text-gray-900' : 'text-[#ad946d] hover:underline'}
                  data-testid={`breadcrumb-${item.id}`}
                >
                  {item.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
      )}

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Folders */}
        {folders.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#ad946d]" />
              Albums
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {folders.map((folder, index) => (
                <motion.button
                  key={folder.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigateToFolder(folder.id)}
                  data-testid={`folder-${folder.id}`}
                  className="group bg-white rounded-lg border border-gray-200 p-6 text-left hover:border-[#ad946d] hover:shadow-md transition-all"
                >
                  <FolderOpen className="w-8 h-8 text-[#ad946d] mb-3 group-hover:scale-110 transition-transform" />
                  <h3 className="font-medium text-gray-900 mb-1">{folder.name}</h3>
                  <p className="text-sm text-gray-500">
                    {folder.file_count} files
                  </p>
                </motion.button>
              ))}
            </div>
          </section>
        )}

        {/* Upload section when no images but can edit */}
        {imageFiles.length === 0 && canEdit && (
          <section className="mb-12">
            <div className="bg-[#ad946d]/10 border-2 border-dashed border-[#ad946d]/30 rounded-lg p-8 text-center">
              <Upload className="w-12 h-12 text-[#ad946d] mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Upload Photos & Videos</h3>
              <p className="text-gray-500 mb-4">Share your photos and videos from the event</p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-[#ad946d] hover:bg-[#96805d] text-white"
                data-testid="section-upload-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Uploading...' : 'Choose Files'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleUpload}
                className="hidden"
              />
            </div>
          </section>
        )}

        {/* Images */}
        {imageFiles.length > 0 && (
          <section className="mb-12">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#ad946d]" />
                Photos ({imageFiles.length})
              </h2>
              
              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {!selectionMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectionMode(true)}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100"
                      data-testid="select-btn"
                    >
                      <CheckSquare className="w-4 h-4 mr-1" />
                      Select
                    </Button>
                    {imageFiles.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setLightboxIndex(0); }}
                        className="border-[#ad946d] text-[#ad946d] hover:bg-[#ad946d]/10"
                        data-testid="slideshow-btn"
                      >
                        <Play className="w-4 h-4 mr-1" />
                        Slideshow
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadAllFiles}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100"
                      data-testid="download-all-btn"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download All
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={enterFavouritesMode}
                          className="border-[#ad946d] text-[#ad946d] hover:bg-[#ad946d]/10"
                          data-testid="select-favourites-btn"
                        >
                          <Heart className="w-4 h-4 mr-1" />
                          Select Album Favourites
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading}
                          className="border-[#ad946d] text-[#ad946d] hover:bg-[#ad946d]/10"
                          data-testid="upload-btn"
                        >
                          <Upload className="w-4 h-4 mr-1" />
                          {uploading ? 'Uploading...' : 'Upload Photos'}
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          onChange={handleUpload}
                          className="hidden"
                        />
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllFiles}
                      className="border-gray-300 text-gray-700 hover:bg-gray-100"
                      data-testid="select-all-btn"
                    >
                      {selectedFiles.size === imageFiles.length ? (
                        <>
                          <Square className="w-4 h-4 mr-1" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4 mr-1" />
                          Select All ({imageFiles.length})
                        </>
                      )}
                    </Button>
                    
                    {favouritesMode ? (
                      <Button
                        size="sm"
                        onClick={saveFavourites}
                        disabled={savingFavourites || selectedFiles.size === 0}
                        className="bg-[#ad946d] hover:bg-[#96805d] text-white"
                        data-testid="save-favourites-btn"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        {savingFavourites ? 'Saving...' : `Save Album Favourites (${selectedFiles.size})`}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadSelectedFiles}
                        disabled={selectedFiles.size === 0}
                        className="border-gray-300 text-gray-700 hover:bg-gray-100"
                        data-testid="download-selected-btn"
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download ({selectedFiles.size})
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={exitSelectionMode}
                      className="text-gray-500 hover:text-gray-700"
                      data-testid="cancel-select-btn"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Selection mode banner */}
            {favouritesMode && (
              <div className="bg-[#ad946d]/10 border border-[#ad946d]/30 rounded-lg p-3 mb-4 flex items-center gap-2">
                <Heart className="w-5 h-5 text-[#ad946d]" />
                <span className="text-sm text-[#ad946d]">
                  Tap photos to select your favourites, then click "Save Album Favourites"
                </span>
              </div>
            )}

            <div className="gallery-grid">
              {imageFiles.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className={`image-card cursor-pointer group relative ${
                    selectedFiles.has(file.id) ? 'ring-4 ring-[#ad946d]' : ''
                  }`}
                  onClick={() => selectionMode ? toggleSelectFile(file.id) : openLightbox(index)}
                  data-testid={`image-${file.id}`}
                >
                  <img
                    src={`${BACKEND_URL}${file.thumbnail_url}`}
                    alt={file.name}
                    loading="lazy"
                  />
                  
                  {/* Selection checkbox */}
                  {selectionMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        selectedFiles.has(file.id) 
                          ? 'bg-[#ad946d] text-white' 
                          : 'bg-white/80 text-gray-400 border-2 border-gray-300'
                      }`}>
                        {selectedFiles.has(file.id) && <Check className="w-5 h-5" />}
                      </div>
                    </div>
                  )}
                  
                  {/* Favourite heart indicator */}
                  {favouritesMode && selectedFiles.has(file.id) && (
                    <div className="absolute top-2 right-2 z-10">
                      <Heart className="w-6 h-6 text-[#ad946d] fill-[#ad946d]" />
                    </div>
                  )}
                  
                  {/* Order Print button */}
                  {!selectionMode && printProducts.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowProductSelector(file);
                      }}
                      className="absolute top-2 right-2 z-10 bg-[#ad946d] text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-[#9a8460]"
                      title="Order Print"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                  
                  {!selectionMode && (
                    <div className="overlay flex items-end p-4">
                      <span className="text-white text-sm truncate">{file.name}</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Videos */}
        {videoFiles.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-[#ad946d]" />
              Videos ({videoFiles.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {videoFiles.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200"
                  data-testid={`video-${file.id}`}
                >
                  <video
                    controls
                    className="w-full aspect-video bg-black"
                    preload="metadata"
                  >
                    <source src={`${BACKEND_URL}/api/files/${file.id}/stream`} />
                  </video>
                  <div className="p-4 flex items-center justify-between">
                    <span className="text-sm text-gray-700 truncate">{file.name}</span>
                    <a
                      href={`${BACKEND_URL}/api/files/${file.id}/download`}
                      download
                      className="text-[#ad946d] hover:underline text-sm flex items-center gap-1"
                      data-testid={`download-video-${file.id}`}
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {folders.length === 0 && files.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No content yet</h3>
            <p className="text-gray-500 mb-6">Photos and videos will appear here soon.</p>
            {canEdit && (
              <>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-[#ad946d] hover:bg-[#96805d] text-white"
                  data-testid="empty-upload-btn"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Photos & Videos'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={handleUpload}
                  className="hidden"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
          <p className="text-gray-400 text-sm">© Weddings By Mark</p>
        </div>
      </footer>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && imageFiles[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lightbox-overlay"
            onClick={closeLightbox}
          >
            <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
              <img
                src={`${BACKEND_URL}${imageFiles[lightboxIndex].preview_url}`}
                alt={imageFiles[lightboxIndex].name}
              />
            </div>

            {/* Controls */}
            <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {/* Slideshow Play/Pause */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleSlideshow(); }}
                className={`${slideshowPlaying ? 'bg-[#ad946d]' : 'bg-white/10'} hover:bg-[#ad946d]/80 text-white p-3 rounded-full backdrop-blur-sm transition-colors`}
                data-testid="lightbox-slideshow"
                title={slideshowPlaying ? "Pause Slideshow" : "Play Slideshow"}
              >
                {slideshowPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              {printProducts.length > 0 && !slideshowPlaying && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowProductSelector(imageFiles[lightboxIndex]); }}
                  className="bg-[#ad946d] hover:bg-[#9a8460] text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                  data-testid="lightbox-order-print"
                  title="Order Print"
                >
                  <Printer className="w-5 h-5" />
                </button>
              )}
              {!slideshowPlaying && (
                <a
                  href={`${BACKEND_URL}/api/files/${imageFiles[lightboxIndex].id}/download`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                  data-testid="lightbox-download"
                >
                  <Download className="w-5 h-5" />
                </a>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
                className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Slideshow indicator */}
            {slideshowPlaying && (
              <div className="absolute top-4 left-4 bg-[#ad946d] text-white px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Play className="w-4 h-4" />
                Slideshow Playing
              </div>
            )}

            {/* Navigation - always show in slideshow for manual override */}
            {(lightboxIndex > 0 || slideshowPlaying) && (
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-prev"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {(lightboxIndex < imageFiles.length - 1 || slideshowPlaying) && (
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-next"
              >
                <ChevronRightIcon className="w-6 h-6" />
              </button>
            )}

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-4 py-2 rounded-full text-sm backdrop-blur-sm">
              {lightboxIndex + 1} / {imageFiles.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Print Order Cart Modal */}
      <PrintOrderCart
        shareToken={token}
        isOpen={showCart}
        onClose={() => { setShowCart(false); updateCartCount(); }}
      />

      {/* Product Selector Modal */}
      {showProductSelector && (
        <PrintProductSelector
          file={showProductSelector}
          products={printProducts}
          onSelect={handleAddToCart}
          onClose={() => setShowProductSelector(null)}
        />
      )}

      {/* Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 bg-[#ad946d] hover:bg-[#9a8460] text-white p-4 rounded-full shadow-lg z-50 transition-colors"
            data-testid="back-to-top"
            title="Back to top"
          >
            <ChevronUp className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
