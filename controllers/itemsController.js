import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

/**
 * Move Item (File or Folder)
 * Moves an item from its current location to a target folder
 * PUT /api/items/:id/move
 */
export const moveItem = async (req, res) => {
    try {
        const itemId = Number(req.params.id);
        const { type, targetFolderId } = req.body;
        const userId = req.user.id;

        // Validate type
        if (!type || !['file', 'folder'].includes(type)) {
            return res.status(400).json({ error: "Type must be 'file' or 'folder'" });
        }

        // Handle folder move
        if (type === 'folder') {
            const folder = await prisma.folder.findUnique({ 
                where: { id: itemId } 
            });

            if (!folder) {
                return res.status(404).json({ error: "Folder not found" });
            }

            if (folder.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Validate target folder if provided
            let finalTargetFolderId = null;
            if (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== "") {
                finalTargetFolderId = Number(targetFolderId);
                const targetFolder = await prisma.folder.findUnique({ 
                    where: { id: finalTargetFolderId } 
                });
                
                if (!targetFolder) {
                    return res.status(404).json({ error: "Target folder not found" });
                }
                
                if (targetFolder.userId !== userId) {
                    return res.status(403).json({ error: "Unauthorized to move to this folder" });
                }
                
                // Prevent moving folder into itself or its children
                if (finalTargetFolderId === itemId) {
                    return res.status(400).json({ error: "Cannot move folder into itself" });
                }
            }

            const updated = await prisma.folder.update({
                where: { id: itemId },
                data: { parentId: finalTargetFolderId },
            });

            return res.json({ 
                message: "Folder moved successfully", 
                item: updated 
            });
        }

        // Handle file move
        if (type === 'file') {
            const file = await prisma.file.findUnique({ 
                where: { id: itemId } 
            });

            if (!file) {
                return res.status(404).json({ error: "File not found" });
            }

            if (file.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Validate target folder if provided
            let finalTargetFolderId = null;
            if (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== "") {
                finalTargetFolderId = Number(targetFolderId);
                const targetFolder = await prisma.folder.findUnique({ 
                    where: { id: finalTargetFolderId } 
                });
                
                if (!targetFolder) {
                    return res.status(404).json({ error: "Target folder not found" });
                }
                
                if (targetFolder.userId !== userId) {
                    return res.status(403).json({ error: "Unauthorized to move to this folder" });
                }
            }

            const updated = await prisma.file.update({
                where: { id: itemId },
                data: { folderId: finalTargetFolderId },
            });

            return res.json({ 
                message: "File moved successfully", 
                item: updated 
            });
        }

    } catch (error) {
        console.error("Error moving item:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Duplicate Item (File or Folder)
 * Creates a copy of an item in the target folder
 * POST /api/items/:id/duplicate
 */
export const duplicateItem = async (req, res) => {
    try {
        const itemId = Number(req.params.id);
        const { type, targetFolderId } = req.body;
        const userId = req.user.id;

        // Validate type
        if (!type || !['file', 'folder'].includes(type)) {
            return res.status(400).json({ error: "Type must be 'file' or 'folder'" });
        }

        // Handle folder duplication
        if (type === 'folder') {
            const folder = await prisma.folder.findUnique({ 
                where: { id: itemId },
                include: {
                    files: true,
                    subfolders: true
                }
            });

            if (!folder) {
                return res.status(404).json({ error: "Folder not found" });
            }

            if (folder.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Validate target folder if provided
            let finalTargetFolderId = null;
            if (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== "") {
                finalTargetFolderId = Number(targetFolderId);
                const targetFolder = await prisma.folder.findUnique({ 
                    where: { id: finalTargetFolderId } 
                });
                
                if (!targetFolder) {
                    return res.status(404).json({ error: "Target folder not found" });
                }
                
                if (targetFolder.userId !== userId) {
                    return res.status(403).json({ error: "Unauthorized to duplicate to this folder" });
                }
            }

            // Create duplicate folder with "(Copy)" suffix
            const newFolder = await prisma.folder.create({
                data: {
                    name: `${folder.name} (Copy)`,
                    userId: userId,
                    parentId: finalTargetFolderId,
                    folderColor: folder.folderColor || "blue",
                    isLocked: false, // Duplicates are not locked
                    isImportant: false, // Duplicates are not important
                }
            });

            // Recursively duplicate subfolders and files
            await duplicateFolderContents(folder.id, newFolder.id, userId);

            return res.json({ 
                message: "Folder duplicated successfully", 
                item: newFolder 
            });
        }

        // Handle file duplication
        if (type === 'file') {
            const file = await prisma.file.findUnique({ 
                where: { id: itemId } 
            });

            if (!file) {
                return res.status(404).json({ error: "File not found" });
            }

            if (file.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Validate target folder if provided
            let finalTargetFolderId = null;
            if (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== "") {
                finalTargetFolderId = Number(targetFolderId);
                const targetFolder = await prisma.folder.findUnique({ 
                    where: { id: finalTargetFolderId } 
                });
                
                if (!targetFolder) {
                    return res.status(404).json({ error: "Target folder not found" });
                }
                
                if (targetFolder.userId !== userId) {
                    return res.status(403).json({ error: "Unauthorized to duplicate to this folder" });
                }
            }

            // Copy the physical file
            const sourcePath = path.join(__dirname, '..', file.url);
            const fileExtension = path.extname(file.name);
            const fileNameWithoutExt = path.basename(file.name, fileExtension);
            const newFileName = `${fileNameWithoutExt} (Copy)${fileExtension}`;
            const uploadsDir = path.join(__dirname, '..', 'uploads');
            const newFilePath = path.join(uploadsDir, `${Date.now()}-${newFileName}`);
            const newFileUrl = `/uploads/${path.basename(newFilePath)}`;

            // Copy file if it exists
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, newFilePath);
            }

            // Create duplicate file record
            const newFile = await prisma.file.create({
                data: {
                    name: newFileName,
                    url: newFileUrl,
                    size: file.size,
                    mimetype: file.mimetype,
                    folderId: finalTargetFolderId,
                    userId: userId,
                }
            });

            return res.json({ 
                message: "File duplicated successfully", 
                item: newFile 
            });
        }

    } catch (error) {
        console.error("Error duplicating item:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Helper function to recursively duplicate folder contents
 */
async function duplicateFolderContents(sourceFolderId, targetFolderId, userId) {
    // Get all files in source folder
    const files = await prisma.file.findMany({
        where: { folderId: sourceFolderId, userId: userId }
    });

    // Duplicate all files
    for (const file of files) {
        const sourcePath = path.join(__dirname, '..', file.url);
        const fileExtension = path.extname(file.name);
        const fileNameWithoutExt = path.basename(file.name, fileExtension);
        const newFileName = `${fileNameWithoutExt} (Copy)${fileExtension}`;
        const uploadsDir = path.join(__dirname, '..', 'uploads');
        const newFilePath = path.join(uploadsDir, `${Date.now()}-${newFileName}`);
        const newFileUrl = `/uploads/${path.basename(newFilePath)}`;

        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, newFilePath);
        }

        await prisma.file.create({
            data: {
                name: newFileName,
                url: newFileUrl,
                size: file.size,
                mimetype: file.mimetype,
                folderId: targetFolderId,
                userId: userId,
            }
        });
    }

    // Get all subfolders
    const subfolders = await prisma.folder.findMany({
        where: { parentId: sourceFolderId, userId: userId }
    });

    // Recursively duplicate subfolders
    for (const subfolder of subfolders) {
        const newSubfolder = await prisma.folder.create({
            data: {
                name: `${subfolder.name} (Copy)`,
                userId: userId,
                parentId: targetFolderId,
                folderColor: subfolder.folderColor || "blue",
                isLocked: false,
                isImportant: false,
            }
        });

        await duplicateFolderContents(subfolder.id, newSubfolder.id, userId);
    }
}

/**
 * Delete Item (File or Folder)
 * Deletes an item permanently
 * DELETE /api/items/:id
 */
export const deleteItem = async (req, res) => {
    try {
        const itemId = Number(req.params.id);
        const { type } = req.query; // Get type from query parameter
        const userId = req.user.id;

        // Validate type
        if (!type || !['file', 'folder'].includes(type)) {
            return res.status(400).json({ error: "Type query parameter must be 'file' or 'folder'" });
        }

        // Handle folder deletion
        if (type === 'folder') {
            const folder = await prisma.folder.findUnique({ 
                where: { id: itemId } 
            });

            if (!folder) {
                return res.status(404).json({ error: "Folder not found" });
            }

            if (folder.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Delete folder (cascade will handle subfolders and files)
            await prisma.folder.delete({ where: { id: itemId } });

            return res.json({ message: "Folder deleted successfully" });
        }

        // Handle file deletion
        if (type === 'file') {
            const file = await prisma.file.findUnique({ 
                where: { id: itemId } 
            });

            if (!file) {
                return res.status(404).json({ error: "File not found" });
            }

            if (file.userId !== userId) {
                return res.status(403).json({ error: "Unauthorized" });
            }

            // Delete physical file if it exists
            const filePath = path.join(__dirname, '..', file.url);
            if (fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch (err) {
                    console.error("Error deleting physical file:", err);
                    // Continue with database deletion even if file deletion fails
                }
            }

            // Delete file record
            await prisma.file.delete({ where: { id: itemId } });

            return res.json({ message: "File deleted successfully" });
        }

    } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Share Item (File or Folder)
 * Generates a shareable link for an item
 * GET /api/items/:id/share
 */
export const shareItem = async (req, res) => {
    try {
        const itemId = Number(req.params.id);
        const { type } = req.query; // Get type from query parameter
        const userId = req.user.id;

        // Validate type
        if (!type || !['file', 'folder'].includes(type)) {
            return res.status(400).json({ error: "Type query parameter must be 'file' or 'folder'" });
        }

        // Generate a unique share token
        const shareToken = crypto.randomBytes(32).toString('hex');
        const shareLink = `${req.protocol}://${req.get('host')}/share/${shareToken}`;

        // Store share token (you might want to create a Share model in Prisma for this)
        // For now, we'll return the share link directly
        // In a production app, you'd store this in a database with expiration dates

        let item;
        if (type === 'folder') {
            item = await prisma.folder.findUnique({ 
                where: { id: itemId } 
            });
        } else {
            item = await prisma.file.findUnique({ 
                where: { id: itemId } 
            });
        }

        if (!item) {
            return res.status(404).json({ error: `${type} not found` });
        }

        if (item.userId !== userId) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        return res.json({ 
            message: "Share link generated successfully",
            shareLink: shareLink,
            shareToken: shareToken,
            item: {
                id: item.id,
                name: item.name,
                type: type
            }
        });

    } catch (error) {
        console.error("Error sharing item:", error);
        res.status(500).json({ error: error.message });
    }
};

























