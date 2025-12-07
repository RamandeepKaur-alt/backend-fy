import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * User Service for Prisma/PostgreSQL
 * Provides user-related database operations
 */

/**
 * Find user by ID
 */
export const findUserById = async (id) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        email: true,
        password: false,
        lockPassword: false,
        authMethod: true,
        emailVerified: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Error finding user by ID:", error);
    return null;
  }
};

/**
 * Find user by email
 */
export const findUserByEmail = async (email) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return user;
  } catch (error) {
    console.error("Error finding user by email:", error);
    return null;
  }
};

/**
 * Update last login timestamp
 */
export const updateLastLogin = async (userId) => {
  try {
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { lastLogin: new Date() },
    });
  } catch (error) {
    console.error("Error updating last login:", error);
  }
};

/**
 * Update refresh token
 */
export const updateRefreshToken = async (userId, refreshToken) => {
  try {
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { refreshToken },
    });
  } catch (error) {
    console.error("Error updating refresh token:", error);
    throw error;
  }
};

/**
 * Verify refresh token matches stored token
 */
export const verifyRefreshToken = async (userId, token) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { refreshToken: true },
    });
    return user && user.refreshToken === token;
  } catch (error) {
    console.error("Error verifying refresh token:", error);
    return false;
  }
};

/**
 * Create local user (email/password)
 */
export const createLocalUser = async (name, email, password) => {
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        authMethod: "local",
      },
    });
    return user;
  } catch (error) {
    console.error("Error creating local user:", error);
    throw error;
  }
};

export default {
  findUserById,
  findUserByEmail,
  updateLastLogin,
  updateRefreshToken,
  verifyRefreshToken,
  createLocalUser,
};








