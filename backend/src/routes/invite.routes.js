import express from "express";
import { Invitation } from "../models/Invitation.js";
import { getUserId, getUserEmail } from "../utils/routeHelpers.js";
import { notifyUser, notifySender } from "../socket.js";

const router = express.Router();

// POST /api/invites (create new invitation)
router.post("/", async (req, res) => {
  const userId = getUserId(req);
  const senderEmail = getUserEmail(req);
  const { email } = req.body;

  if (!senderEmail) {
    return res.status(400).json({ error: "sender email missing" });
  }

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }

  const targetEmail = email.trim().toLowerCase();

  // 1️⃣ Prevent self-invite
  if (targetEmail === senderEmail) {
    return res.status(400).json({
      error: "You cannot send an invite to yourself",
    });
  }

  try {
    // 2️⃣ Check if already friends (ACCEPTED in either direction)
    const alreadyFriends = await Invitation.findOne({
      status: "accepted",
      $or: [
        { senderEmail, targetEmail },
        { senderEmail: targetEmail, targetEmail: senderEmail },
      ],
    });

    if (alreadyFriends) {
      return res.status(400).json({
        error: `You are already friends with ${targetEmail}`,
        isAlreadyFriend: true,
      });
    }

    // 3️⃣ Check for ANY pending invite (either direction)
    const pendingInvite = await Invitation.findOne({
      status: "pending",
      $or: [
        { senderEmail, targetEmail },
        { senderEmail: targetEmail, targetEmail: senderEmail },
      ],
    });

    if (pendingInvite) {
      return res.status(400).json({
        error: `An invite is already pending between you and ${targetEmail}`,
        isPending: true,
      });
    }

    // 4️⃣ Create new invite
    const invite = await Invitation.create({
      userId,
      senderEmail,
      targetEmail,
      status: "pending",
    });

    // Notify recipient via socket
    const io = req.app.get("io");
    if (io) {
      notifyUser(io, targetEmail, "invite:received", {
        _id: invite._id,
        senderEmail: invite.senderEmail,
        targetEmail: invite.targetEmail,
        status: invite.status,
        createdAt: invite.createdAt,
      });
    }

    return res.json({ success: true, invite });

  } catch (err) {
    console.error("Invite create error:", err);
    return res.status(500).json({ error: "Failed to create invite" });
  }
});

// GET /api/invites
// inbox=true -> invites addressed to current email
// sent=true -> invites created by current user
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const userEmail = getUserEmail(req);
  const { sent } = req.query;

  console.log(`\n📋 [GET /invites] Request:`);
  console.log(`   Email: ${userEmail}`);
  console.log(`   Sent: ${sent}`);

  try {
    let filter;
    if (sent === "true") {
      // Get only pending and declined invites sent by this user (not accepted)
      filter = { userId, status: { $in: ["pending", "declined"] } };
      console.log(`   Filter (sent): ${JSON.stringify(filter)}`);
    } else {
      // Get only pending and declined invites received (not accepted)
      if (!userEmail) {
        console.warn("   ❌ No user email in headers!");
        return res.status(400).json({ error: "user email required" });
      }
      filter = { targetEmail: userEmail, status: { $in: ["pending", "declined"] } };
      console.log(`   Filter (inbox): ${JSON.stringify(filter)}`);
    }

    const invites = await Invitation.find(filter).sort({ createdAt: -1 }).lean();
    console.log(`   ✅ Found ${invites.length} invite(s)`);
    invites.forEach((inv, i) => {
      console.log(`      [${i}] From: ${inv.senderEmail}, To: ${inv.targetEmail}, Status: ${inv.status}`);
    });
    
    res.json({ invites });
  } catch (err) {
    console.error("Invite fetch error", err);
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// GET /api/invites/friends (get all accepted connections as 'friends' for current user)
router.get("/friends", async (req, res) => {
  const userEmail = getUserEmail(req);

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    // Get all accepted connections - both invites user received and accepted
    const acceptedAsTarget = await Invitation.find({
      targetEmail: userEmail,
      status: "accepted",
    }).lean();

    // Get all accepted invites user sent
    const acceptedAsSender = await Invitation.find({
      senderEmail: userEmail,
      status: "accepted",
    }).lean();

    // Combine and deduplicate
    const friendSet = new Set();
    const friends = [];

    acceptedAsTarget.forEach((inv) => {
      const key = inv.senderEmail.toLowerCase();
      if (!friendSet.has(key)) {
        friendSet.add(key);
        friends.push({
          _id: inv._id,
          email: inv.senderEmail,
          connectedAt: inv.updatedAt,
          type: "received",
        });
      }
    });

    acceptedAsSender.forEach((inv) => {
      const key = inv.targetEmail.toLowerCase();
      if (!friendSet.has(key)) {
        friendSet.add(key);
        friends.push({
          _id: inv._id,
          email: inv.targetEmail,
          connectedAt: inv.updatedAt,
          type: "sent",
        });
      }
    });

    res.json({ friends: friends.sort((a, b) => new Date(b.connectedAt) - new Date(a.connectedAt)) });
  } catch (err) {
    console.error("Get friends error", err);
    res.status(500).json({ error: "Failed to fetch friends" });
  }
});

