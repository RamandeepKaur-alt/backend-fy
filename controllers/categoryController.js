import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Resolve category by name for current user, auto-create if missing
export const getOrCreateCategoryByName = async (req, res) => {
    try {
        const { name } = req.params;
        const userId = req.user.id;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Category name is required" });
        }

        if (!userId) {
            return res.status(401).json({ error: "User ID missing from token" });
        }

        const normalizedName = name.trim();

        // Always resolve categories by { name, userId } for this user
        let category = await prisma.category.findFirst({
            where: {
                name: normalizedName,
                userId,
            },
        });

        // Auto-create category for this user if not found
        if (!category) {
            category = await prisma.category.create({
                data: {
                    name: normalizedName,
                    userId,
                },
            });
        }

        return res.json({ category });
    } catch (error) {
        console.error("getOrCreateCategoryByName error:", error);
        return res.status(500).json({ error: error.message });
    }
};

// Optional: list categories for current user (user-specific + global)
export const listCategoriesForUser = async (req, res) => {
    try {
        const userId = req.user.id;

        if (!userId) {
            return res.status(401).json({ error: "User ID missing from token" });
        }

        const categories = await prisma.category.findMany({
            where: {
                OR: [
                    { userId },
                    { userId: null },
                ],
            },
            orderBy: {
                name: "asc",
            },
        });

        return res.json({ categories });
    } catch (error) {
        console.error("listCategoriesForUser error:", error);
        return res.status(500).json({ error: error.message });
    }
};
