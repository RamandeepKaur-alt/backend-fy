import { PrismaClient } from "@prisma/client";
import path from "path";
import fs from "fs";
const prisma = new PrismaClient();

// Upload file inside folder (or root if folderId is null or "root")
export const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const { folderId, locked } = req.body;
        const userId = req.user.id;

        // If folderId is "root" or empty, upload to root (folderId = null)
        let finalFolderId = null;
        if (folderId && folderId !== "root" && folderId !== "") {
            finalFolderId = Number(folderId);
            
            // Check folder exists and user owns it
            const folder = await prisma.folder.findUnique({ where: { id: finalFolderId } });
            if (!folder) {
                return res.status(404).json({ error: "Folder not found" });
            }

            if (folder.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }
        }

        // Create file record
        const file = await prisma.file.create({
            data: {
                name: req.file.originalname,
                url: `/uploads/${req.file.filename}`,
                size: req.file.size,
                mimetype: req.file.mimetype,
                folderId: finalFolderId,
                userId,
                isLocked: locked === "true",
            }
        });

        console.log(`File uploaded: ID=${file.id}, Name=${file.name}, UserID=${file.userId}`);
        res.status(201).json({ message: "File uploaded successfully", file });

    } catch (error) {
        console.error("File upload error:", error);
        res.status(500).json({ error: error.message });
    }
};

