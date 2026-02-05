import React, { useEffect, useState, useRef } from 'react';
import { Send, Plus, Trash2, MoreVertical, Paperclip, UserMinus } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { io } from 'socket.io-client';
import { authenticatedFetch } from '../services/api';

const Chat = () => {
    const { user } = useUser();
    const [connections, setConnections] = useState([]);
    const [selectedConnection, setSelectedConnection] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageInput, setMessageInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [toast, setToast] = useState('');
    const [presenceMap, setPresenceMap] = useState({});
    const [selectedFile, setSelectedFile] = useState(null);
    const [hoveredMessageId, setHoveredMessageId] = useState(null);
    const [unreadCounts, setUnreadCounts] = useState({});
    const [menuOpen, setMenuOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ open: false, type: null });
    const messagesEndRef = useRef(null);
    const socketRef = useRef(null);
    const fileInputRef = useRef(null);
    const textInputRef = useRef(null);

    const getOtherEmail = (connection, currentEmail) => {
        if (!connection || !currentEmail) return null;
        return connection.senderEmail === currentEmail
            ? connection.targetEmail
            : connection.senderEmail;
    };

    const buildAuthHeaders = async () => {
        const headers = {};
        const { getToken, user: clerkUser } = window.Clerk || {};

        if (getToken) {
            const token = await getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
        }

        const userId = clerkUser?.id || user?.id;
        if (userId) headers['x-user-id'] = userId;

        const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress || user?.primaryEmailAddress?.emailAddress;
        if (primaryEmail) headers['x-user-email'] = primaryEmail.toLowerCase();

        return headers;
    };

    // Load connections and restore previously selected one
    useEffect(() => {
        const loadConnections = async () => {
            try {
                setLoading(true);
                const res = await authenticatedFetch('/api/invites/connections');
                const allConnections = [
                    ...(res.sent || []),
                    ...(res.received || []),
                ];
                setConnections(allConnections);
                
                // Try to restore previously selected connection
                const savedConnectionId = localStorage.getItem('selectedChatConnectionId');
                if (savedConnectionId) {
                    const savedConnection = allConnections.find(c => c._id === savedConnectionId);
                    if (savedConnection) {
                        setSelectedConnection(savedConnection);
                    } else if (allConnections.length > 0) {
                        setSelectedConnection(allConnections[0]);
                    }
                } else if (allConnections.length > 0) {
                    setSelectedConnection(allConnections[0]);
                }
            } catch (err) {
                console.error('Failed to load connections', err);
                setToast('Could not load connections');
                setTimeout(() => setToast(''), 3000);
            } finally {
                setLoading(false);
            }
        };
        loadConnections();
    }, []);

    // Load presence status for connections
    useEffect(() => {
        const fetchPresence = async () => {
            if (!user?.primaryEmailAddress?.emailAddress || connections.length === 0) return;
            const currentEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
            const emails = connections
                .map((c) => getOtherEmail(c, currentEmail))
                .filter(Boolean);

            if (emails.length === 0) return;
            try {
                const res = await authenticatedFetch(`/api/chat/presence?emails=${encodeURIComponent(emails.join(','))}`);
                setPresenceMap(res.status || {});
            } catch (err) {
                console.error('Failed to load presence', err);
            }
        };

        fetchPresence();
    }, [connections, user?.primaryEmailAddress?.emailAddress]);

    // Initialize WebSocket once
    useEffect(() => {
        if (socketRef.current || !user?.primaryEmailAddress?.emailAddress) return;

        const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
        socketRef.current = io('http://localhost:4000', {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        });

        socketRef.current.on('connect', () => {
            console.log('✓ Connected to chat WebSocket');
            socketRef.current.emit('register', userEmail);
        });

        socketRef.current.on('disconnect', () => {
            console.log('✗ Disconnected from chat WebSocket');
        });

        return () => {
            // Keep socket open, don't disconnect
        };
    }, [user?.primaryEmailAddress?.emailAddress]);

    // Setup message listener
    useEffect(() => {
        if (!socketRef.current || !user?.primaryEmailAddress?.emailAddress) return;

        const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();

        const handleMessageReceived = (data) => {
            console.log('📬 Message received:', data);
            if (!data) return;

            const messageFromEmail = data.from?.toLowerCase();
            const relatedConnection = connections.find(conn => {
                const connOtherEmail = getOtherEmail(conn, userEmail);
                return connOtherEmail?.toLowerCase() === messageFromEmail;
            });

            if (!relatedConnection) return;

            // If viewing this conversation, add message directly
            if (selectedConnection?._id === relatedConnection._id) {
                setMessages((prev) => {
                    // Check if already exists
                    if (data._id && prev.some((m) => m._id === data._id)) {
                        return prev;
                    }
                    return [...prev, data];
                });
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            } else {
                // Increment unread for other conversations
                setUnreadCounts((prev) => ({
                    ...prev,
                    [relatedConnection._id]: (prev[relatedConnection._id] || 0) + 1,
                }));
            }
        };

        socketRef.current.off('message:received');
        socketRef.current.on('message:received', handleMessageReceived);

        return () => {
            if (socketRef.current) {
                socketRef.current.off('message:received', handleMessageReceived);
            }
        };
    }, [selectedConnection?._id, connections, user?.primaryEmailAddress?.emailAddress]);

    // Setup presence listener
    useEffect(() => {
        if (!socketRef.current) return;

        const handlePresenceUpdate = (data) => {
            if (!data?.email) return;
            setPresenceMap((prev) => ({
                ...prev,
                [data.email.toLowerCase()]: !!data.online,
            }));
        };

        socketRef.current.off('presence:update');
        socketRef.current.on('presence:update', handlePresenceUpdate);

        return () => {
            socketRef.current?.off('presence:update', handlePresenceUpdate);
        };
    }, []);

    // Load messages when connection changes
    useEffect(() => {
        if (!selectedConnection || !user?.primaryEmailAddress?.emailAddress) return;

        const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
        const otherEmail = getOtherEmail(selectedConnection, userEmail);

        const loadMessages = async () => {
            try {
                const res = await authenticatedFetch(
                    `/api/chat/messages?conversationWith=${encodeURIComponent(otherEmail)}`
                );
                setMessages(res.messages || []);
                // Clear unread count for this connection when viewing it
                setUnreadCounts((prev) => ({
                    ...prev,
                    [selectedConnection._id]: 0,
                }));
                // Scroll to bottom after loading
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
                }, 100);
            } catch (err) {
                console.error('Failed to load messages', err);
                setMessages([]);
            }
        };
        loadMessages();
    }, [selectedConnection, user?.primaryEmailAddress?.emailAddress]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setToast('File too large. Max size is 5MB.');
            setTimeout(() => setToast(''), 3000);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setSelectedFile(file);
    };

    const handleTextInput = (e) => {
        setMessageInput(e.target.value);
        adjustTextareaHeight();
    };

    const adjustTextareaHeight = () => {
        if (!textInputRef.current) return;
        textInputRef.current.style.height = 'auto';
        textInputRef.current.style.height = Math.min(textInputRef.current.scrollHeight, 120) + 'px';
    };

    const resetTextarea = () => {
        setMessageInput('');
        if (textInputRef.current) {
            textInputRef.current.style.height = 'auto';
            textInputRef.current.value = '';
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if ((!messageInput.trim() && !selectedFile) || !selectedConnection) return;

        const userEmail = user.primaryEmailAddress.emailAddress.toLowerCase();
        const otherEmail = getOtherEmail(selectedConnection, userEmail);

        setSendingMessage(true);
        try {
            const formData = new FormData();
            formData.append('to', otherEmail);
            if (messageInput.trim()) formData.append('text', messageInput.trim());
            if (selectedFile) formData.append('file', selectedFile);

            const headers = await buildAuthHeaders();
            const response = await fetch('http://localhost:4000/api/chat/messages', {
                method: 'POST',
                headers,
                body: formData,
            });

            if (!response.ok) {
                let errorMsg = `API Error: ${response.statusText}`;
                try {
                    const errData = await response.json();
                    if (errData.error) errorMsg = errData.error;
                } catch {
                    // ignore JSON errors
                }
                throw new Error(errorMsg);
            }

            const res = await response.json();

            // Add message to local state
            const newMessage = {
                ...res.message,
                timestamp: res.message.timestamp || new Date().toISOString(),
            };
            setMessages((prev) => [...prev, newMessage]);
            resetTextarea();
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            scrollToBottom();

            // Emit WebSocket event to other user
            if (socketRef.current) {
                socketRef.current.emit('message:send', {
                    to: otherEmail,
                    from: userEmail,
                    text: messageInput.trim(),
                });
            }
        } catch (err) {
            console.error('Failed to send message', err);
            setToast(err.message || 'Failed to send message');
            setTimeout(() => setToast(''), 3000);
        } finally {
            setSendingMessage(false);
        }
    };

    const handleDeleteMessage = async (messageId) => {
        try {
            await authenticatedFetch(`/api/chat/messages/${messageId}`, {
                method: 'DELETE',
            });
            setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
            setToast('Message deleted');
            setTimeout(() => setToast(''), 2000);
        } catch (err) {
            console.error('Failed to delete message', err);
            setToast('Failed to delete message');
            setTimeout(() => setToast(''), 3000);
        }
    };

    const handleClearMessages = () => {
        setConfirmModal({ open: true, type: 'clearMessages' });
        setMenuOpen(false);
    };

    const executeClearMessages = async () => {
        try {
            // Delete each message individually
            const deletePromises = messages.map(msg =>
                authenticatedFetch(`/api/chat/messages/${msg._id}`, { method: 'DELETE' })
                    .catch(err => console.error(`Failed to delete message ${msg._id}:`, err))
            );
            await Promise.all(deletePromises);
            setMessages([]);
            setToast('All messages deleted');
            setTimeout(() => setToast(''), 2000);
            setConfirmModal({ open: false, type: null });
        } catch (err) {
            console.error('Failed to clear messages', err);
            setToast('Failed to delete messages');
            setTimeout(() => setToast(''), 3000);
            setConfirmModal({ open: false, type: null });
        }
    };

    const handleRemoveFriend = () => {
        setConfirmModal({ open: true, type: 'removeFriend' });
        setMenuOpen(false);
    };

    const executeRemoveFriend = async () => {
        try {
            await authenticatedFetch(`/api/invites/${selectedConnection._id}`, {
                method: 'DELETE',
            });
            setConnections((prev) => prev.filter((c) => c._id !== selectedConnection._id));
            setSelectedConnection(null);
            setToast('Contact removed');
            setTimeout(() => setToast(''), 2000);
            setConfirmModal({ open: false, type: null });
        } catch (err) {
            console.error('Failed to remove contact', err);
            setToast('Failed to remove contact');
            setTimeout(() => setToast(''), 3000);
            setConfirmModal({ open: false, type: null });
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    const formatFileSize = (size) => {
        if (!size) return '';
        const mb = size / (1024 * 1024);
        if (mb >= 1) return `${mb.toFixed(1)} MB`;
        const kb = size / 1024;
        return `${Math.round(kb)} KB`;
    };

    const renderMessageContent = (msg) => {
        const hasText = msg.text && msg.text.trim().length > 0;
        const isImage = msg.type === 'image' && msg.fileUrl;
        const isFile = msg.type === 'file' && msg.fileUrl;

        return (
            <div className="space-y-2">
                {hasText && <p className="break-words leading-relaxed">{msg.text}</p>}
                {isImage && (
                    <div className="rounded-xl overflow-hidden border border-white/10">
                        <img
                            src={msg.fileUrl}
                            alt={msg.fileName || 'image'}
                            className="max-w-[260px] max-h-[220px] object-cover"
                        />
                    </div>
                )}
                {isFile && (
                    <a
                        href={msg.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface)] px-3 py-2 text-sm hover:opacity-90"
                    >
                        <span className="font-medium truncate max-w-[180px]">{msg.fileName || 'Attachment'}</span>
                        <span className="text-xs text-[color:var(--text-muted)]">{formatFileSize(msg.fileSize)}</span>
                    </a>
                )}
            </div>
        );
    };

    const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
    const currentConnectionEmail = getOtherEmail(selectedConnection, userEmail);
    const currentIsOnline = currentConnectionEmail
        ? !!presenceMap[currentConnectionEmail.toLowerCase()]
        : false;

    if (loading) {
        return (
            <div className="max-w-6xl mx-auto py-8">
                <div className="text-center text-[color:var(--text-muted)]">Loading conversations...</div>
            </div>
        );
    }

    if (connections.length === 0) {
        return (
            <div className="max-w-6xl mx-auto py-12">
                <div className="text-center space-y-4">
                    <Plus size={48} className="mx-auto text-[color:var(--text-muted)]" />
                    <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">No Connections Yet</h2>
                    <p className="text-[color:var(--text-muted)]">Invite friends to start chatting with them</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 h-[calc(100vh-120px)]">
            <div className="grid grid-cols-3 gap-6 h-full">
                {/* Connections List */}
                <div className="col-span-1 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-2xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-[color:var(--border-subtle)]">
                        <h2 className="text-lg font-bold text-[color:var(--text-primary)]">Messages</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-[color:var(--border-subtle)]">
                        {connections.map((conn) => {
                            const email = conn.senderEmail === userEmail ? conn.targetEmail : conn.senderEmail;
                            const isOnline = !!presenceMap[email?.toLowerCase()];
                            const isSelected = selectedConnection?._id === conn._id;
                            return (
                                <button
                                    key={conn._id}
                                    onClick={() => {
                                        setSelectedConnection(conn);
                                        localStorage.setItem('selectedChatConnectionId', conn._id);
                                    }}
                                    className={`w-full text-left p-2 md:p-4 hover:bg-[color:var(--surface-2)] transition ${
                                        isSelected ? 'bg-[color:var(--accent)]/10 border-l-4 border-[color:var(--accent)] flex flex-col items-center md:items-start' : 'flex flex-col items-center md:items-start'
                                    }`}
                                >
                                    <div className="flex flex-col md:flex-row items-center gap-2 md:gap-3 w-full">
                                        <div className="relative w-8 md:w-10 h-8 md:h-10">
                                            <div className="w-8 md:w-10 h-8 md:h-10 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] text-xs md:text-sm font-bold">
                                                {email[0].toUpperCase()}
                                            </div>
                                            <span
                                                className={`absolute bottom-0 right-0 block h-1.5 md:h-2.5 w-1.5 md:w-2.5 rounded-full border-2 border-[color:var(--surface)] ${
                                                    isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                                                }`}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1 hidden md:block">
                                            <p className="text-[color:var(--text-primary)] font-medium truncate text-sm">{email}</p>
                                            <p className="text-xs text-[color:var(--text-muted)]">
                                                {isOnline ? 'Online' : 'Offline'}
                                            </p>
                                        </div>
                                        {unreadCounts[conn._id] > 0 && (
                                            <span className="ml-0 md:ml-2 flex items-center justify-center w-5 h-5 rounded-full bg-[color:var(--accent)] text-white text-xs font-semibold">
                                                {unreadCounts[conn._id]}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Chat Area */}
                {selectedConnection && (
                    <div className="col-span-2 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-2xl overflow-hidden flex flex-col">
                        {/* Chat Header */}
                        <div className="p-4 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative w-10 h-10">
                                    <div className="w-10 h-10 rounded-full bg-[color:var(--surface-2)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] text-sm font-bold">
                                        {currentConnectionEmail?.[0]?.toUpperCase()}
                                    </div>
                                    <span
                                        className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-[color:var(--surface)] ${
                                            currentIsOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-[color:var(--text-primary)]">{currentConnectionEmail}</h2>
                                    <p className="text-xs text-[color:var(--text-muted)]">
                                        {currentIsOnline ? 'Online' : 'Offline'}
                                    </p>
                                </div>
                            </div>
                            <div className="relative">
                                <button
                                    onClick={() => setMenuOpen(!menuOpen)}
                                    className="p-2 hover:bg-[color:var(--surface-2)] rounded-lg transition"
                                >
                                    <MoreVertical size={20} className="text-[color:var(--text-muted)]" />
                                </button>
                                {menuOpen && (
                                    <div className="absolute right-0 top-10 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-lg shadow-lg z-50">
                                        <button
                                            onClick={handleClearMessages}
                                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--surface-2)] transition border-b border-[color:var(--border-subtle)]"
                                            title="Clear all messages"
                                        >
                                            <Trash2 size={16} />
                                            Clear
                                        </button>
                                        <button
                                            onClick={handleRemoveFriend}
                                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-500 hover:bg-rose-50 transition"
                                            title="Remove this contact"
                                        >
                                            <UserMinus size={16} />
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div
                            className="flex-1 overflow-y-auto p-4 space-y-4 bg-[color:var(--page-bg)] scrollbar-hide hover:scrollbar-show"
                            style={{
                                backgroundImage: "url('/chat-bg.png')",
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                            }}
                        >
                            {messages.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-[color:var(--text-muted)]">
                                    <p>No messages yet. Start a conversation!</p>
                                </div>
                            ) : (
                                messages.map((msg, idx) => {
                                    const isOwn = msg.from === userEmail;
                                    const showDate = idx === 0 || 
                                        formatDate(messages[idx - 1].timestamp) !== formatDate(msg.timestamp);
                                    
                                    return (
                                        <div key={msg._id}>
                                            {showDate && (
                                                <div className="flex justify-center my-2">
                                                    <span className="text-xs text-[color:var(--text-muted)] bg-[color:var(--surface)] px-3 py-1 rounded-full">
                                                        {formatDate(msg.timestamp)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                                <div
                                                    onMouseEnter={() => setHoveredMessageId(msg._id)}
                                                    onMouseLeave={() => setHoveredMessageId(null)}
                                                    className={`max-w-xs px-4 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                                                        hoveredMessageId === msg._id ? 'h-auto' : 'h-fit'
                                                    } ${
                                                        isOwn
                                                            ? 'bg-[color:var(--accent)] text-white'
                                                            : 'bg-[color:var(--surface-2)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)]'
                                                    } group relative`}
                                                >
                                                    {renderMessageContent(msg)}
                                                    {hoveredMessageId === msg._id && (
                                                        <p className={`text-[9px] mt-1.5 ${
                                                            isOwn ? 'text-white/60' : 'text-[color:var(--text-muted)]'
                                                        }`}>
                                                            {formatTime(msg.timestamp)}
                                                        </p>
                                                    )}
                                                    {isOwn && (
                                                        <button
                                                            onClick={() => handleDeleteMessage(msg._id)}
                                                            className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-rose-500 hover:bg-rose-50 rounded transition"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={handleSendMessage} className="p-4 border-t border-[color:var(--border-subtle)]">
                            {selectedFile && (
                                <div className="mb-3 flex items-center justify-between rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] px-3 py-2">
                                    <div className="text-sm text-[color:var(--text-primary)] truncate">
                                        <span className="font-medium">Attached:</span> {selectedFile.name}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = '';
                                        }}
                                        className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                                    >
                                        Remove
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-3">
                                <label className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] cursor-pointer hover:opacity-90">
                                    <Paperclip size={18} className="text-[color:var(--text-muted)]" />
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                                <textarea
                                    ref={textInputRef}
                                    value={messageInput}
                                    onChange={handleTextInput}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage(e);
                                        }
                                    }}
                                    placeholder="Type a message..."
                                    className="flex-1 px-4 py-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-2)] text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent)]/30 transition resize-none min-h-10 max-h-[120px] overflow-y-auto"
                                    rows="1"
                                />
                                <button
                                    type="submit"
                                    disabled={(!messageInput.trim() && !selectedFile) || sendingMessage}
                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-strong)] text-white font-medium flex items-center justify-center gap-2 hover:translate-y-[-1px] active:scale-95 transition disabled:opacity-60"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            {toast && (
                <div className="fixed bottom-6 right-6 bg-[color:var(--surface)] border border-[color:var(--border-subtle)] shadow-[var(--shadow-strong)] px-4 py-3 rounded-xl text-[color:var(--text-primary)]">
                    {toast}
                </div>
            )}

            {confirmModal.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
                    <div className="bg-[color:var(--surface)] border border-[color:var(--border-subtle)] rounded-2xl shadow-[var(--shadow-strong)] p-6 max-w-sm">
                        {confirmModal.type === 'clearMessages' && (
                            <>
                                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">Clear Messages?</h3>
                                <p className="text-sm text-[color:var(--text-muted)] mb-6">Delete all messages with this contact. This cannot be undone.</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setConfirmModal({ open: false, type: null })}
                                        className="flex-1 px-4 py-2 rounded-lg border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] font-medium hover:bg-[color:var(--surface-2)] transition"
                                    >
                                        Decline
                                    </button>
                                    <button
                                        onClick={executeClearMessages}
                                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </>
                        )}
                        {confirmModal.type === 'removeFriend' && (
                            <>
                                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">Remove Contact?</h3>
                                <p className="text-sm text-[color:var(--text-muted)] mb-6">Remove this contact from your connections. This cannot be undone.</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setConfirmModal({ open: false, type: null })}
                                        className="flex-1 px-4 py-2 rounded-lg border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] font-medium hover:bg-[color:var(--surface-2)] transition"
                                    >
                                        Decline
                                    </button>
                                    <button
                                        onClick={executeRemoveFriend}
                                        className="flex-1 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium hover:bg-rose-700 transition"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chat;
