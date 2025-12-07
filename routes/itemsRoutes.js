import express from "express";
import {
    moveItem,
    duplicateItem,
    deleteItem,
    shareItem
} from "../controllers/itemsController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

/**
 * Unified Items Routes
 * These routes handle both files and folders
 */

// Move item (file or folder) to a different location
router.put("/:id/move", auth, moveItem);

// Duplicate item (file or folder) in target location
router.post("/:id/duplicate", auth, duplicateItem);

// Delete item (file or folder)
// Type must be provided as query parameter: ?type=file or ?type=folder
router.delete("/:id", auth, deleteItem);

// Get shareable link for item (file or folder)
// Type must be provided as query parameter: ?type=file or ?type=folder
router.get("/:id/share", auth, shareItem);

export default router;
























