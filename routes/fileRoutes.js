import express from "express";
import { 
    createFile, 
    uploadFile,
    getFilesInFolder,
    getRootFiles,
    getSingleFile, 
    deleteFile,
    serveFile,
    moveFile,
    getLockedFiles,
    unlockFile,
    assignCategoryToFile,
    getFilesByCategory,
    getRecentFiles,
} from "../controllers/fileController.js";
import { auth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Upload file (with actual file)
router.post("/upload", auth, upload.single("file"), uploadFile);

// Create file inside folder (legacy)
router.post("/create", auth, createFile);

// Get root files (files with no parent folder)
router.get("/root", auth, getRootFiles);

// Get most recently updated files (Recents across all folders/categories)
router.get("/recent", auth, getRecentFiles);

// Get files by category name (or root files when category is missing)
// Usage: GET /api/files?category=Documents
router.get("/", auth, getFilesByCategory);

// Get all locked files for the current user
router.get("/locked", auth, getLockedFiles);

// Get all files in a folder (or root if folderId is "root")
router.get("/folder/:folderId", auth, getFilesInFolder);

// Serve/download file
router.get("/:id/download", auth, serveFile);

// Get single file info
router.get("/:id", auth, getSingleFile);

// Delete file
router.delete("/:id", auth, deleteFile);

// Move file
router.put("/:id/move", auth, moveFile);

// Unlock file
router.post("/unlock/:id", auth, unlockFile);

// Assign category to file
router.post("/assign-category", auth, assignCategoryToFile);

export default router;
