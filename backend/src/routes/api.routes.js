import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import axios from "axios";
import sharp from "sharp";
import { Image } from "../models/Image.js";
import { Person } from "../models/Person.js";
import { Group } from "../models/Group.js";
import { FaceIdentity } from "../models/FaceIdentity.js";
import { Invitation } from "../models/Invitation.js";
import { notifyUser, notifySender } from "../socket.js";

const router = express.Router();
const ML_SERVICE_URL = "http://127.0.0.1:8000";

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getUserId = (req) => {
  return (
    req.headers["x-user-id"] ||
    req.headers["x-clerk-user-id"] ||
    "default_user"
  );
};

const getUserEmail = (req) => {
  const raw = req.headers["x-user-email"] || req.headers["x-clerk-email"];
  if (!raw || typeof raw !== "string") return null;
  return raw.trim().toLowerCase();
};

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// --- Helper: Get absolute URL for local file ---
const getFileUrl = (req, filename) => {
  const protocol = req.protocol;
  const host = req.get("host"); // e.g. localhost:4000
  return `${protocol}://${host}/uploads/${filename}`;
};

const clampBBox = (bbox = [], width = 0, height = 0) => {
  const [x1, y1, x2, y2] = bbox.map((v) => Math.round(v || 0));
  const left = Math.max(0, Math.min(x1, width));
  const top = Math.max(0, Math.min(y1, height));
  const right = Math.max(left + 1, Math.min(x2, width));
  const bottom = Math.max(top + 1, Math.min(y2, height));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

// Expand bbox to include context around the face (zoomed out a bit)
const expandBBox = (bbox = [], width = 0, height = 0, marginRatio = 0.25) => {
  if (!Array.isArray(bbox) || bbox.length !== 4) return bbox;
  const [x1, y1, x2, y2] = bbox;
  const w = x2 - x1;
  const h = y2 - y1;
  const dx = w * marginRatio;
  const dy = h * marginRatio;
  return [
    x1 - dx,
    y1 - dy,
    x2 + dx,
    y2 + dy,
  ];
};

// GET /api/data/images
router.get("/images", async (req, res) => {
  const userId = getUserId(req);
  try {
    const images = await Image.find({ userId }).sort({ createdAt: -1 }).lean();
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// DELETE /api/data/images/:id
router.delete("/images/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const image = await Image.findOne({ _id: req.params.id, userId });
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Delete image file and face crops from disk
    try {
      if (fs.existsSync(image.localPath)) fs.unlinkSync(image.localPath);
    } catch (e) {
      console.error("Failed to delete image file:", e);
    }

    // Delete associated face crop files unless they're used as a person's thumbnail
    for (const face of image.faces || []) {
      if (face.faceUrl) {
        const isThumbInUse = await Person.exists({ thumbnail: face.faceUrl });
        if (isThumbInUse) {
          continue; // keep the crop so thumbnail remains valid
        }
        const faceFilename = face.faceUrl.split('/').pop();
        const facePath = path.join("uploads", "faces", faceFilename);
        try {
          if (fs.existsSync(facePath)) fs.unlinkSync(facePath);
        } catch (e) {
          console.error("Failed to delete face file:", e);
        }
      }
    }

    // Update person counts (keep persons even if count=0, to preserve saved names)
    for (const personId of image.persons || []) {
      const person = await Person.findById(personId);
      if (person) {
        person.count = Math.max(0, person.count - 1);
        await person.save();
      }
    }

    // Delete image record
    await Image.deleteOne({ _id: image._id });

    res.json({ success: true, message: "Image deleted" });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

// GET /api/data/summary (home stats)
router.get("/summary", async (req, res) => {
  const userId = getUserId(req);
  try {
    const [imagesCount, personsCount, recent] = await Promise.all([
      Image.countDocuments({ userId }),
      Person.countDocuments({ userId, count: { $gt: 0 } }),
      Image.find({ userId })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const recentUploads = recent.map((img) => ({
      _id: img._id,
      url: img.url,
      createdAt: img.createdAt,
      faces: Array.isArray(img.persons) ? img.persons.length : 0,
    }));

    res.json({ imagesCount, personsCount, recentUploads });
  } catch (err) {
    console.error("Summary fetch error", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// POST /api/data/reprocess-missing
// Re-run ML on images missing face crops or dimensions for this user
router.post("/reprocess-missing", async (req, res) => {
  const userId = getUserId(req);
  try {
    const targets = await Image.find({
      userId,
      $or: [
        { faces: { $exists: true, $size: 0 } },
        { faces: { $exists: false } },
        { width: { $exists: false } },
        { height: { $exists: false } },
      ],
    }).lean();

    let updated = 0;

    for (const img of targets) {
      try {
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/process-image`, {
          user_id: userId,
          image_url: img.url,
        });
        const mlResults = mlResponse.data.results || [];

        if (!mlResults.length) continue;

        const imageBuffer = await fs.promises.readFile(img.localPath);
        const meta = await sharp(imageBuffer).metadata();
        ensureDir(path.join("uploads", "faces"));

        const faceRecords = [];
        const personIds = new Set((img.persons || []).map((p) => p.toString()));

        for (const face of mlResults) {
          const bbox = face.bbox || [];
          let faceUrl = null;

          if (meta?.width && meta?.height && bbox.length === 4) {
            const expanded = expandBBox(bbox, meta.width, meta.height, 0.15);
            const { left, top, width, height } = clampBBox(expanded, meta.width, meta.height);
            if (width > 1 && height > 1) {
              const faceFilename = `${path.parse(img.localPath).name}-face-${face.face_index}.jpg`;
              const facePath = path.join("uploads", "faces", faceFilename);
              await sharp(imageBuffer)
                .extract({ left, top, width, height })
                .resize(256, 256, { fit: "cover" })
                .toFile(facePath);

              faceUrl = `${req.protocol}://${req.get("host")}/uploads/faces/${faceFilename}`;
            }
          }

          let person = await Person.findOne({ userId, mlId: face.person_id });
          if (!person) {
            // New person - use face crop as thumbnail
            person = new Person({
              userId,
              mlId: face.person_id,
              name: face.person_id,
              thumbnail: faceUrl || img.url,
              count: 0,
            });
          }
          // If person exists, keep their existing thumbnail (first face seen)
          // But if they had no photos (count=0) or no thumbnail, refresh it from this face crop
          if (person.count === 0 || !person.thumbnail) {
            if (faceUrl) {
              person.thumbnail = faceUrl;
            }
          }

          // Increment count only if this image was not previously linked to this person
          if (!personIds.has(person._id.toString())) {
            person.count += 1;

                    // Store/update FaceIdentity mapping mlId -> personId & name
                    try {
                      await FaceIdentity.findOneAndUpdate(
                        { userId, mlId: face.person_id },
                        {
                          personId: person._id,
                          name: person.name,
                        },
                        { upsert: true, new: true }
                      );
                    } catch (faceIdErr) {
                      console.error(`Failed to store FaceIdentity for ${face.person_id}:`, faceIdErr.message);
                    }
          }
          await person.save();

          personIds.add(person._id.toString());

          faceRecords.push({
            person: person._id,
            bbox: bbox.map((v) => Math.round(v || 0)),
            faceUrl: faceUrl || person.thumbnail || img.url,
          });
        }

        await Image.updateOne(
          { _id: img._id },
          {
            $set: {
              faces: faceRecords,
              persons: Array.from(personIds),
              width: meta?.width,
              height: meta?.height,
            },
          }
        );

        updated += 1;
      } catch (innerErr) {
        console.error(`Reprocess failed for image ${img._id}:`, innerErr.message);
      }
    }

    res.json({ success: true, updated, totalCandidates: targets.length });
  } catch (err) {
    console.error("Reprocess error", err);
    res.status(500).json({ error: "Failed to reprocess images" });
  }
});

// GET /api/data/persons
router.get("/persons", async (req, res) => {
  const userId = getUserId(req);
  try {
    // Hide empty persons (count <= 0) from list, but keep them in DB to preserve names
    const persons = await Person.find({ userId, count: { $gt: 0 } })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(persons);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch persons" });
  }
});

// GET /api/data/persons/:id
router.get("/persons/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const person = await Person.findOne({ _id: req.params.id, userId });
    if (!person) return res.status(404).json({ error: "Person not found" });

    const images = await Image.find({ userId, persons: person._id })
      .sort({ createdAt: -1 })
      .lean();

    const imagesForPerson = images.map((img) => {
      const face = (img.faces || []).find(
        (f) => f.person?.toString() === person._id.toString()
      );
      return {
        _id: img._id,
        url: img.url,
        width: img.width,
        height: img.height,
        bbox: face?.bbox,
        faceUrl: face?.faceUrl,
      };
    });

    res.json({ person: person.toObject(), images: imagesForPerson });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch person details" });
  }
});

// PATCH /api/data/persons/:id (update person name)
router.patch("/persons/:id", async (req, res) => {
  const userId = getUserId(req);
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const person = await Person.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name: name.trim() },
      { new: true }
    );

    if (!person) return res.status(404).json({ error: "Person not found" });

    res.json({ success: true, person });
  } catch (err) {
    res.status(500).json({ error: "Failed to update person" });
  }
});

// POST /api/data/upload
router.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  try {
    const fileUrl = getFileUrl(req, req.file.filename);
    const userId = getUserId(req);

    // 1. Call ML Service
    let mlResults = [];
    try {
      const mlResponse = await axios.post(`${ML_SERVICE_URL}/process-image`, {
        user_id: userId,
        image_url: fileUrl,
      });
      mlResults = mlResponse.data.results || [];
    } catch (mlErr) {
      console.error("ML Service Error:", mlErr.message);
      // Proceed even if ML fails, just save the image without persons
    }

    const imageBuffer = await fs.promises.readFile(req.file.path);
    const meta = await sharp(imageBuffer).metadata();
    ensureDir(path.join("uploads", "faces"));

    // 2. Process Detected Persons
    const personIds = [];
    const faceRecords = [];
    const host = req.get("host");
    const protocol = req.protocol;

    for (const face of mlResults) {
       // face: { face_index, person_id, confidence, bbox, face_image }
       const bbox = face.bbox || [];
       let faceUrl = null;

      // Try to extract face from local image first
      if (meta?.width && meta?.height && bbox.length === 4) {
        const expanded = expandBBox(bbox, meta.width, meta.height, 0.15);
        const { left, top, width, height } = clampBBox(expanded, meta.width, meta.height);
         if (width > 1 && height > 1) {
           try {
             const faceFilename = `${path.parse(req.file.filename).name}-face-${face.face_index}.jpg`;
             const facePath = path.join("uploads", "faces", faceFilename);
             await sharp(imageBuffer)
               .extract({ left, top, width, height })
               .resize(256, 256, { fit: "cover" })
               .jpeg({ quality: 90 })
               .toFile(facePath);

             faceUrl = `${protocol}://${host}/uploads/faces/${faceFilename}`;
             console.log(`✓ Created face crop: ${faceFilename}`);
           } catch (extractErr) {
             console.error(`Failed to extract face ${face.face_index}:`, extractErr.message);
           }
         } else {
           console.log(`Skipped face ${face.face_index}: bbox too small (${width}x${height})`);
         }
       } else {
         console.log(`Skipped face ${face.face_index}: invalid bbox or metadata`);
       }

       // Fallback: use base64 face image from ML service
       if (!faceUrl && face.face_image) {
         try {
           const faceFilename = `${path.parse(req.file.filename).name}-face-${face.face_index}-ml.jpg`;
           const facePath = path.join("uploads", "faces", faceFilename);
           const faceBuffer = Buffer.from(face.face_image, 'base64');
           await fs.promises.writeFile(facePath, faceBuffer);
           faceUrl = `${protocol}://${host}/uploads/faces/${faceFilename}`;
           console.log(`✓ Used ML face crop: ${faceFilename}`);
         } catch (mlErr) {
           console.error(`Failed to save ML face ${face.face_index}:`, mlErr.message);
         }
       }

       // Find or Create Person in Mongo
       let person = await Person.findOne({ userId, mlId: face.person_id });

       if (!person) {
         // Try to reuse an existing person with count=0 (previously saved name, all photos deleted)
         person = await Person.findOne({ userId, count: 0 });
         
         if (!person) {
           // No existing person, create new one - MUST use face crop as thumbnail
           if (!faceUrl) {
             console.warn(`⚠️ No face crop for new person ${face.person_id}, using full image`);
           }
           person = new Person({
             userId,
             mlId: face.person_id,
             name: face.person_id,
             thumbnail: faceUrl || fileUrl,
             count: 0,
           });
           console.log(`✓ Created person ${face.person_id} with thumbnail: ${faceUrl ? 'face crop' : 'full image'}`);
         } else {
           // Reusing person with count=0, update mlId to current one
           person.mlId = face.person_id;
           console.log(`✓ Reusing person ${person.name} (count was 0)`);
         }
       }
       // If person exists, keep their existing thumbnail (first face seen)
       // But if they had no photos (count=0) or no thumbnail, refresh it from this face crop
       if (person.count === 0 || !person.thumbnail) {
         if (faceUrl) {
           person.thumbnail = faceUrl;
         }
       }

       person.count += 1;
       await person.save();
       personIds.push(person._id);

       // Store/update FaceIdentity mapping mlId -> personId & name
       try {
         await FaceIdentity.findOneAndUpdate(
           { userId, mlId: face.person_id },
           {
             personId: person._id,
             name: person.name,
           },
           { upsert: true, new: true }
         );
       } catch (faceIdErr) {
         console.error(`Failed to store FaceIdentity for ${face.person_id}:`, faceIdErr.message);
       }

       faceRecords.push({
         person: person._id,
         bbox: bbox.map((v) => Math.round(v || 0)),
         faceUrl: faceUrl || person.thumbnail || fileUrl,
       });
    }

    // 3. Save Image to Mongo
    const newImage = new Image({
      userId,
      url: fileUrl,
      localPath: req.file.path,
      width: meta?.width,
      height: meta?.height,
      persons: personIds,
      faces: faceRecords,
    });
    await newImage.save();

    res.json({
      success: true,
      message: "File uploaded and processed",
      data: newImage,
      ml_results: mlResults
    });

  } catch (error) {
    console.error("Upload Logic Error:", error);
    res.status(500).json({ success: false, message: "Server Error during upload" });
  }
});

// --- GROUP ENDPOINTS ---

// GET /api/data/groups (list all groups for user)
router.get("/groups", async (req, res) => {
  const userId = getUserId(req);
  try {
    const groups = await Group.find({ userId }).sort({ updatedAt: -1 }).lean();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// POST /api/data/groups (create new group)
router.post("/groups", async (req, res) => {
  const userId = getUserId(req);
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Group name is required" });
  }

  try {
    const group = new Group({
      userId,
      name: name.trim(),
      description: description || "",
      imageIds: [],
    });
    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: "Failed to create group" });
  }
});

// GET /api/data/groups/:id (get group with images)
router.get("/groups/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const group = await Group.findOne({ _id: req.params.id, userId }).populate("imageIds").lean();
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

// PATCH /api/data/groups/:id (update group)
router.patch("/groups/:id", async (req, res) => {
  const userId = getUserId(req);
  const { name, description, color } = req.body;

  try {
    const group = await Group.findOne({ _id: req.params.id, userId });
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (name !== undefined) group.name = name.trim();
    if (description !== undefined) group.description = description;
    if (color !== undefined) group.color = color;
    
    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: "Failed to update group" });
  }
});

