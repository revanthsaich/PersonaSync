import { Server } from "socket.io";

// Map to store connected users: email -> Set of socket IDs
const connectedUsers = new Map();

export const initSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // User registers with their email on connect
    socket.on("register", (email) => {
      if (!email || typeof email !== "string") {
        console.warn("❌ Invalid email on register:", email);
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      if (!connectedUsers.has(normalizedEmail)) {
        connectedUsers.set(normalizedEmail, new Set());
      }
      connectedUsers.get(normalizedEmail).add(socket.id);
      socket.userEmail = normalizedEmail;

      console.log(`\n✅ User REGISTERED: ${normalizedEmail}`);
      console.log(`   Socket ID: ${socket.id}`);
      console.log(`   Total connected users: ${connectedUsers.size}`);
      console.log(`   Connected emails: ${Array.from(connectedUsers.keys()).join(', ')}`);
      
      socket.emit("registered", { email: normalizedEmail });

      // Broadcast presence update
      io.emit("presence:update", { email: normalizedEmail, online: true });
    });

    // Join room for chat/collaboration
    socket.on("join_room", (room) => {
      socket.join(room);
      console.log(`User ${socket.id} joined room: ${room}`);
    });

    socket.on("send_message", (data) => {
      socket.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
      if (socket.userEmail) {
        const userSockets = connectedUsers.get(socket.userEmail);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            connectedUsers.delete(socket.userEmail);
            io.emit("presence:update", { email: socket.userEmail, online: false });
          }
        }
        console.log(`✗ User disconnected: ${socket.userEmail} (socket: ${socket.id})`);
      } else {
        console.log("User disconnected (no email):", socket.id);
      }
    });
  });

  return io;
};

export const isUserOnline = (email) => {
  if (!email || typeof email !== "string") return false;
  const normalizedEmail = email.trim().toLowerCase();
  const sockets = connectedUsers.get(normalizedEmail);
  return !!(sockets && sockets.size > 0);
};

// Helper to emit invite events to a user by email
export const notifyUser = (io, targetEmail, eventName, data) => {
  const normalizedEmail = targetEmail.trim().toLowerCase();
  const socketIds = connectedUsers.get(normalizedEmail);

  console.log(`\n📤 [notifyUser] Broadcasting event: ${eventName}`);
  console.log(`   Target: ${normalizedEmail}`);
  console.log(`   Connected users: ${Array.from(connectedUsers.keys()).join(', ')}`);
  console.log(`   User sockets: ${socketIds ? Array.from(socketIds).join(', ') : 'NONE'}`);

  if (socketIds && socketIds.size > 0) {
    socketIds.forEach((socketId) => {
      io.to(socketId).emit(eventName, data);
      console.log(`   ✉ Sent to socket ${socketId}`);
    });
    console.log(`✅ Emitted ${eventName} to ${normalizedEmail} via ${socketIds.size} socket(s)`);
  } else {
    console.log(`❌ User ${normalizedEmail} is NOT connected (${socketIds ? socketIds.size : 0} sockets)`);
  }
};

// Helper to broadcast to sender when invite status changes
export const notifySender = (io, senderEmail, eventName, data) => {
  const normalizedEmail = senderEmail.trim().toLowerCase();
  const socketIds = connectedUsers.get(normalizedEmail);

  if (socketIds && socketIds.size > 0) {
    socketIds.forEach((socketId) => {
      io.to(socketId).emit(eventName, data);
    });
    console.log(`✉ Emitted ${eventName} to sender ${normalizedEmail} via ${socketIds.size} socket(s)`);
  } else {
    console.log(`⚠ Sender ${normalizedEmail} is not connected`);
  }
};
