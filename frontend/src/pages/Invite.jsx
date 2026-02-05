import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Send, Check, ThumbsUp, ThumbsDown, Trash2, Users } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { io as ioClient } from 'socket.io-client';
import { authenticatedFetch } from '../services/api';

const Invite = () => {
    const { user } = useUser();
    const [email, setEmail] = useState('');
    const [invites, setInvites] = useState([]);
    const [sentInvites, setSentInvites] = useState([]);
    const [friends, setFriends] = useState([]);
    const [sending, setSending] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState('');
    const [modal, setModal] = useState({ isOpen: false, id: null, type: null, count: 0 });

    // Function to refresh invites from server
    const refreshInvites = async () => {
        try {
            const [inboxRes, sentRes, friendsRes] = await Promise.all([
                authenticatedFetch('/api/invites'),
                authenticatedFetch('/api/invites?sent=true'),
                authenticatedFetch('/api/invites/friends'),
            ]);
            setInvites(inboxRes.invites || []);
            setSentInvites(sentRes.invites || []);
            setFriends(friendsRes.friends || []);
            console.log('✓ Invites refreshed');
        } catch (err) {
            console.error('Failed to refresh invites', err);
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                await refreshInvites();
            } catch (err) {
                console.error('Failed to load invites', err);
                setToast('Could not load invites');
                setTimeout(() => setToast(''), 3000);
            } finally {
                setLoading(false);
            }
        };
        load();

        // Refresh invites every 5 seconds to catch WebSocket misses
        const refreshInterval = setInterval(refreshInvites, 5000);
        return () => clearInterval(refreshInterval);
    }, []);

    // Connect to WebSocket and register user email
    useEffect(() => {
        if (!user?.primaryEmailAddress?.emailAddress) {
            console.warn('⚠️ No user email available yet');
            return;
        }

        const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
        console.log(`🔌 Attempting to connect WebSocket for: ${userEmail}`);

        const socket = ioClient('http://localhost:4000', {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });

        const handleConnect = () => {
            console.log('✅ WebSocket connected, socket ID:', socket.id);
            console.log(`📝 Registering email: ${userEmail}`);
            socket.emit('register', userEmail);
        };

        const handleRegistered = ({ email: registeredEmail }) => {
            console.log(`✅ Successfully registered as: ${registeredEmail}`);
        };

        const handleConnectError = (error) => {
            console.error('❌ Connection error:', error);
        };

        const handleInviteReceived = (data) => {
            console.log('📬 New invite received:', data);
            refreshInvites();
            setToast('New invite received!');
            setTimeout(() => setToast(''), 3000);
        };

        const handleInviteStatusChanged = (data) => {
            console.log('✓ Invite status changed:', data);
            if (data.status === 'accepted') {
                setSentInvites((prev) => prev.filter((inv) => inv._id !== data._id));
                setFriends((prev) => [
                    ...prev,
                    {
                        _id: data._id,
                        email: data.targetEmail,
                        connectedAt: new Date().toISOString(),
                        type: 'sent',
                    }
                ]);
            } else {
                setSentInvites((prev) =>
                    prev.map((inv) => (inv._id === data._id ? { ...inv, status: data.status } : inv))
                );
            }
            setToast(`Invite ${data.status}`);
            setTimeout(() => setToast(''), 3000);
        };

        const handleConnectionRemoved = (data) => {
            console.log('✗ Friend removed:', data);
            setFriends((prev) => prev.filter((f) => f._id !== data.inviteId));
            setToast(`Friendship ended`);
            setTimeout(() => setToast(''), 3000);
        };

        const handleDisconnect = () => {
            console.log('✗ Disconnected from WebSocket');
        };

        socket.on('connect', handleConnect);
        socket.on('registered', handleRegistered);
        socket.on('connect_error', handleConnectError);
        socket.on('invite:received', handleInviteReceived);
        socket.on('invite:statusChanged', handleInviteStatusChanged);
        socket.on('connection:removed', handleConnectionRemoved);
        socket.on('disconnect', handleDisconnect);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('registered', handleRegistered);
            socket.off('connect_error', handleConnectError);
            socket.off('invite:received', handleInviteReceived);
            socket.off('invite:statusChanged', handleInviteStatusChanged);
            socket.off('connection:removed', handleConnectionRemoved);
            socket.off('disconnect', handleDisconnect);
            socket.disconnect();
        };
    }, [user?.primaryEmailAddress?.emailAddress]);

    const openModal = (id, type, count = 0) => {
        setModal({ isOpen: true, id, type, count });
    };

    const closeModal = () => {
        setModal({ isOpen: false, id: null, type: null, count: 0 });
    };

    const confirmRemove = async () => {
        const { id, type } = modal;
        if (!id) return;

        try {
            if (type === 'clearPending') {
                // Clear all pending invites
                const invitesToDelete = invites.filter((i) => i.status === 'pending');

                await Promise.all(
                    invitesToDelete.map((inv) =>
                        authenticatedFetch(`/api/invites/${inv._id}`, {
                            method: 'DELETE',
                        })
                    )
                );

                setInvites((prev) =>
                    prev.filter((i) => i.status !== 'pending')
                );

                setToast(`${invitesToDelete.length} pending invite(s) cleared`);
            } else if (type === 'clearSent') {
                // Clear all sent invites
                await Promise.all(
                    sentInvites.map((inv) =>
                        authenticatedFetch(`/api/invites/${inv._id}`, {
                            method: 'DELETE',
                        })
                    )
                );

                setSentInvites([]);
                setToast(`${sentInvites.length} sent invite(s) cleared`);
            } else if (type === 'clearDeclined') {
                // Clear all declined invites
                const declinedInvites = invites.filter((i) => i.status === 'declined');

                await Promise.all(
                    declinedInvites.map((inv) =>
                        authenticatedFetch(`/api/invites/${inv._id}`, {
                            method: 'DELETE',
                        })
                    )
                );

                setInvites((prev) =>
                    prev.filter((i) => i.status !== 'declined')
                );

                setToast(`${declinedInvites.length} declined invite(s) cleared`);
            } else if (type === 'removeFriend') {
                // Remove individual friend
                await authenticatedFetch(`/api/invites/${id}`, {
                    method: 'DELETE',
                });
                setFriends((prev) => prev.filter((f) => f._id !== id));
                setToast('Friend removed');
            }
            
            setTimeout(() => setToast(''), 2000);
            closeModal();
        } catch (err) {
            console.error('Remove failed', err);
            setToast(err.message || 'Failed to remove');
            setTimeout(() => setToast(''), 3000);
        }
    };

    const removeConnection = async (id) => {
        openModal(id, 'connection', 0);
    };

    const clearAllPending = () => {
        const pendingCount = invites.filter((i) => i.status === 'pending').length;
        if (pendingCount === 0) return;
        openModal('all-pending', 'clearPending', pendingCount);
    };

    const clearAllSent = () => {
        if (sentInvites.length === 0) return;
        openModal('all-sent', 'clearSent', sentInvites.length);
    };

    const clearAllConnections = () => {
        const totalConnections = connections.sent.length + connections.received.length;
        if (totalConnections === 0) return;
        openModal('all-connections', 'clearConnections', totalConnections);
    };

    const removeFriend = (id) => {
        openModal(id, 'removeFriend', 1);
    };

    const handleInvite = async (e) => {
        e.preventDefault();
        const value = email.trim().toLowerCase();
        if (!value) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            setToast('Please enter a valid email.');
            setTimeout(() => setToast(''), 3000);
            return;
        }

        // Check if already a friend
        const isFriend = friends.some((f) => f.email.toLowerCase() === value);
        if (isFriend) {
            setToast(`You are already friends with ${value}. You cannot send another invite.`);
            setTimeout(() => setToast(''), 3000);
            return;
        }

        // Check if already sent a pending invite
        const hasPendingInvite = sentInvites.some((inv) => inv.targetEmail.toLowerCase() === value && inv.status === 'pending');
        if (hasPendingInvite) {
            setToast(`You already have a pending invite sent to ${value}. Please wait for their response.`);
            setTimeout(() => setToast(''), 3000);
            return;
        }

        setSending(true);
        try {
            const res = await authenticatedFetch('/api/invites', {
                method: 'POST',
                body: JSON.stringify({ email: value }),
            });
            setSentInvites((prev) => [res.invite, ...prev]);
            setToast('Invite sent');
            setTimeout(() => setToast(''), 2000);
            setEmail('');
        } catch (err) {
            console.error('Send invite failed', err);
            setToast(err.message || 'Failed to send invite');
            setTimeout(() => setToast(''), 3000);
        } finally {
            setSending(false);
        }
    };

    const updateStatus = async (id, status) => {
        try {
            const res = await authenticatedFetch(`/api/invites/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ action: status === 'accepted' ? 'accept' : 'decline' }),
            });
            
            if (status === 'accepted') {
                // Move from pending to friends
                const invite = invites.find((inv) => inv._id === id);
                setInvites((prev) => prev.filter((inv) => inv._id !== id));
                if (invite) {
                    setFriends((prev) => [
                        ...prev,
                        {
                            _id: id,
                            email: invite.senderEmail,
                            connectedAt: new Date().toISOString(),
                            type: 'received',
                        }
                    ]);
                }
            } else {
                // Move to declined
                setInvites((prev) => prev.map((inv) => (inv._id === id ? { ...inv, status } : inv)));
            }
            
            setToast(`Invite ${status}`);
            setTimeout(() => setToast(''), 2000);
        } catch (err) {
            console.error('Update invite failed', err);
            const errMsg = err.message || '';
            
            // Show user-friendly error messages as toast
            let toastMsg = '';
            if (errMsg.includes('already accepted')) {
                toastMsg = 'You have already accepted this invite.';
            } else if (errMsg.includes('already declined')) {
                toastMsg = 'You have already declined this invite.';
            } else if (errMsg.includes('Only one active connection')) {
                toastMsg = 'You already have an active connection with this person.';
            } else if (errMsg.includes('not found')) {
                toastMsg = 'Invite not found or email mismatch.';
            } else if (errMsg.includes('Cannot accept')) {
                toastMsg = 'This invite cannot be accepted in its current state.';
            } else if (errMsg.includes('Cannot decline')) {
                toastMsg = 'This invite cannot be declined in its current state.';
            } else {
                toastMsg = 'Unable to update invite. Please try again.';
            }
            setToast(toastMsg);
            setTimeout(() => setToast(''), 3000);
        }
    };

    const grouped = useMemo(() => {
        return {
            pending: invites.filter((i) => i.status === 'pending'),
            declined: invites.filter((i) => i.status === 'declined'),
        };
    }, [invites]);

    const badgeClass = (status) => {
        if (status === 'accepted') return 'bg-emerald-100 text-emerald-700';
        if (status === 'declined') return 'bg-rose-100 text-rose-700';
        return 'bg-amber-100 text-amber-700';
    };

    return (
        <div className="max-w-3xl mx-auto py-12 space-y-8">
            <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-[color:var(--surface-2)] text-[color:var(--accent)] flex items-center justify-center mx-auto shadow-[var(--shadow-soft)] border border-[color:var(--border-subtle)]">
                    <Mail size={28} />
                </div>
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold text-[color:var(--text-primary)]">Invite Friends</h1>
                    <p className="text-[color:var(--text-muted)]">Send a link they can accept or decline right here.</p>
                </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-[color:var(--border-subtle)]">
                <form onSubmit={handleInvite} className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                        <input
                            type="email"
                            required
                            placeholder="friend@domain.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-5 py-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/30 transition"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={sending}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-strong)] text-white font-semibold flex items-center justify-center gap-2 shadow-[0_12px_30px_rgba(37,99,235,0.25)] hover:translate-y-[-1px] active:scale-95 transition disabled:opacity-60"
                    >
                        {sending ? <Check size={18} /> : <Send size={18} />}
                        {sending ? 'Invited' : 'Send invite'}
                    </button>
                </form>
            </div>

            <div className="space-y-6">
                {/* Friends Section */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.18em]">Friends</h3>
                            {friends.length > 0 && (
                                <p className="text-xs text-[color:var(--text-muted)] mt-1">You are already connected with these people</p>
                            )}
                        </div>
                        <span className="text-xs text-[color:var(--text-muted)]">{friends.length}</span>
                    </div>
                    <div className="bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[color:var(--border-subtle)]">
                        {loading ? (
                            <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading…</div>
                        ) : friends.length === 0 ? (
                            <div className="p-4 text-sm text-[color:var(--text-muted)]">No friends yet. Accept invites to make friends!</div>
                        ) : (
                            friends.map((friend) => (
                                <div key={friend._id} className="p-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] text-xs font-semibold">
                                            {friend.email?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[color:var(--text-primary)] font-medium truncate">{friend.email}</p>
                                            <p className="text-[color:var(--text-muted)] text-xs">Connected friend</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => removeFriend(friend._id)}
                                        className="p-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 transition-colors"
                                        aria-label="Remove friend"
                                        title="Remove this friend"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Pending and Declined Invites */}
                {['pending', 'declined'].map((section) => (
                    <div key={section} className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.18em]">
                                {section} invites
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-[color:var(--text-muted)]">{grouped[section].length}</span>
                                {section === 'pending' && grouped[section].length > 0 && (
                                    <button
                                        onClick={clearAllPending}
                                        className="text-xs px-3 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors font-medium"
                                    >
                                        Clear All
                                    </button>
                                )}
                                {section === 'declined' && grouped[section].length > 0 && (
                                    <button
                                        onClick={() => openModal('all-declined', 'clearDeclined', grouped[section].length)}
                                        className="text-xs px-3 py-1 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors font-medium"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[color:var(--border-subtle)]">
                            {loading ? (
                                <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading…</div>
                            ) : grouped[section].length === 0 ? (
                                <div className="p-4 text-sm text-[color:var(--text-muted)]">No {section} invites.</div>
                            ) : (
                                grouped[section].map((inv) => (
                                    <div key={inv._id} className="p-4 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] text-xs font-semibold">
                                                {inv.senderEmail?.[0]?.toUpperCase() || '?'}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[color:var(--text-primary)] font-medium truncate">{inv.senderEmail}</p>
                                                <p className="text-[color:var(--text-muted)] text-xs">Invited you to collaborate</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs px-2 py-1 rounded-full border ${badgeClass(inv.status)}`}>{inv.status}</span>
                                            {inv.status === 'pending' && (
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => updateStatus(inv._id, 'accepted')}
                                                        className="p-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 transition-colors"
                                                        aria-label="Accept"
                                                        title="Accept this invitation"
                                                    >
                                                        <ThumbsUp size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => updateStatus(inv._id, 'declined')}
                                                        className="p-2 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-100 transition-colors"
                                                        aria-label="Decline"
                                                        title="Decline this invitation"
                                                    >
                                                        <ThumbsDown size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ))}

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-[color:var(--text-muted)] uppercase tracking-[0.18em]">Sent invites</h3>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-[color:var(--text-muted)]">{sentInvites.length}</span>
                            {sentInvites.length > 0 && (
                                <button
                                    onClick={clearAllSent}
                                    className="text-xs px-3 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-medium"
                                >
                                    Clear All
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden divide-y divide-[color:var(--border-subtle)]">
                        {loading ? (
                            <div className="p-4 text-sm text-[color:var(--text-muted)]">Loading…</div>
                        ) : sentInvites.length === 0 ? (
                            <div className="p-4 text-sm text-[color:var(--text-muted)]">You haven't sent any invites yet.</div>
                        ) : (
                            sentInvites.map((inv) => (
                                <div key={inv._id} className="p-4 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] text-xs font-semibold">
                                            {inv.targetEmail?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[color:var(--text-primary)] font-medium truncate">{inv.targetEmail}</p>
                                            <p className="text-[color:var(--text-muted)] text-xs">Status: {inv.status}</p>
                                        </div>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full border ${badgeClass(inv.status)}`}>{inv.status}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {toast && (
                <div className="fixed bottom-6 right-6 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-strong)] px-4 py-3 rounded-xl text-[color:var(--text-primary)]">
                    {toast}
                </div>
            )}

            {/* Confirmation Modal */}
            {modal.isOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-[color:var(--surface)] rounded-2xl shadow-[var(--shadow-strong)] border border-[color:var(--border-subtle)] max-w-sm w-full p-6 space-y-4">
                        <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                            {modal.type === 'clearPending' && 'Clear All Pending Invites?'}
                            {modal.type === 'clearSent' && 'Clear All Sent Invites?'}
                            {modal.type === 'clearDeclined' && 'Clear All Declined Invites?'}
                            {modal.type === 'removeFriend' && 'Remove Friend?'}
                        </h2>
                        <p className="text-[color:var(--text-muted)]">
                            {modal.type === 'clearPending' && `You are about to remove ${modal.count} pending invite(s). This action cannot be undone.`}
                            {modal.type === 'clearSent' && `You are about to remove ${modal.count} sent invite(s). This action cannot be undone.`}
                            {modal.type === 'clearDeclined' && `You are about to remove ${modal.count} declined invite(s). This action cannot be undone.`}
                            {modal.type === 'removeFriend' && 'You will no longer be able to chat with this person. This action cannot be undone.'}
                        </p>
                        <div className="flex gap-3 justify-end pt-4">
                            <button
                                onClick={closeModal}
                                className="px-4 py-2 rounded-lg border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-2)] transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmRemove}
                                className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition font-medium"
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Invite;
