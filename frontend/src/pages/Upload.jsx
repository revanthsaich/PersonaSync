import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { authenticatedFetch } from '../services/api';

const Upload = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [message, setMessage] = useState('');

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus('idle');
      setMessage('');
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setStatus('idle');
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    setStatus('loading');
    setMessage('');

    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      // Use authenticatedFetch but we need to handle FormData handling carefully
      // authenticatedFetch sets Content-Type to application/json by default.
      // For FormData, let the browser set Content-Type (boundary).
      
      const { getToken, user } = window.Clerk || {};
      const headers = {};
      if (getToken) {
        const token = await getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
      }
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }

      const response = await fetch('http://localhost:4000/api/upload', {
        method: 'POST',
        headers, // No Content-Type header!
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      setStatus('success');
      setMessage(`Image uploaded successfully! Detected ${data.ml_results?.length || 0} face(s).`);
      // Briefly show success then go to gallery
      setTimeout(() => navigate('/gallery'), 600);
      // Clear after success? or keep showing?
      // clearSelection();
    } catch (err) {
      console.error(err);
      setStatus('error');
      setMessage('Failed to upload image. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <UploadIcon size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Upload Photo</h2>
              <p className="text-gray-500">Select a photo from your device</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* File Drop / Select Area */}
            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${previewUrl ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}>
                {previewUrl ? (
                    <div className="relative inline-block">
                        <img src={previewUrl} alt="Preview" className="max-h-64 rounded-lg shadow-sm" />
                        <button 
                            type="button" 
                            onClick={clearSelection}
                            className="absolute -top-3 -right-3 bg-white text-red-500 p-1.5 rounded-full shadow-md border border-gray-100 hover:bg-red-50"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ImageIcon size={32} />
                        </div>
                        <label htmlFor="file-upload" className="cursor-pointer">
                            <span className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors inline-block mb-2">
                                Browse Files
                            </span>
                            <input 
                                id="file-upload" 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={handleFileSelect}
                            />
                        </label>
                        <p className="text-sm text-gray-400">Supported formats: JPG, PNG</p>
                    </>
                )}
            </div>

            <button
              type="submit"
              disabled={!selectedFile || status === 'loading'}
              className={`w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all ${
                !selectedFile || status === 'loading'
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
              }`}
            >
              {status === 'loading' ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Uploading...
                </>
              ) : (
                'Upload Photo'
              )}
            </button>
          </form>

          {status === 'success' && (
            <div className="mt-6 p-4 bg-green-50 text-green-700 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle size={20} />
              <span>{message}</span>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={20} />
              <span>{message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Upload;
