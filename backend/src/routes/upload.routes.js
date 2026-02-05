import express from "express";
import multer from "multer";
import axios from "axios";
import sharp from "sharp";
import { Image } from "../models/Image.js";
import { Person } from "../models/Person.js";
import { FaceIdentity } from "../models/FaceIdentity.js";
import {
  getUserId,
  getFileUrl,
  clampBBox,
  expandBBox,
  ML_SERVICE_URL,
} from "../utils/routeHelpers.js";
import { uploadToGridFS } from "../utils/gridfs.js";

const router = express.Router();

// --- Multer Config - Store in memory ---
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/upload
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  try {
    const userId = getUserId(req);
    const imageBuffer = req.file.buffer;

    // Upload original image to GridFS
    let fileId;
    try {
      fileId = await uploadToGridFS(req.file.originalname, imageBuffer, {
        userId,
        type: "original_upload",
        mimeType: req.file.mimetype,
      });
    } catch (gridErr) {
      console.error("GridFS upload error", gridErr);
      return res.status(500).json({ success: false, message: "Failed to store image" });
    }

    // Create a full URL for the ML service to access
    const protocol = req.protocol;
    const host = req.get("host");
    const fileUrl = `${protocol}://${host}/api/images/file/${fileId}`;

    // 1. Call ML Service with full URL
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

    const meta = await sharp(imageBuffer).metadata();

    // 2. Process Detected Persons
    const personIds = [];
    const faceRecords = [];

    for (const face of mlResults) {
      // face: { face_index, person_id, confidence, bbox, face_image }
      const bbox = face.bbox || [];
      let faceUrl = null;

      // Try to extract face from image
      if (meta?.width && meta?.height && bbox.length === 4) {
        const expanded = expandBBox(bbox, meta.width, meta.height, 0.15);
        const { left, top, width, height } = clampBBox(expanded, meta.width, meta.height);
        if (width > 1 && height > 1) {
          try {
            const faceBuffer = await sharp(imageBuffer)
              .extract({ left, top, width, height })
              .resize(256, 256, { fit: "cover" })
              .jpeg({ quality: 90 })
              .toBuffer();

            const faceName = `face-${face.face_index}-${Date.now()}.jpg`;
            const faceFileId = await uploadToGridFS(faceName, faceBuffer, {
              userId,
              personId: face.person_id,
              faceIndex: face.face_index,
              type: "face_crop",
            });
            
            faceUrl = `${protocol}://${host}/api/images/file/${faceFileId}`;
            console.log(`✓ Created face crop: ${faceName}`);
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
          const faceBuffer = Buffer.from(face.face_image, 'base64');
          const faceName = `face-${face.face_index}-ml-${Date.now()}.jpg`;
          const faceFileId = await uploadToGridFS(faceName, faceBuffer, {
            userId,
            personId: face.person_id,
            faceIndex: face.face_index,
            type: "face_crop_ml",
          });
          
          faceUrl = `${protocol}://${host}/api/images/file/${faceFileId}`;
          console.log(`✓ Used ML face crop: ${faceName}`);
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
      fileId: fileId,
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

export default router;
