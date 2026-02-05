import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Share2, Trash2, X, Edit2, Check } from 'lucide-react';
import { authenticatedFetch } from '../services/api';

const PersonDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [person, setPerson] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await authenticatedFetch(`/api/persons/${id}`);
        setPerson(data.person);
        setImages(data.images || []);
        setNewName(data.person.name);
      } catch (e) {
        console.error(e);
        setError('Could not load this person.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const refreshFaces = async () => {
    setRefreshing(true);
    try {
      await authenticatedFetch('/api/images/reprocess-missing', { method: 'POST' });
      const data = await authenticatedFetch(`/api/persons/${id}`);
      setPerson(data.person);
      setImages(data.images || []);
    } catch (e) {
      console.error(e);
      setError('Refresh failed. Try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDeleteImage = async (imageId) => {
    if (!imageId || deleting) return;
    if (!confirm('Delete this photo? This cannot be undone.')) return;

    setDeleting(true);
    try {
      await authenticatedFetch(`/api/images/${imageId}`, { method: 'DELETE' });
      const updatedImages = images.filter(img => img._id !== imageId);
      setImages(updatedImages);
      setSelectedImage(null);
      
      // Update person count
      if (person) {
        setPerson({ ...person, count: updatedImages.length });
      }
      
      // If no images left, go back to persons list
      if (updatedImages.length === 0) {
        navigate('/persons');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete image');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveName = async () => {
    if (!newName.trim() || newName === person.name) {
      setEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const result = await authenticatedFetch(`/api/persons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setPerson(result.person);
      setEditingName(false);
    } catch (err) {
      console.error('Failed to update name:', err);
      alert('Failed to update name');
      setNewName(person.name);
    } finally {
      setSavingName(false);
    }
  };

  if (loading) return <div className="p-8 text-[color:var(--text-muted)]">Loading person...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!person) return <div className="p-8 text-[color:var(--text-muted)]">Person not found.</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-[color:var(--surface-2)] rounded-full transition-colors border border-[color:var(--border-subtle)]">
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center gap-3">
            {person?.thumbnail && (
              <img
                src={person.thumbnail}
                alt={person.name}
                className="w-14 h-14 rounded-full object-cover border border-[color:var(--border-subtle)] shadow-[var(--shadow-soft)]"
              />
            )}
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-3 py-2 border border-[color:var(--border-subtle)] rounded-lg focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/30 outline-none font-bold text-2xl w-64 bg-[color:var(--surface)] text-[color:var(--text-primary)]"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="p-2 bg-[color:var(--accent)] text-white rounded-lg hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  <Check size={20} />
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNewName(person.name);
                  }}
                  className="p-2 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            ) : (
              <div onClick={() => setEditingName(true)} className="cursor-pointer hover:opacity-80 group">
                <h1 className="text-2xl font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  {person?.name}
                  <Edit2 size={20} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </h1>
                <p className="text-[color:var(--text-muted)]">{images.length} photos</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshFaces}
            disabled={refreshing}
            className="px-4 py-2 rounded-full text-sm font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)] disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Refresh faces'}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 hover:bg-[color:var(--surface-2)] rounded-full text-[color:var(--accent)] font-medium transition-colors border border-[color:var(--border-subtle)]">
            <Share2 size={20} />
            Share
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {images.map((img) => {
          return (
            <div
              key={img._id}
              className="relative aspect-square rounded-xl overflow-hidden bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] group cursor-pointer hover:shadow-[var(--shadow-strong)] transition-all"
            >
              <img
                src={img.url}
                alt="Person"
                onClick={() => setSelectedImage(img)}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteImage(img._id);
                }}
                disabled={deleting}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all disabled:opacity-50"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-12 left-0 flex items-center gap-3">
              <button
                onClick={() => setSelectedImage(null)}
                className="text-white/80 hover:text-white transition"
                aria-label="Close"
              >
                <X size={28} />
              </button>
            </div>
            <div className="absolute -top-12 right-0 flex items-center gap-3">
              <button
                onClick={() => handleDeleteImage(selectedImage._id)}
                disabled={deleting}
                className="text-red-400 hover:text-red-300 transition disabled:opacity-50"
                aria-label="Delete"
              >
                <Trash2 size={24} />
              </button>
            </div>
            <img
              src={selectedImage.url}
              alt="Full view"
              className="max-h-[85vh] max-w-[90vw] w-auto h-auto object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonDetail;
