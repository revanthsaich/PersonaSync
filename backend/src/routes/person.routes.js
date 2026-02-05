import express from "express";
import { Image } from "../models/Image.js";
import { Person } from "../models/Person.js";
import { getUserId } from "../utils/routeHelpers.js";

const router = express.Router();

// GET /api/persons
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const protocol = req.protocol;
  const host = req.get("host");

  try {
    // Hide empty persons (count <= 0) from list, but keep them in DB to preserve names
    const persons = await Person.find({ userId, count: { $gt: 0 } })
      .sort({ updatedAt: -1 })
      .lean();
    
    // Enrich with full URLs
    const enrichedPersons = persons.map(p => ({
      ...p,
      thumbnail: p.thumbnail ? (p.thumbnail.startsWith('http') ? p.thumbnail : `${protocol}://${host}${p.thumbnail}`) : null,
    }));
    
    res.json(enrichedPersons);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch persons" });
  }
});

// GET /api/persons/:id
router.get("/:id", async (req, res) => {
  const userId = getUserId(req);
  const protocol = req.protocol;
  const host = req.get("host");

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
        url: img.url ? (img.url.startsWith('http') ? img.url : `${protocol}://${host}${img.url}`) : null,
        width: img.width,
        height: img.height,
        bbox: face?.bbox,
        faceUrl: face?.faceUrl ? (face.faceUrl.startsWith('http') ? face.faceUrl : `${protocol}://${host}${face.faceUrl}`) : null,
      };
    });

    const personObj = person.toObject();
    personObj.thumbnail = personObj.thumbnail ? (personObj.thumbnail.startsWith('http') ? personObj.thumbnail : `${protocol}://${host}${personObj.thumbnail}`) : null;

    res.json({ person: personObj, images: imagesForPerson });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch person details" });
  }
});

// PATCH /api/persons/:id (update person name)
router.patch("/:id", async (req, res) => {
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

export default router;
