import http from "http";
import app from "./app.js";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { initSocket } from "./socket.js";
import { initGridFS } from "./utils/gridfs.js";

// Import separated route files
import uploadRoutes from "./routes/upload.routes.js";
import imageRoutes from "./routes/image.routes.js";
import personRoutes from "./routes/person.routes.js";
import groupRoutes from "./routes/group.routes.js";
import inviteRoutes from "./routes/invite.routes.js";
import chatRoutes from "./routes/chat.routes.js";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/personasync";

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected");
    // Initialize GridFS after MongoDB connection
    initGridFS(mongoose.connection.getClient().db("personasync"));
  })
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Create HTTP server to attach Socket.io
const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);

// Store io instance globally for use in routes
app.set("io", io);

// Routes - organized by feature
app.use("/api/upload", uploadRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/persons", personRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/chat", chatRoutes);

// Keep legacy route for backward compatibility (to be deprecated)
// app.use("/api/data", apiRoutes);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
