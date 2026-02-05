import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import sharp from "sharp";
import { ObjectId } from "mongodb";
import { Image } from "../models/Image.js";
import { Person } from "../models/Person.js";
import { FaceIdentity } from "../models/FaceIdentity.js";
import {
  getUserId,
  ensureDir,
  clampBBox,
  expandBBox,
  ML_SERVICE_URL,
} from "../utils/routeHelpers.js";
import { downloadFromGridFS, deleteFromGridFS } from "../utils/gridfs.js";

const router = express.Router();

// GET /api/images/file/:fileId - Download file from GridFS
router.get("/file/:fileId", async (req, res) => {
  const { fileId } = req.params;

  try {
    const objId = ObjectId.createFromHexString(fileId);
    const buffer = await downloadFromGridFS(objId);
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (err) {
    console.error("File download error", err);
    res.status(404).json({ error: "File not found" });
  }
});

// GET /api/images
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const protocol = req.protocol;
  const host = req.get("host");

  try {
    const images = await Image.find({ userId }).sort({ createdAt: -1 }).lean();
    
    // Transform image URLs to full URLs for frontend consumption
    const enrichedImages = images.map(img => ({
      ...img,
      url: img.url ? (img.url.startsWith('http') ? img.url : `${protocol}://${host}${img.url}`) : null,
      faces: (img.faces || []).map(face => ({
        ...face,
        faceUrl: face.faceUrl ? (face.faceUrl.startsWith('http') ? face.faceUrl : `${protocol}://${host}${face.faceUrl}`) : null,
      })),
    }));
    
    res.json(enrichedImages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// DELETE /api/images/:id
router.delete("/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const image = await Image.findOne({ _id: req.params.id, userId });
    if (!image) return res.status(404).json({ error: "Image not found" });

    // Delete from GridFS if fileId exists
    if (image.fileId) {
      try {
        await deleteFromGridFS(image.fileId);
      } catch (e) {
        console.error("Failed to delete image from GridFS:", e);
      }
    }

    // Delete legacy localPath files from disk if they exist
    if (image.localPath) {
      try {
        if (fs.existsSync(image.localPath)) fs.unlinkSync(image.localPath);
      } catch (e) {
        console.error("Failed to delete image file:", e);
      }
    }

    // Delete associated face crop files unless they're used as a person's thumbnail
    for (const face of image.faces || []) {
      if (face.faceUrl) {
        const isThumbInUse = await Person.exists({ thumbnail: face.faceUrl });
        if (isThumbInUse) {
          continue; // keep the crop so thumbnail remains valid
        }
        
        // If faceUrl is a GridFS path
        if (face.faceUrl.includes('/api/images/file/')) {
          const fileId = face.faceUrl.split('/').pop();
          try {
            await deleteFromGridFS(ObjectId.createFromHexString(fileId));
          } catch (e) {
            console.error("Failed to delete face from GridFS:", e);
          }
        } else {
          // Legacy disk-based path
          const faceFilename = face.faceUrl.split('/').pop();
          const facePath = path.join("uploads", "faces", faceFilename);
          try {
            if (fs.existsSync(facePath)) fs.unlinkSync(facePath);
          } catch (e) {
            console.error("Failed to delete face file:", e);
          }
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

// GET /api/images/summary (home stats)
router.get("/summary", async (req, res) => {
  const userId = getUserId(req);
  const protocol = req.protocol;
  const host = req.get("host");

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
      url: img.url ? (img.url.startsWith('http') ? img.url : `${protocol}://${host}${img.url}`) : null,
      createdAt: img.createdAt,
      faces: Array.isArray(img.persons) ? img.persons.length : 0,
    }));

    res.json({ imagesCount, personsCount, recentUploads });
  } catch (err) {
    console.error("Summary fetch error", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

// POST /api/images/reprocess-missing
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

export default router;
