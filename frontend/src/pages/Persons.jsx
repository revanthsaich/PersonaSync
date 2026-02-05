import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, AlertCircle } from 'lucide-react';
import { authenticatedFetch } from '../services/api';

const fallbackThumb = 'https://placehold.co/400x400?text=Face';

const Persons = () => {
  const [persons, setPersons] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const fetchPersons = async () => {
      setLoading(true);
      try {
        const [personData, imageData] = await Promise.all([
          authenticatedFetch('/api/persons'),
          authenticatedFetch('/api/images'),
        ]);
        setPersons(personData || []);
        setImages(imageData || []);
      } catch (error) {
        console.error('Failed to fetch persons:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPersons();
  }, []);

  const filteredPersons = useMemo(() => {
    if (!query.trim()) return persons;
    return persons.filter((p) =>
      (p.name || '').toLowerCase().includes(query.trim().toLowerCase())
    );
  }, [persons, query]);

  const undetected = useMemo(() => {
    return (images || []).filter((img) => !Array.isArray(img.persons) || img.persons.length === 0);
  }, [images]);

  const needsReview = useMemo(() => {
    return filteredPersons.filter((p) => (p.name || '').startsWith('person_'));
  }, [filteredPersons]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--text-primary)]">Detected Persons</h1>
          <p className="text-[color:var(--text-muted)]">People identified in your uploaded images</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" size={20} />
          <input
            type="text"
            placeholder="Search persons..."
            className="pl-10 pr-4 py-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] text-[color:var(--text-primary)] focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/30 outline-none w-full sm:w-64"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-[color:var(--surface)] rounded-xl h-48 animate-pulse shadow-[var(--shadow-soft)] border border-[color:var(--border-subtle)]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredPersons.map((person) => (
            <Link
              to={`/persons/${person._id}`}
              key={person._id}
              className="bg-[color:var(--surface)] rounded-xl shadow-[var(--shadow-soft)] border border-[color:var(--border-subtle)] overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow-strong)] transition-all group block"
            >
              <div className="aspect-square bg-[color:var(--surface-2)] overflow-hidden">
                <img
                  src={person.thumbnail || fallbackThumb}
                  alt={person.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <div className="text-sm font-semibold text-[color:var(--text-primary)] truncate">{person.name}</div>
                <div className="text-xs text-[color:var(--text-muted)] flex items-center gap-1">
                  <Users size={13} />
                  <span>{person.count || 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-10 space-y-4">
        <div className="flex items-center gap-2 text-[color:var(--text-primary)]">
          <AlertCircle size={18} />
          <h2 className="text-lg font-semibold">Unassigned uploads (no faces detected)</h2>
        </div>
        {undetected.length === 0 ? (
          <div className="text-sm text-[color:var(--text-muted)]">All uploads have at least one detected face.</div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {undetected.map((img) => (
              <div key={img._id} className="aspect-square rounded-xl overflow-hidden bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)]">
                <img src={img.url} alt="Undetected" className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        )}
      </div>

      {needsReview.length > 0 && (
        <div className="mt-8 space-y-3">
          <div className="flex items-center gap-2 text-[color:var(--text-primary)]">
            <AlertCircle size={18} />
            <h2 className="text-lg font-semibold">Faces that might need naming</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {needsReview.map((p) => (
              <Link
                key={p._id}
                to={`/persons/${p._id}`}
                className="px-3 py-2 rounded-full border border-[color:var(--border-subtle)] text-sm text-[color:var(--text-primary)] bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)]"
              >
                {p.name} · {p.count || 0} photos
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Persons;