// Unlock a locked file (clear isLocked flag)
export const unlockFile = async (req, res) => {
    try {
        const fileId = Number(req.params.id);
        const userId = req.user.id;

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) return res.status(404).json({ error: "File not found" });

        if (file.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        if (!file.isLocked) {
            return res.status(400).json({ error: "File is not locked" });
        }

        const updated = await prisma.file.update({
            where: { id: fileId },
            data: { isLocked: false },
        });

        res.json({ message: "File unlocked", file: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Create a file inside folder (legacy - for compatibility)
export const createFile = async (req, res) => {
    try {
        const { name, folderId } = req.body;
        const userId = req.user.id;

        if (!name || !folderId) {
            return res.status(400).json({ error: "Name and folderId are required" });
        }

        const folder = await prisma.folder.findUnique({ where: { id: Number(folderId) } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        const file = await prisma.file.create({
            data: {
                name,
                folderId: Number(folderId),
                userId,
                url: "placeholder.txt",
                size: 0,
                mimetype: "text/plain"
            }
        });

        res.json({ message: "File created", file });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Get ALL files inside a folder (or root files if folderId is null)
export const getFilesInFolder = async (req, res) => {
    try {
        const folderIdParam = req.params.folderId;
        const userId = req.user.id;

        // If folderId is "root" or not provided, get root files (folderId = null)
        const folderId = folderIdParam === "root" || !folderIdParam ? null : Number(folderIdParam);

        const files = await prisma.file.findMany({
            where: {
                folderId: folderId,
                userId: userId,
            },
            orderBy: { createdAt: "desc" }
        });

        res.json({ files });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all locked files for the authenticated user
export const getLockedFiles = async (req, res) => {
    try {
        const userId = req.user.id;

        const files = await prisma.file.findMany({
            where: {
                userId,
                isLocked: true,
            },
            orderBy: { createdAt: "desc" },
        });

        res.json({ files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get root files (files with no parent folder)
export const getRootFiles = async (req, res) => {
    try {
        const userId = req.user.id;
        
        if (!userId) {
            return res.status(401).json({ error: "User ID not found in token" });
        }

        const files = await prisma.file.findMany({
            where: {
                folderId: null,
                userId: userId,
            },
            orderBy: { createdAt: "desc" }
        });

        console.log(`Fetched ${files.length} root files for user ${userId}`);
        res.json({ files });

    } catch (error) {
        console.error("Error fetching root files:", error);
        res.status(500).json({ error: error.message });
    }
};

// Serve file (for downloads/previews)
export const serveFile = async (req, res) => {
    try {
        const fileId = Number(req.params.id);
        const userId = req.user.id;

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        if (file.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Resolve the file safely under the uploads directory
        const uploadsDir = path.join(process.cwd(), "uploads");
        const relativeUrl = file.url.startsWith("/uploads/")
            ? file.url.replace("/uploads/", "")
            : file.url.replace(/^\/+/, "");
        const filePath = path.join(uploadsDir, relativeUrl);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File content not found on server" });
        }

        const mimeType = file.mimetype || "application/octet-stream";
        res.setHeader("Content-Type", mimeType);

        const inlineTypes = [
            "application/pdf",
        ];
        const shouldInline =
            inlineTypes.includes(mimeType) ||
            mimeType.startsWith("image/") ||
            mimeType.startsWith("text/") ||
            mimeType === "application/json";

        const dispositionType = shouldInline ? "inline" : "attachment";
        const safeFileName = encodeURIComponent(file.name || "download");
        res.setHeader(
            "Content-Disposition",
            `${dispositionType}; filename="${safeFileName}"`
        );

        res.sendFile(filePath, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                if (!res.headersSent) {
                    res.status(500).end();
                }
            }
        });

    } catch (error) {
        console.error("serveFile error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
};


// Get SINGLE file info
export const getSingleFile = async (req, res) => {
    try {
        const fileId = Number(req.params.id);

        const file = await prisma.file.findUnique({ where: { id: fileId } });

        if (!file) return res.status(404).json({ error: "File not found" });

        res.json({ file });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// Delete file
export const deleteFile = async (req, res) => {
    try {
        const fileId = Number(req.params.id);
        const userId = req.user.id;

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) return res.status(404).json({ error: "File not found" });

        // Check if user owns the file
        if (file.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Delete physical file from filesystem
        const fileUrl = file.url.startsWith("/") ? file.url.substring(1) : file.url;
        const filePath = path.join(process.cwd(), fileUrl);
        
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`Physical file deleted: ${filePath}`);
            } catch (fsError) {
                console.error(`Failed to delete physical file: ${fsError.message}`);
                // Continue with database deletion even if physical file deletion fails
            }
        }

        // Delete from database
        await prisma.file.delete({ where: { id: fileId } });

        res.json({ message: "File deleted successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Move file to a different folder
export const moveFile = async (req, res) => {
    try {
        const fileId = Number(req.params.id);
        const { folderId } = req.body;

        const file = await prisma.file.findUnique({ where: { id: fileId } });
        if (!file) return res.status(404).json({ error: "File not found" });

        if (file.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        // If folderId is provided, verify it exists and belongs to user
        let finalFolderId = null;
        if (folderId !== null && folderId !== undefined && folderId !== "") {
            finalFolderId = Number(folderId);
            const targetFolder = await prisma.folder.findUnique({ where: { id: finalFolderId } });
            if (!targetFolder) {
                return res.status(404).json({ error: "Destination folder not found" });
            }
            if (targetFolder.userId !== req.user.id) {
                return res.status(403).json({ error: "Unauthorized to move to this folder" });
            }
        }

        const updated = await prisma.file.update({
            where: { id: fileId },
            data: { folderId: finalFolderId },
        });

        res.json({ message: "File moved", file: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Assign a file to a category
export const assignCategoryToFile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileId, categoryId } = req.body;

        if (!userId) {
            return res.status(401).json({ error: "User ID missing from token" });
        }

        if (!fileId || !categoryId) {
            return res.status(400).json({ error: "fileId and categoryId are required" });
        }

        const numericFileId = Number(fileId);
        const numericCategoryId = Number(categoryId);

        if (Number.isNaN(numericFileId) || Number.isNaN(numericCategoryId)) {
            return res.status(400).json({ error: "fileId and categoryId must be numbers" });
        }

        const file = await prisma.file.findUnique({ where: { id: numericFileId } });
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }
        if (file.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized to modify this file" });
        }

        const category = await prisma.category.findUnique({ where: { id: numericCategoryId } });
        if (!category) {
            return res.status(404).json({ error: "Category not found" });
        }

        if (category.userId !== null && category.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized to use this category" });
        }

        const updated = await prisma.file.update({
            where: { id: numericFileId },
            data: { categoryId: numericCategoryId },
        });

        return res.json({ message: "Category assigned to file", file: updated });
    } catch (error) {
        console.error("assignCategoryToFile error:", error);
        return res.status(500).json({ error: error.message });
    }
};
