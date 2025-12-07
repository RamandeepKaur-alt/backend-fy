import express from "express";
import { analyzeFile, getAnalysis, analyzeUploadedFile } from "../controllers/magicLensController.js";
import { auth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Analyze uploaded file directly (temporary, doesn't save to database)
router.post("/analyze-upload", auth, upload.single("file"), analyzeUploadedFile);

// Analyze file with Magic Lens (from database)
router.post("/analyze/:id", auth, analyzeFile);

// Get saved analysis for a file
router.get("/analysis/:id", auth, getAnalysis);

export default router;


