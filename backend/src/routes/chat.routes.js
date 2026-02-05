import express from "express";
import multer from "multer";
import { Invitation } from "../models/Invitation.js";
import { Message } from "../models/Message.js";
import { ensureDir, getUserEmail } from "../utils/routeHelpers.js";
import { notifyUser, isUserOnline } from "../socket.js";
import { uploadToGridFS, downloadFromGridFS } from "../utils/gridfs.js";

const router = express.Router();

// --- Multer Config (5MB max) - Store in memory ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// GET /api/chat/presence?emails=a,b,c
router.get("/presence", async (req, res) => {
  const { emails } = req.query;
  if (!emails || typeof emails !== "string") {
    return res.status(400).json({ error: "emails query param is required" });
  }

  const list = emails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const status = {};
  list.forEach((email) => {
    status[email] = isUserOnline(email);
  });

  res.json({ status });
});

// POST /api/chat/messages (send message)
router.post("/messages", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "File too large. Max size is 5MB." });
    }
    if (err) {
      return res.status(400).json({ error: "Failed to process file" });
    }
    return next();
  });
}, async (req, res) => {
  const userEmail = getUserEmail(req);
  const { to, text } = req.body;

  if (!userEmail) return res.status(400).json({ error: "user email required" });
  if (!to || (!text && !req.file)) {
    return res.status(400).json({ error: "to and text or file are required" });
  }

  try {
    // Check if there's an accepted connection between the two users
    const connection = await Invitation.findOne({
      status: "accepted",
      $or: [
        { senderEmail: userEmail, targetEmail: to },
        { senderEmail: to, targetEmail: userEmail }
      ]
    });

    if (!connection) {
      return res.status(403).json({ error: "You can only message connected users" });
    }

    // Create message in database
    let type = "text";
    let fileUrl = "";
    let fileId = null;
    let fileName = "";
    let fileSize = 0;
    let mimeType = "";

    if (req.file) {
      mimeType = req.file.mimetype || "";
      type = mimeType.startsWith("image/") ? "image" : "file";
      fileName = req.file.originalname || req.file.filename;
      fileSize = req.file.size || 0;
      
      // Upload to GridFS
      try {
        fileId = await uploadToGridFS(fileName, req.file.buffer, {
          fromEmail: userEmail,
          toEmail: to,
          messageType: type,
        });
        fileUrl = `/api/chat/files/${fileId}`;
      } catch (gridErr) {
        console.error("GridFS upload error", gridErr);
        return res.status(500).json({ error: "Failed to store file" });
      }
    }

    const created = await Message.create({
      fromEmail: userEmail,
      toEmail: to.toLowerCase(),
      text: text ? text.trim() : "",
      type,
      fileUrl,
      fileId,
      fileName,
      fileSize,
      mimeType,
    });

    const message = {
      _id: created._id,
      from: created.fromEmail,
      to: created.toEmail,
      text: created.text,
      type: created.type,
      fileUrl: created.fileUrl,
      fileName: created.fileName,
      fileSize: created.fileSize,
      mimeType: created.mimeType,
      timestamp: created.createdAt,
    };

    // Emit WebSocket event to recipient
    const io = req.app.get("io");
    if (io) {
      notifyUser(io, to, "message:received", message);
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error("Message send error", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// GET /api/chat/messages - Get chat history with a user
router.get("/messages", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { conversationWith } = req.query;

  if (!userEmail) return res.status(400).json({ error: "user email required" });
  if (!conversationWith) {
    return res.status(400).json({ error: "conversationWith is required" });
  }

  try {
    // Verify users are connected
    const connection = await Invitation.findOne({
      status: "accepted",
      $or: [
        { senderEmail: userEmail, targetEmail: conversationWith },
        { senderEmail: conversationWith, targetEmail: userEmail }
      ]
    });

    if (!connection) {
      return res.status(403).json({ error: "You can only view messages with connected users" });
    }

    const otherEmail = conversationWith.toString().toLowerCase();
    const messages = await Message.find({
      $or: [
        { fromEmail: userEmail, toEmail: otherEmail },
        { fromEmail: otherEmail, toEmail: userEmail },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      messages: messages.map((m) => ({
        _id: m._id,
        from: m.fromEmail,
        to: m.toEmail,
        text: m.text,
        type: m.type,
        fileUrl: m.fileUrl,
        fileName: m.fileName,
        fileSize: m.fileSize,
        mimeType: m.mimeType,
        timestamp: m.createdAt,
      })),
    });
  } catch (err) {
    console.error("Message fetch error", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// GET /api/chat/files/:fileId - Download file from GridFS
router.get("/files/:fileId", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { fileId } = req.params;

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    // Verify user has access to this file (is sender or recipient)
    const message = await Message.findOne({
      fileId: fileId,
      $or: [
        { fromEmail: userEmail },
        { toEmail: userEmail }
      ]
    });

    if (!message) {
      return res.status(403).json({ error: "Unauthorized to access this file" });
    }

    const buffer = await downloadFromGridFS(require('mongodb').ObjectId.createFromHexString(fileId));
    
    res.set('Content-Disposition', `attachment; filename="${message.fileName}"`);
    res.set('Content-Type', message.mimeType || 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error("File download error", err);
    res.status(500).json({ error: "Failed to download file" });
  }
});

// DELETE /api/chat/messages/:id - Delete a message
router.delete("/messages/:id", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { id } = req.params;

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    const msg = await Message.findById(id);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    if (msg.fromEmail !== userEmail && msg.toEmail !== userEmail) {
      return res.status(403).json({ error: "Unauthorized to delete this message" });
    }

    // Delete file from GridFS if exists
    if (msg.fileId) {
      try {
        const { deleteFromGridFS } = await import("../utils/gridfs.js");
        await deleteFromGridFS(msg.fileId);
      } catch (gridErr) {
        console.error("Failed to delete file from GridFS", gridErr);
      }
    }

    await Message.deleteOne({ _id: id });
    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Message delete error", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

export default router;
