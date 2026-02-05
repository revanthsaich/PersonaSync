import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import { authenticatedFetch } from '../services/api';

const Groups = () => {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const data = await authenticatedFetch('/api/groups');
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to fetch groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    setCreating(true);
    try {
      const result = await authenticatedFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
        }),
      });

      setGroups([result.group, ...groups]);
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateModal(false);
    } catch (err) {
      console.error('Failed to create group:', err);
      alert('Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Delete this group? Photos will remain in your library.')) return;

    setDeleting(groupId);
    try {
      await authenticatedFetch(`/api/groups/${groupId}`, { method: 'DELETE' });
      setGroups(groups.filter(g => g._id !== groupId));
    } catch (err) {
      console.error('Failed to delete group:', err);
      alert('Failed to delete group');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Groups</h1>
          <p className="text-gray-600">Organize your photos into custom collections</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          New Group
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Create New Group</h2>
            <input
              type="text"
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              autoFocus
            />
            <textarea
              placeholder="Description (optional)..."
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              rows="3"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewGroupName('');
                  setNewGroupDesc('');
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim() || creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-40 animate-pulse shadow-sm border border-gray-100"></div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No groups yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {groups.map((group) => (
            <Link
              to={`/groups/${group._id}`}
              key={group._id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group block relative"
            >
              {group.coverImage && (
                <div className="aspect-square bg-gray-100 overflow-hidden">
                  <img
                    src={group.coverImage}
                    alt={group.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              )}
              {!group.coverImage && (
                <div className="aspect-square bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                  <FolderOpen size={48} className="text-blue-300" />
                </div>
              )}
              <div className="p-3">
                <h3 className="font-semibold text-gray-900 truncate text-sm">{group.name}</h3>
                <p className="text-xs text-gray-500">{group.imageIds?.length || 0} photos</p>
              </div>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDeleteGroup(group._id);
                }}
                disabled={deleting === group._id}
                className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all disabled:opacity-50"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Groups;
