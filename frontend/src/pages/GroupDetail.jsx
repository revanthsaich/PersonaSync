import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { authenticatedFetch } from '../services/api';

const GroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [images, setImages] = useState([]);
  const [availableImages, setAvailableImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    fetchGroupDetails();
  }, [id]);

  const fetchGroupDetails = async () => {
    setLoading(true);
    try {
      const groupData = await authenticatedFetch(`/api/groups/${id}`);
      setGroup(groupData);
      setImages(groupData.imageIds || []);

      // Fetch all images to show available ones for adding
      const allImages = await authenticatedFetch('/api/images');
      const groupImageIds = new Set((groupData.imageIds || []).map(img => img._id || img));
      setAvailableImages(allImages.filter(img => !groupImageIds.has(img._id)));
    } catch (err) {
      console.error('Failed to fetch group:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddImage = async (imageId) => {
    try {
      const result = await authenticatedFetch(`/api/groups/${id}/add-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });

      const newImages = await authenticatedFetch(`/api/groups/${id}`);
      setGroup(newImages);
      setImages(newImages.imageIds || []);
      setAvailableImages(availableImages.filter(img => img._id !== imageId));
    } catch (err) {
      console.error('Failed to add image:', err);
      alert('Failed to add image');
    }
  };

  const handleRemoveImage = async (imageId) => {
    if (!confirm('Remove this photo from the group?')) return;

    try {
      const result = await authenticatedFetch(`/api/groups/${id}/remove-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });

      const newImages = await authenticatedFetch(`/api/groups/${id}`);
      setGroup(newImages);
      setImages(newImages.imageIds || []);

      // Re-fetch available images
      const allImages = await authenticatedFetch('/api/images');
      const groupImageIds = new Set((newImages.imageIds || []).map(img => img._id || img));
      setAvailableImages(allImages.filter(img => !groupImageIds.has(img._id)));
    } catch (err) {
      console.error('Failed to remove image:', err);
      alert('Failed to remove image');
    }
  };

  if (loading) return <div className="p-8">Loading group...</div>;
  if (!group) return <div className="p-8">Group not found.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
            <p className="text-gray-500">{images.length} photos</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Add Photo
        </button>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Photos to {group.name}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            {availableImages.length === 0 ? (
              <p className="text-center py-8 text-gray-500">All photos are already in this group</p>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                {availableImages.map((img) => (
                  <div
                    key={img._id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 border-2 border-transparent hover:border-blue-500 transition-colors cursor-pointer group"
                    onClick={() => handleAddImage(img._id)}
                  >
                    <img
                      src={img.url}
                      alt="Available"
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Plus className="text-white" size={28} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {images.map((img) => {
          const imageData = typeof img === 'object' ? img : { _id: img, url: '' };
          return (
            <div key={imageData._id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100 group cursor-pointer">
              <img
                src={imageData.url}
                alt="Group photo"
                onClick={() => setLightboxImage(imageData)}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveImage(imageData._id);
                }}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all"
                aria-label="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {lightboxImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightboxImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-12 left-0 text-white/80 hover:text-white transition"
              aria-label="Close"
            >
              <X size={28} />
            </button>
            <img
              src={lightboxImage.url}
              alt="Full view"
              className="max-h-[85vh] max-w-[90vw] w-auto h-auto object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetail;
