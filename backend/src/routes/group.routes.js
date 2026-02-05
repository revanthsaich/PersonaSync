import express from "express";
import { Image } from "../models/Image.js";
import { Group } from "../models/Group.js";
import { getUserId } from "../utils/routeHelpers.js";

const router = express.Router();

// GET /api/groups (list all groups for user)
router.get("/", async (req, res) => {
  const userId = getUserId(req);
  try {
    const groups = await Group.find({ userId }).sort({ updatedAt: -1 }).lean();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// POST /api/groups (create new group)
router.post("/", async (req, res) => {
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

// GET /api/groups/:id (get group with images)
router.get("/:id", async (req, res) => {
  const userId = getUserId(req);
  try {
    const group = await Group.findOne({ _id: req.params.id, userId }).populate("imageIds").lean();
    if (!group) return res.status(404).json({ error: "Group not found" });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch group" });
  }
});

// PATCH /api/groups/:id (update group)
router.patch("/:id", async (req, res) => {
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

// DELETE /api/groups/:id (delete group)
router.delete("/:id", async (req, res) => {
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

// POST /api/groups/:id/add-image (add image to group)
router.post("/:id/add-image", async (req, res) => {
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

// POST /api/groups/:id/remove-image (remove image from group)
router.post("/:id/remove-image", async (req, res) => {
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

export default router;
