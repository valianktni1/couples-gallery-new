import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, ChevronRight, Download, X,
  Play, Image as ImageIcon, Film, ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const LOGO_URL = "https://customer-assets.emergentagent.com/job_6e5757e7-0b45-46c5-8f03-c1858510b49f/artifacts/fq31etoy_cropped-new-logo-2022-black-with-bevel-1.png";

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

  useEffect(() => {
    fetchGallery();
  }, [token]);

  useEffect(() => {
    if (gallery) {
      fetchContent();
    }
  }, [gallery, currentFolderId]);

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

  const fetchContent = async () => {
    try {
      // Fetch folders
      const foldersUrl = currentFolderId 
        ? `${API}/gallery/${token}/folders?parent_id=${currentFolderId}`
        : `${API}/gallery/${token}/folders`;
      const foldersRes = await fetch(foldersUrl);
      if (foldersRes.ok) {
        setFolders(await foldersRes.json());
      }

      // Fetch files
      const filesUrl = currentFolderId
        ? `${API}/gallery/${token}/files?folder_id=${currentFolderId}`
        : `${API}/gallery/${token}/files`;
      const filesRes = await fetch(filesUrl);
      if (filesRes.ok) {
        setFiles(await filesRes.json());
      }

      // Fetch path if in subfolder
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
  };

  const imageFiles = files.filter(f => f.file_type === 'image');
  const videoFiles = files.filter(f => f.file_type === 'video');

  const openLightbox = (index) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  
  const nextImage = () => {
    if (lightboxIndex < imageFiles.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };
  
  const prevImage = () => {
    if (lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center gallery-theme">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-[#ad946d]/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Camera className="w-6 h-6 text-[#ad946d]" />
          </div>
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
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#ad946d]/20 flex items-center justify-center">
                <Camera className="w-5 h-5 text-[#ad946d]" />
              </div>
              <div>
                <h1 className="logo-text text-xl text-gray-900">Weddings By Mark</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-[#ad946d]/10 to-transparent py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-4xl md:text-5xl lg:text-6xl text-gray-900 mb-4 italic"
          >
            {gallery?.folder_name}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-500 text-lg"
          >
            Your special memories, beautifully captured
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

        {/* Images */}
        {imageFiles.length > 0 && (
          <section className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-[#ad946d]" />
              Photos ({imageFiles.length})
            </h2>
            <div className="gallery-grid">
              {imageFiles.map((file, index) => (
                <motion.div
                  key={file.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="image-card cursor-pointer group"
                  onClick={() => openLightbox(index)}
                  data-testid={`image-${file.id}`}
                >
                  <img
                    src={`${BACKEND_URL}${file.thumbnail_url}`}
                    alt={file.name}
                    loading="lazy"
                  />
                  <div className="overlay flex items-end p-4">
                    <span className="text-white text-sm truncate">{file.name}</span>
                  </div>
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
            <p className="text-gray-500">Photos and videos will appear here soon.</p>
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
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <a
                href={`${BACKEND_URL}/api/files/${imageFiles[lightboxIndex].id}/download`}
                download
                className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-download"
              >
                <Download className="w-5 h-5" />
              </a>
              <button
                onClick={closeLightbox}
                className="bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation */}
            {lightboxIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition-colors"
                data-testid="lightbox-prev"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {lightboxIndex < imageFiles.length - 1 && (
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
    </div>
  );
}