// DELETE /api/data/groups/:id (delete group)
router.delete("/groups/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const group = await Group.findOne({ _id: req.params.id, userId });
    if (!group) return res.status(404).json({ error: "Group not found" });

    await Group.deleteOne({ _id: req.params.id });
    res.json({ success: true, message: "Group deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete group" });
  }
});

// POST /api/data/groups/:id/add-image (add image to group)
router.post("/groups/:id/add-image", async (req, res) => {
  const userId = getUserId(req);
  const { imageId } = req.body;

  if (!imageId) {
    return res.status(400).json({ error: "imageId is required" });
  }

  try {
    const group = await Group.findOne({ _id: req.params.id, userId });
    if (!group) return res.status(404).json({ error: "Group not found" });

    const image = await Image.findOne({ _id: imageId, userId });
    if (!image) return res.status(404).json({ error: "Image not found" });

    if (!group.imageIds.includes(imageId)) {
      group.imageIds.push(imageId);
      if (!group.coverImage) {
        group.coverImage = image.url;
      }
      await group.save();
    }

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: "Failed to add image to group" });
  }
});

// POST /api/data/groups/:id/remove-image (remove image from group)
router.post("/groups/:id/remove-image", async (req, res) => {
  const userId = getUserId(req);
  const { imageId } = req.body;

  if (!imageId) {
    return res.status(400).json({ error: "imageId is required" });
  }

  try {
    const group = await Group.findOne({ _id: req.params.id, userId });
    if (!group) return res.status(404).json({ error: "Group not found" });

    group.imageIds = group.imageIds.filter(id => id.toString() !== imageId);
    
    if (group.imageIds.length === 0) {
      group.coverImage = null;
    } else if (group.coverImage === imageId) {
      const firstImage = await Image.findById(group.imageIds[0]);
      group.coverImage = firstImage?.url || null;
    }

    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove image from group" });
  }
});

