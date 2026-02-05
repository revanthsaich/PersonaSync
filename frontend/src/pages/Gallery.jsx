import React, { useEffect, useState, useCallback } from 'react';
import { authenticatedFetch } from '../services/api';
import { X, ZoomIn, Trash2 } from 'lucide-react';

const Gallery = () => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // { id, url, faces }
  const [deleting, setDeleting] = useState(false);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeLightbox]);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      const data = await authenticatedFetch('/api/images');
      setImages(data);
    } catch (err) {
      console.error("Failed to fetch gallery", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!lightbox?.id || deleting) return;
    if (!confirm('Delete this photo? This cannot be undone.')) return;

    setDeleting(true);
    try {
      await authenticatedFetch(`/api/images/${lightbox.id}`, { method: 'DELETE' });
      setImages(images.filter(img => img._id !== lightbox.id));
      closeLightbox();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading your shiny photos...</div>;

  return (
    <div>
        <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Photos</h1>
            <div className="text-sm text-gray-500">{images.length} items</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1">
            {images.map((img) => (
                  <button
                    key={img._id}
                    type="button"
                    onClick={() => setLightbox({ id: img._id, url: img.url, faces: img.persons?.length || 0 })}
                    className="aspect-square relative group overflow-hidden bg-gray-100 cursor-pointer"
                  >
                <img 
                  src={img.url} 
                  alt="Gallery Item" 
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <ZoomIn className="text-white drop-shadow-md" />
                </div>
                {Array.isArray(img.persons) && img.persons.length > 0 && (
                  <span className="absolute top-2 right-2 bg-white/80 text-gray-800 text-xs px-2 py-1 rounded-full shadow-sm">
                  {img.persons.length} faces
                  </span>
                )}
                  </button>
            ))}
        </div>

            {lightbox && (
              <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={closeLightbox}>
                <div className="relative max-w-6xl w-full max-h-full" onClick={(e) => e.stopPropagation()}>
                  <div className="absolute -top-10 right-0 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="text-red-400 hover:text-red-300 transition disabled:opacity-50"
                      aria-label="Delete"
                    >
                      <Trash2 size={24} />
                    </button>
                    <button
                      type="button"
                      onClick={closeLightbox}
                      className="text-white/80 hover:text-white transition"
                      aria-label="Close"
                    >
                      <X size={28} />
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-xl bg-black/60">
                    <img
                      src={lightbox.url}
                      alt="Zoomed"
                      className="w-full h-full max-h-[80vh] object-contain"
                    />
                  </div>
                  {lightbox.faces ? (
                    <div className="text-sm text-white/80 mt-3 text-right">{lightbox.faces} face(s) detected</div>
                  ) : null}
                </div>
              </div>
            )}
    </div>
  );
};

export default Gallery;
