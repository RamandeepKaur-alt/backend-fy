import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes.js";
import folderRoutes from "./routes/folderRoutes.js";
import {auth} from "./middleware/auth.js";
import fileRoutes from "./routes/fileRoutes.js";
import itemsRoutes from "./routes/itemsRoutes.js";
import magicLensRoutes from "./routes/magicLensRoutes.js";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
const prisma = new PrismaClient();// Prisma Client (DB connection)

// Test Prisma connection
prisma.$connect()
  .then(async () => {
    console.log("✅ PostgreSQL connected via Prisma");
  })
  .catch((error) => {
    console.error("❌ Failed to connect to PostgreSQL:", error);
  });

// CORS configuration
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static("uploads")); // Serve uploaded files

// Routes
app.use("/api/auth", authRoutes);


app.use("/api/folders", folderRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/items", itemsRoutes); // Unified items routes (files & folders)
app.use("/api/magic-lens", magicLensRoutes);


//test route 
app.get("/api/test", (req, res)=>{
    res.json({ok:true, message: "Fynora backend running"});
});

//test 2
app.get("/api/test2", (req , res)=>{
  res.json({
   ok:true, message: "UPDATE Fynora backend running UPDATE"
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));