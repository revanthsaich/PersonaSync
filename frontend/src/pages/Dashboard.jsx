import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { authenticatedFetch } from '../services/api';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, Users, Folder, Sparkles } from 'lucide-react';

const Dashboard = () => {
  const { user } = useUser();
  const [stats, setStats] = useState({ personsCount: 0, imagesCount: 0, groupsCount: 0, recentUploads: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     const load = async () => {
       setLoading(true);
       try {
         const [summary, groups] = await Promise.all([
          authenticatedFetch('/api/images/summary'),
          authenticatedFetch('/api/groups'),
         ]);
         setStats({
           ...summary,
           groupsCount: (groups || []).length,
         });
       } catch (err) {
         console.error('Failed to fetch summary', err);
       } finally {
         setLoading(false);
       }
     };
     load();
  }, []);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl p-8 md:p-10 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-strong)]">
        <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--accent)]/14 via-transparent to-[color:var(--accent-strong)]/12" aria-hidden="true" />
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[color:var(--accent)]/15 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] w-fit text-[color:var(--text-muted)] text-sm">
            <Sparkles size={16} /> Sync ready
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[color:var(--text-primary)]">Hello, {user?.firstName}.</h1>
          <p className="text-[color:var(--text-muted)] text-lg">Your memories stay organized, searchable, and shareable.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-6 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-soft)] hover:-translate-y-0.5 transition-transform">
          <h3 className="text-[color:var(--text-muted)] text-sm font-medium uppercase tracking-wider">Total Photos</h3>
          <p className="text-4xl font-bold text-[color:var(--text-primary)] mt-2 flex items-baseline gap-2">
            {stats.imagesCount}
            <ImageIcon size={18} className="text-[color:var(--accent)]" />
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-soft)] hover:-translate-y-0.5 transition-transform">
          <h3 className="text-[color:var(--text-muted)] text-sm font-medium uppercase tracking-wider">People Found</h3>
          <p className="text-4xl font-bold text-[color:var(--text-primary)] mt-2 flex items-baseline gap-2">
            {stats.personsCount}
            <Users size={18} className="text-[color:var(--accent)]" />
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-soft)] hover:-translate-y-0.5 transition-transform">
          <h3 className="text-[color:var(--text-muted)] text-sm font-medium uppercase tracking-wider">Albums</h3>
          <p className="text-4xl font-bold text-[color:var(--text-primary)] mt-2 flex items-baseline gap-2">
            {stats.groupsCount}
            <Folder size={18} className="text-[color:var(--accent)]" />
          </p>
        </div>
        <Link
          to="/upload"
          className="flex items-center justify-center p-6 rounded-2xl bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-strong)] text-white shadow-[0_15px_50px_rgba(37,99,235,0.35)] hover:scale-[1.01] transition-transform cursor-pointer group"
        >
          <div className="text-center">
            <span className="font-semibold block group-hover:translate-y-[-1px] transition-transform">+ Upload New</span>
            <p className="text-sm opacity-80">Fresh faces sync instantly</p>
          </div>
        </Link>
      </div>

      <div className="glass-card rounded-2xl border border-[color:var(--border-subtle)] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[color:var(--text-primary)]">Recent Uploads</h2>
          <Link to="/gallery" className="text-[color:var(--accent)] text-sm font-semibold hover:underline">View All</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {(stats.recentUploads || []).map((img) => (
            <div
              key={img._id}
              className="min-w-[200px] h-[150px] rounded-xl bg-[color:var(--surface-2)] overflow-hidden flex-shrink-0 relative border border-[color:var(--border-subtle)]"
            >
              <img
                src={img.url}
                alt="Recent"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Users size={14} /> {img.faces || 0}
              </div>
            </div>
          ))}
          {!loading && (stats.recentUploads || []).length === 0 && (
            <div className="text-[color:var(--text-muted)] text-sm">No uploads yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