// ----- Invites -----
// ----- Invites -----
router.post("/invites", async (req, res) => {
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


// GET /api/data/invites
// inbox=true -> invites addressed to current email
// sent=true -> invites created by current user
router.get("/invites", async (req, res) => {
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

// GET /api/data/friends (get all accepted connections as 'friends' for current user)
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

// PATCH /api/data/invites/:id (accept or decline) - recipient only
router.patch("/invites/:id", async (req, res) => {
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

// GET /api/data/connections (get all accepted connections for current user)
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

// DELETE /api/data/invites/:id (remove/revoke an invite or connection)
router.delete("/invites/:id", async (req, res) => {
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

// ----- Messages -----
router.post("/messages", async (req, res) => {
  const userId = getUserId(req);
  const userEmail = getUserEmail(req);
  const { to, text } = req.body;

  if (!userEmail) return res.status(400).json({ error: "user email required" });
  if (!to || !text) {
    return res.status(400).json({ error: "to and text are required" });
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

    // Create message in database (if using Message model)
    // For now, we'll just emit via WebSocket
    const message = {
      _id: new Date().getTime().toString(),
      from: userEmail,
      to: to,
      text: text.trim(),
      timestamp: new Date().toISOString(),
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

// GET /api/data/messages - Get chat history with a user
router.get("/messages", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { conversationWith } = req.query;

  if (!userEmail) return res.status(400).json({ error: "user email required" });
  if (!conversationWith) {
    return res.status(400).json({ error: "conversationWith is required" });
  }

  try {
    // For now, return empty messages (real implementation would query database)
    // This is a placeholder for future database integration
    res.json({ messages: [] });
  } catch (err) {
    console.error("Message fetch error", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// DELETE /api/data/messages/:id - Delete a message
router.delete("/messages/:id", async (req, res) => {
  const userEmail = getUserEmail(req);
  const { id } = req.params;

  if (!userEmail) return res.status(400).json({ error: "user email required" });

  try {
    // For now, just return success (real implementation would delete from database)
    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("Message delete error", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

export default router;
