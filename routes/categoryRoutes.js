import express from "express";
import { auth } from "../middleware/auth.js";
import { getOrCreateCategoryByName, listCategoriesForUser } from "../controllers/categoryController.js";

const router = express.Router();

// List all categories available to the user (user-specific + global)
router.get("/", auth, listCategoriesForUser);

// Resolve a specific category by name for the user, auto-create if missing
router.get("/:name", auth, getOrCreateCategoryByName);

export default router;
