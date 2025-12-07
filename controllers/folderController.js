import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import archiver from "archiver";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

//Create Folder or Subfolder
export const createFolder = async(req,res) =>{
    try{
        const { name , parentId, folderColor } = req.body;
        if(!name){
            return res.status(400).json({error: "Folder name is required"});
        }

        const userId = req.user.id;
        if (!userId) {
            return res.status(401).json({error: "User ID not found in token"});
        }

        const newFolder = await prisma.folder.create({
            data:{
                name,
                userId: userId,
                parentId: parentId || null,
                folderColor: folderColor || "blue",

            },
        });

        console.log(`Folder created: ID=${newFolder.id}, Name=${newFolder.name}, UserID=${newFolder.userId}`);
        res.status(201).json({ message: "Folder created", folder: newFolder});
    }catch(error){
        console.error("Error creating folder:", error);
        res.status(500).json({error: error.message });
    }
};

//delete folder 
export const deleteFolder = async(req,res)=>{
    try{
        const folderId =Number(req.params.id);

        const folder = await prisma.folder.findUnique({where: { id: folderId}});
        if(!folder) return res.status(404).json({error: "Folder not found"});

        if(folder.userId !==req.user.id)
            return res.status(403).json({error: "Unauthorized"});

        await prisma.folder.delete({where: { id: folderId}});

        res.json({message: "Folder deleted successfully"});
    }catch(error){
        res.status(500).json({ error: error.message});
    }
};

// controllers/folderController.js
export const deleteSubfolder = async (req, res) => {
  try {
    const folderId = Number(req.params.id);

    // Folder check
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) return res.status(404).json({ error: "Folder not found" });

    // Prevent deleting root folder
    if (folder.parentId === null) {
      return res.status(400).json({ error: "Cannot delete root folder" });
    }

    // Delete subfolder (files inside will also delete due to cascade)
    await prisma.folder.delete({ where: { id: folderId } });

    res.json({ message: "Subfolder deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export const getAllFolders = async (req, res) => {
  try {
    const { parentId } = req.query;
    const userId = req.user.id;
    
    // Handle parentId: if it's empty string, null, or undefined, treat as null (root folders)
    let finalParentId = null;
    if (parentId && parentId !== "" && parentId !== "null" && parentId !== "undefined") {
      finalParentId = Number(parentId);
      if (isNaN(finalParentId)) {
        finalParentId = null;
      }
    }
    
    const whereClause = { 
      userId: userId,
      parentId: finalParentId
    };

    const folders = await prisma.folder.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" }
    });

    res.json({ folders });
  } catch (err) {
    console.error("Error fetching folders:", err);
    res.status(500).json({ error: "Failed to fetch folders" });
  }
};

