import express from "express";
import{
    createFolder,getAllFolders,
    deleteFolder,deleteSubfolder,
    lockFolder,
    unlockFolder,toggleImportant,getAllFoldersWithContents,
    getFolderById, renameFolder, getLockedFolders, getImportantFolders,
    moveFolder, shareFolders
}from "../controllers/folderController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.post("/create", auth, createFolder);

router.get("/", auth, getAllFolders);

// ✅ New route to fetch all folders with subfolders and files (must come before /:id)
router.get("/contents", auth, getAllFoldersWithContents);

router.get("/locked", auth, getLockedFolders);
router.get("/important", auth, getImportantFolders);

router.get("/:id", auth, getFolderById);

router.delete("/:id", auth, deleteFolder);

router.put("/:id/rename", auth, renameFolder);

router.put("/:id/move", auth, moveFolder);

// routes/folderRoutes.js
router.delete("/subfolder/:id", auth, deleteSubfolder);


router.post("/lock/:id", auth, lockFolder);

router.post("/unlock/:id", auth, unlockFolder);

router.post("/important/:id", auth, toggleImportant);

router.post("/share", auth, shareFolders);

export default router;