// GET /api/invites/connections (get all accepted connections for current user)
router.get("/connections", async (req, res) => {
  const userEmail = getUserEmail(req);

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    // Get invites user sent that were accepted
    const sentAccepted = await Invitation.find({
      senderEmail: userEmail,
      status: "accepted",
    }).lean();

    // Get invites user received that they accepted
    const receivedAccepted = await Invitation.find({
      targetEmail: userEmail,
      status: "accepted",
    }).lean();

    res.json({
      sent: sentAccepted,
      received: receivedAccepted,
    });
  } catch (err) {
    console.error("Get connections error", err);
    res.status(500).json({ error: "Failed to fetch connections" });
  }
});

// PATCH /api/invites/:id (accept or decline) - recipient only
router.patch("/:id", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { action } = req.body;

  if (!userEmail) return res.status(400).json({ error: "user email required" });
  if (!["accept", "decline"].includes(action)) {
    return res.status(400).json({ error: "action must be accept or decline" });
  }

  try {
    const invite = await Invitation.findOne({ _id: req.params.id, targetEmail: userEmail });
    if (!invite) return res.status(404).json({ error: "Invite not found or email mismatch" });

    // Prevent duplicate actions on same invite
    if (action === "accept" && invite.status === "accepted") {
      return res.status(400).json({ 
        error: "You have already accepted this invite",
        inviteId: invite._id,
        status: invite.status 
      });
    }

    if (action === "decline" && invite.status === "declined") {
      return res.status(400).json({ 
        error: "You have already declined this invite",
        inviteId: invite._id,
        status: invite.status 
      });
    }

    // Allow changing from pending to accepted/declined
    if (invite.status !== "pending" && action === "accept") {
      return res.status(400).json({ 
        error: `Cannot accept: invite is already ${invite.status}`,
        inviteId: invite._id,
        status: invite.status 
      });
    }

    if (invite.status !== "pending" && action === "decline") {
      return res.status(400).json({ 
        error: `Cannot decline: invite is already ${invite.status}`,
        inviteId: invite._id,
        status: invite.status 
      });
    }

    // Prevent accepting multiple invites from the same sender
    // Only allow one accepted connection per sender
    if (action === "accept") {
      const existingAccepted = await Invitation.findOne({
        targetEmail: userEmail,
        senderEmail: invite.senderEmail,
        status: "accepted",
        _id: { $ne: req.params.id } // exclude current invite
      });

      if (existingAccepted) {
        return res.status(400).json({
          error: `You have already accepted a connection request from ${invite.senderEmail}. Only one active connection per user is allowed.`,
          inviteId: invite._id,
          existingAcceptedId: existingAccepted._id
        });
      }
    }

    invite.status = action === "accept" ? "accepted" : "declined";
    await invite.save();

    // Emit WebSocket event to sender
    const io = req.app.get("io");
    if (io) {
      notifySender(io, invite.senderEmail, "invite:statusChanged", {
        _id: invite._id,
        targetEmail: invite.targetEmail,
        status: invite.status,
        updatedAt: invite.updatedAt,
      });
    }

    res.json({ success: true, invite });
  } catch (err) {
    console.error("Invite update error", err);
    res.status(500).json({ error: "Failed to update invite" });
  }
});

// DELETE /api/invites/:id (remove/revoke an invite or connection)
router.delete("/:id", async (req, res) => {
  const userEmail = getUserEmail(req);

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    const invite = await Invitation.findById(req.params.id);
    if (!invite) return res.status(404).json({ error: "Invite not found" });

    // Only sender or recipient can delete
    const isSender = invite.senderEmail === userEmail;
    const isRecipient = invite.targetEmail === userEmail;

    if (!isSender && !isRecipient) {
      return res.status(403).json({ error: "Unauthorized to delete this invite" });
    }

    await Invitation.deleteOne({ _id: invite._id });

    // Emit WebSocket event to notify the other party (for accepted connections)
    if (invite.status === "accepted") {
      const io = req.app.get("io");
      if (io) {
        const otherEmail = isSender ? invite.targetEmail : invite.senderEmail;
        notifyUser(io, otherEmail, "connection:removed", {
          inviteId: invite._id,
          removedBy: userEmail,
        });
      }
    }

    res.json({ success: true, message: "Invite removed" });
  } catch (err) {
    console.error("Delete invite error", err);
    res.status(500).json({ error: "Failed to remove invite" });
  }
});

export default router;
