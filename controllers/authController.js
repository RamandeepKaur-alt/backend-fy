import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

//signup 

export const signup = async(req, res) =>{
    try{
        const { name , email , password }= req.body;

        if(!name || !email || !password)
            return res.status(400).json({error: "All fields required"});

        // Validate email format using regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({error: "Please enter a valid email address."});
        }

        // Normalize email to lowercase for case-insensitive comparison and storage
        const normalizedEmail = email.toLowerCase().trim();

        // Case-insensitive duplicate email check using raw query for PostgreSQL
        // This ensures we catch duplicates regardless of case
        const existingUser = await prisma.$queryRaw`
            SELECT id, email FROM "User" WHERE LOWER(email) = LOWER(${normalizedEmail}) LIMIT 1
        `;

        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({error: "This account is already registered. Continue to login."});
        }

        //hash password
        const hashed =await bcrypt.hash(password, 10);

        const user= await prisma.user.create({
            data:{ name, email: normalizedEmail, password:hashed},
        });

        // Generate token for signup (same as login)
        const token = jwt.sign(
            { id: user.id, email: user.email},
            process.env.JWT_SECRET,
            { expiresIn: "7d"}
        );

        res.status(201).json({
            message: "Signup Successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    }catch(err){
        // Handle Prisma unique constraint violation (P2002) as fallback
        if(err.code === "P2002" && err.meta?.target?.includes("email")) {
            return res.status(400).json({error: "This account is already registered. Continue to login."});
        }
        res.status(500).json({error: err.message});
    }
};

//login
export const login = async(req, res) =>{
    try{
        const{ email , password } = req.body;

        // Normalize email to lowercase for case-insensitive lookup
        const normalizedEmail = email.toLowerCase().trim();

        // Case-insensitive email lookup using raw SQL query
        const users = await prisma.$queryRaw`
            SELECT * FROM "User" WHERE LOWER(email) = LOWER(${normalizedEmail}) LIMIT 1
        `;

        if(!users || users.length === 0) return res.status(400).json({error: "Invalid email or password"});

        const user = users[0];

        const match = await bcrypt.compare(password , user.password);
        if(!match) return res.status(400).json({ error: "Invalid email or password"});

        const token = jwt.sign(
            { id: user.id, email: user.email},
            process.env.JWT_SECRET,
            { expiresIn: "7d"}
        );

        res.json({
  message: "Login Successful",
  token,
  user: {
    id: user.id,
    name: user.name,
    email: user.email
  }
});

    } catch(err){
        res.status(500).json({ error:err.message});
    }
};

//logout
export const logout = async(req, res)=>{
    return res.json({message: "Logged out (client should delete token"});
};