// folderController.js me add karo
export const getAllFoldersWithContents = async (req, res) => {
  try {
    const userId = req.user.id;

    const folders = await prisma.folder.findMany({
      where: {
        userId,
        parentId: null, // root folders
      },
      include: {
        subfolders: {
          include: {
            files: true
          }
        },
        files: true
      }
    });

    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


//lock folder - No password required initially
export const lockFolder = async(req,res) => {
    try {
        const folderId = Number(req.params.id);

        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        // Simply lock the folder without requiring password
        const updated = await prisma.folder.update({
            where: { id: folderId },
            data: {
                isLocked: true,
            },
        });

        res.json({ message: "Folder locked", folder: updated });
    } catch(error) {
        console.error(error);
        res.status(500).json({ error: "Unable to lock folder" });
    }
};


//unlock folder - No password required if user is authenticated in session
export const unlockFolder = async(req,res)=>{
    try{
        const folderId = Number(req.params.id);
        // Password is optional - if user is authenticated in locked folders session, skip password check
        const {password, skipPasswordCheck} = req.body;

        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        if (!folder.isLocked) {
            return res.status(400).json({ error: "Folder is not locked" });
        }

        // If skipPasswordCheck is true (user is authenticated in locked folders area), skip password verification
        if (!skipPasswordCheck) {
            // If password is provided, verify it against user's lock password
            if (!password) {
                return res.status(400).json({ error: "Password required or authentication required" });
            }

            // Get user's lock password
            const user = await prisma.user.findUnique({ where: { id: req.user.id } });
            if (!user || !user.lockPassword) {
                return res.status(400).json({ error: "Lock password not set. Please set a lock password first." });
            }

            // Compare password with user's lock password
            const match = await bcrypt.compare(password, user.lockPassword);
            if (!match) {
                return res.status(401).json({ error: "Incorrect password" });
            }
        }

        const updated = await prisma.folder.update({
            where: { id: folderId },
            data: {
                isLocked: false,
            },
        });

        res.json({ message: "Folder unlocked", folder: updated });
    }catch(error){
        console.error(error);
        res.status(500).json({error: "Unable to unlock folder"});
    }
};


 // Mark / Unmark Folder as Important

export const toggleImportant = async (req, res) => {
    try {
        const folderId = Number(req.params.id);

        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        const updated = await prisma.folder.update({
            where: { id: folderId },
            data: { isImportant: !folder.isImportant },
        });

        res.json({
            message: updated.isImportant
                ? "Marked as important"
                : "Removed from important",
            folder: updated,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Helper function to get full parent chain
async function getParentChain(folderId, userId) {
    const chain = [];
    
    // First, get the current folder to start from its parent
    const currentFolder = await prisma.folder.findUnique({
        where: { id: folderId },
        select: {
            parentId: true,
            userId: true,
        }
    });

    if (!currentFolder || currentFolder.userId !== userId) {
        return chain;
    }

    // Start from the parent of the current folder
    let currentParentId = currentFolder.parentId;

    while (currentParentId) {
        const folder = await prisma.folder.findUnique({
            where: { id: currentParentId },
            select: {
                id: true,
                name: true,
                parentId: true,
                userId: true,
            }
        });

        if (!folder || folder.userId !== userId) break;
        
        chain.unshift({ id: folder.id, name: folder.name });
        currentParentId = folder.parentId;
    }

    return chain;
}

// Get folder by ID with subfolders and files
export const getFolderById = async (req, res) => {
    try {
        const folderId = Number(req.params.id);

        const folder = await prisma.folder.findUnique({
            where: { id: folderId },
            include: {
                subfolders: {
                    orderBy: { createdAt: "desc" }
                },
                files: {
                    orderBy: { createdAt: "desc" }
                },
                parent: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        // Check if folder is locked - if locked, require password verification
        if (folder.isLocked) {
            // Check if password is provided in query or body
            const password = req.query.password || req.body.password;
            if (!password) {
                return res.status(403).json({ 
                    error: "Folder is locked. Password required.",
                    isLocked: true 
                });
            }

            // Verify password
            if (!folder.lockPassword) {
                return res.status(400).json({ error: "Folder lock password not set" });
            }

            const match = await bcrypt.compare(password, folder.lockPassword);
            if (!match) {
                return res.status(401).json({ error: "Incorrect password" });
            }
        }

        // Get full parent chain
        const parentChain = await getParentChain(folderId, req.user.id);

        // Filter out locked subfolders from response
        const unlockedSubfolders = folder.subfolders.filter(subfolder => !subfolder.isLocked);

        res.json({ 
            folder: {
                ...folder,
                subfolders: unlockedSubfolders,
                parentChain: parentChain
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Rename folder
export const renameFolder = async (req, res) => {
    try {
        const folderId = Number(req.params.id);
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Folder name is required" });
        }

        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        const updated = await prisma.folder.update({
            where: { id: folderId },
            data: { name: name.trim() },
        });

        res.json({ message: "Folder renamed successfully", folder: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Move folder to a different parent
export const moveFolder = async (req, res) => {
    try {
        const folderId = Number(req.params.id);
        const { parentId } = req.body;

        const folder = await prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder) return res.status(404).json({ error: "Folder not found" });

        if (folder.userId !== req.user.id)
            return res.status(403).json({ error: "Unauthorized" });

        // If parentId is provided, verify it exists and belongs to user
        let finalParentId = null;
        if (parentId !== null && parentId !== undefined && parentId !== "") {
            finalParentId = Number(parentId);
            const parentFolder = await prisma.folder.findUnique({ where: { id: finalParentId } });
            if (!parentFolder) {
                return res.status(404).json({ error: "Destination folder not found" });
            }
            if (parentFolder.userId !== req.user.id) {
                return res.status(403).json({ error: "Unauthorized to move to this folder" });
            }
            // Prevent moving folder into itself or its children
            if (finalParentId === folderId) {
                return res.status(400).json({ error: "Cannot move folder into itself" });
            }
        }

        const updated = await prisma.folder.update({
            where: { id: folderId },
            data: { parentId: finalParentId },
        });

        res.json({ message: "Folder moved", folder: updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get all locked folders
export const getLockedFolders = async (req, res) => {
    try {
        const baseFolders = await prisma.folder.findMany({
            where: {
                userId: req.user.id,
                isLocked: true,
            },
            orderBy: { createdAt: "desc" }
        });

        // Attach parentChain so frontend can build breadcrumb-style paths
        const folders = await Promise.all(
            baseFolders.map(async (folder) => ({
                ...folder,
                parentChain: await getParentChain(folder.id, req.user.id),
            }))
        );

        res.json({ folders });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch locked folders" });
    }
};

// Get all important folders
export const getImportantFolders = async (req, res) => {
    try {
        const baseFolders = await prisma.folder.findMany({
            where: {
                userId: req.user.id,
                isImportant: true,
            },
            orderBy: { createdAt: "desc" }
        });

        // Attach parentChain for breadcrumb paths in Favorites view
        const folders = await Promise.all(
            baseFolders.map(async (folder) => ({
                ...folder,
                parentChain: await getParentChain(folder.id, req.user.id),
            }))
        );

        res.json({ folders });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch important folders" });
    }
};

// Share/Export folders as zip
export const shareFolders = async (req, res) => {
    try {
        const { folderIds } = req.body;
        const userId = req.user.id;

        if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
            return res.status(400).json({ error: "Folder IDs are required" });
        }

        // Verify all folders belong to user
        const folders = await prisma.folder.findMany({
            where: {
                id: { in: folderIds.map(id => Number(id)) },
                userId: userId,
            },
            include: {
                files: true,
                subfolders: {
                    include: {
                        files: true,
                    }
                }
            }
        });

        if (folders.length === 0) {
            return res.status(404).json({ error: "No folders found" });
        }

        // Create zip archive
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        // Set response headers
        res.attachment(`fynora-folders-${Date.now()}.zip`);
        res.type('application/zip');

        archive.pipe(res);

        // Helper function to recursively add folder to archive
        const addFolderToArchive = async (folder, basePath = '') => {
            const folderPath = basePath ? `${basePath}/${folder.name}` : folder.name;
            
            // Add folder files
            for (const file of folder.files || []) {
                const filePath = path.join(__dirname, '..', file.url);
                if (fs.existsSync(filePath)) {
                    archive.file(filePath, { name: `${folderPath}/${file.name}` });
                }
            }

            // Recursively add subfolders
            if (folder.subfolders && folder.subfolders.length > 0) {
                for (const subfolder of folder.subfolders) {
                    const fullSubfolder = await prisma.folder.findUnique({
                        where: { id: subfolder.id },
                        include: {
                            files: true,
                            subfolders: {
                                include: {
                                    files: true,
                                }
                            }
                        }
                    });
                    if (fullSubfolder) {
                        await addFolderToArchive(fullSubfolder, folderPath);
                    }
                }
            }
        };

        // Add each folder to archive
        for (const folder of folders) {
            await addFolderToArchive(folder);
        }

        // Finalize the archive
        await archive.finalize();

    } catch (error) {
        console.error("Error sharing folders:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to share folders" });
        }
    }
};