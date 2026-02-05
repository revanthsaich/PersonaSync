import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { UserButton } from '@clerk/clerk-react';
import { LayoutDashboard, Image as ImageIcon, Users, MessageSquare, UserPlus, Upload, Folder, Search, X, Moon, Sun, Menu } from 'lucide-react';
import { authenticatedFetch } from '../services/api';
import { useTheme } from '../contexts/ThemeContext.jsx';

const Layout = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  // Track window size for responsive sidebar collapse
  useEffect(() => {
    const handleResize = () => {
      setIsCollapsed(window.innerWidth < 1024);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Set initial value
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      try {
        const [persons, groups, images] = await Promise.all([
          authenticatedFetch('/api/persons'),
          authenticatedFetch('/api/groups'),
          authenticatedFetch('/api/images'),
        ]);

        const query = searchQuery.toLowerCase();

        const personResults = (persons || []).filter(p =>
          (p.name || '').toLowerCase().includes(query)
        );

        const groupResults = (groups || []).filter(g =>
          (g.name || '').toLowerCase().includes(query) ||
          (g.description || '').toLowerCase().includes(query)
        );

        const imageResults = (images || []).filter(img =>
          img.url?.toLowerCase().includes(query)
        ).slice(0, 5);

        setSearchResults({
          persons: personResults,
          groups: groupResults,
          images: imageResults,
        });
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults({ persons: [], groups: [], images: [] });
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(performSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <div className="relative flex h-screen bg-[color:var(--page-bg)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden bg-black/50 animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`lg:hidden fixed inset-y-0 left-0 w-64 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface)]/95 backdrop-blur-sm z-40 overflow-y-auto transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] bg-clip-text text-transparent">PersonaSync</h1>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">Organize faces with a click.</p>
        </div>

        <nav className="px-3 space-y-1">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" collapsed={false} onClick={() => setSidebarOpen(false)} />
          <NavItem to="/gallery" icon={<ImageIcon size={20} />} label="Photos" collapsed={false} onClick={() => setSidebarOpen(false)} />
          <NavItem to="/persons" icon={<Users size={20} />} label="People" collapsed={false} onClick={() => setSidebarOpen(false)} />
          <NavItem to="/groups" icon={<Folder size={20} />} label="Groups" collapsed={false} onClick={() => setSidebarOpen(false)} />

          <div className="pt-4 pb-2">
            <p className="px-4 text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.18em]">Sharing</p>
          </div>

          <NavItem to="/chat" icon={<MessageSquare size={20} />} label="Chat" collapsed={false} onClick={() => setSidebarOpen(false)} />
          <NavItem to="/invite" icon={<UserPlus size={20} />} label="Invite Friends" collapsed={false} onClick={() => setSidebarOpen(false)} />
        </nav>

        <div className="p-4 mt-auto border-t border-[color:var(--border-subtle)]">
          <NavLink
            to="/upload"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] text-white rounded-full font-semibold shadow-[0_10px_30px_rgba(37,99,235,0.25)] hover:translate-y-[-1px] transition-all active:scale-95"
            onClick={() => setSidebarOpen(false)}
          >
            <Upload size={18} />
            <span>Upload</span>
          </NavLink>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex flex-col h-screen border-r border-[color:var(--border-subtle)] bg-[color:var(--surface)]/90 backdrop-blur-sm transition-all duration-300 overflow-y-auto fixed left-0 top-0 z-50 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}>
        <div className={`p-6 flex items-center justify-between flex-shrink-0`}>
          {!isCollapsed && (
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] bg-clip-text text-transparent">PersonaSync</h1>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">Organize faces with a click.</p>
            </div>
          )}
          {isCollapsed && (
            <div className="text-2xl font-bold text-center w-full">🔷</div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          <NavItem to="/" icon={<LayoutDashboard size={20} />} label="Dashboard" collapsed={isCollapsed} />
          <NavItem to="/gallery" icon={<ImageIcon size={20} />} label="Photos" collapsed={isCollapsed} />
          <NavItem to="/persons" icon={<Users size={20} />} label="People" collapsed={isCollapsed} />
          <NavItem to="/groups" icon={<Folder size={20} />} label="Groups" collapsed={isCollapsed} />

          {!isCollapsed && (
            <div className="pt-4 pb-2">
              <p className="px-4 text-xs font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.18em]">Sharing</p>
            </div>
          )}

          <NavItem to="/chat" icon={<MessageSquare size={20} />} label="Chat" collapsed={isCollapsed} />
          <NavItem to="/invite" icon={<UserPlus size={20} />} label="Invite Friends" collapsed={isCollapsed} />
        </nav>

        <div className="p-4 flex-shrink-0 border-t border-[color:var(--border-subtle)]">
          {isCollapsed ? (
            <NavLink
              to="/upload"
              className="flex items-center justify-center w-full py-3 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] text-white rounded-full font-semibold shadow-[0_10px_30px_rgba(37,99,235,0.25)] hover:translate-y-[-1px] transition-all active:scale-95"
              title="Upload"
            >
              <Upload size={18} />
            </NavLink>
          ) : (
            <NavLink
              to="/upload"
              className="flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] text-white rounded-full font-semibold shadow-[0_10px_30px_rgba(37,99,235,0.25)] hover:translate-y-[-1px] transition-all active:scale-95"
            >
              <Upload size={18} />
              <span>Upload</span>
            </NavLink>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64 flex-1 flex flex-col min-w-0 relative z-10" style={{ marginLeft: isCollapsed && window.innerWidth >= 1024 ? '5rem' : undefined }}>
        <header className="h-16 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface)]/90 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-[color:var(--surface-2)] rounded-lg transition"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {isCollapsed && (
              <div className="font-bold text-[color:var(--accent)] hidden lg:block">PersonaSync</div>
            )}
            {!isCollapsed && (
              <div className="font-bold text-[color:var(--accent)] lg:hidden">PersonaSync</div>
            )}
          </div>

          <div className="flex-1 max-w-xl mx-4 hidden md:block relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" size={18} />
              <input
                type="text"
                placeholder="Search photos, people, groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[color:var(--surface-2)] rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:bg-[color:var(--surface)] transition-colors border border-[color:var(--border-subtle)] text-[color:var(--text-primary)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {searchQuery && searchResults && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[color:var(--surface)] rounded-xl shadow-[var(--shadow-soft)] border border-[color:var(--border-subtle)] max-h-96 overflow-y-auto z-50">
                {loading ? (
                  <div className="p-4 text-center text-[color:var(--text-muted)]">Searching...</div>
                ) : (searchResults.persons.length === 0 && searchResults.groups.length === 0 && searchResults.images.length === 0) ? (
                  <div className="p-4 text-center text-[color:var(--text-muted)]">No results found</div>
                ) : (
                  <div className="space-y-4 p-4">
                    {searchResults.persons.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[color:var(--text-muted)] uppercase mb-2">People</p>
                        <div className="space-y-1">
                          {searchResults.persons.slice(0, 3).map((p) => (
                            <button
                              key={p._id}
                              onClick={() => {
                                navigate(`/persons/${p._id}`);
                                setSearchQuery('');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[color:var(--surface-2)] rounded flex items-center gap-2 transition-colors"
                            >
                              {p.thumbnail && (
                                <img src={p.thumbnail} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{p.name}</p>
                                <p className="text-xs text-[color:var(--text-muted)]">{p.count} photos</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults.groups.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[color:var(--text-muted)] uppercase mb-2">Groups</p>
                        <div className="space-y-1">
                          {searchResults.groups.slice(0, 3).map((g) => (
                            <button
                              key={g._id}
                              onClick={() => {
                                navigate(`/groups/${g._id}`);
                                setSearchQuery('');
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-[color:var(--surface-2)] rounded flex items-center gap-2 transition-colors"
                            >
                              {g.coverImage && (
                                <img src={g.coverImage} alt={g.name} className="w-8 h-8 rounded object-cover" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{g.name}</p>
                                <p className="text-xs text-[color:var(--text-muted)]">{g.imageIds?.length || 0} photos</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {searchResults.images.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[color:var(--text-muted)] uppercase mb-2">Photos</p>
                        <div className="grid grid-cols-3 gap-2">
                          {searchResults.images.map((img) => (
                            <button
                              key={img._id}
                              onClick={() => {
                                navigate('/gallery');
                                setSearchQuery('');
                              }}
                              className="aspect-square rounded overflow-hidden hover:ring-2 ring-[color:var(--accent)] transition-all"
                            >
                              <img src={img.url} alt="Result" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] hover:bg-[color:var(--surface)] transition-colors text-[color:var(--text-primary)]"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              <span className="text-sm hidden md:inline">{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
            </button>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

const NavItem = ({ to, icon, label, collapsed, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={({ isActive }) =>
      `flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
        collapsed ? 'justify-center px-2' : ''
      } ${
        isActive
          ? 'bg-[color:var(--surface-2)] text-[color:var(--accent)] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.04)]'
          : 'text-[color:var(--text-muted)] hover:bg-[color:var(--surface-2)] hover:text-[color:var(--text-primary)]'
      }`
    }
  >
    {icon}
    {!collapsed && <span>{label}</span>}
  </NavLink>
);

export default Layout;
