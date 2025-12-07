import bcrypt from "bcryptjs";
import{ PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

//create user 
export const createUser =async( req , res)=>{
    try{
        const{ name, email, password } = req.body;

        if(!name || !email || !password){
            return res.status(400).json({error: "All fields requuired"});
        }

        //hash password
        const hashed = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { name, email, password: hashed},
        });

        //remove  password from response 
        const { password: _p, ...rest } = user;
        res.status(201).json(rest);

    }catch(err){
        //unique email error 
        if(err.code === "P2002"){
            return res.status(400).json({ error: "Email already exists"});

        }
        res.status(500).json({error: err.message});
    }
};

//get all users 
export const getUsers = async(req, res) => {
    try{
        const users = await prisma.user.findMany({
            select: { id:true, name: true, email:true, createdAt: true}
        });

        res.json(users);

    }catch(err){
        res.status(500).json({error: err.message});
    }
};

//get user by id 
export const getUserById = async( req, res) =>{
    try{
        const id = Number(req.params.id);

        const user = await prisma.user.findUnique({ where: {id} });

        if(!user)return res.status(404).json({ error: "User not found"});

        const{password, ...rest} = user;
        res.json(rest);

    }catch(err){
        res.status(500).json({error: err.message});
    }
};

//update user 
export const updateUser = async(req,res)=>{
    try{
        const id = Number(req.params.id);
        const { name , email, password } = req.body;

        const data ={};
        if(name) data.name = name;
        if(email) data.email = email;
        if(password) data.password = await bcrypt.hash(password ,10);

        const user = await prisma.user.update({
            where: {id},
            data,
        });

        const {password: _p, ...rest }= user;
        res.json(rest);

    }catch(err){
        res.status(500).json({error: err.message });
    }

};

//delete user 
export const deleteUser = async( req, res) =>{
    try{
        const id = Number(req.params.id);

        await prisma.user.delete({ where: {id}});

        res.json({ ok: true});

    }catch(err){
        res.status(500).json({ error: err.message});
    }
};

// Verify user password
export const verifyPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password || !password.trim()) {
            return res.status(400).json({ error: "Password is required" });
        }

        // Get user from database
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.password) {
            return res.status(500).json({ error: "User password not found in database" });
        }

        // Compare password with hashed password (trim to avoid whitespace issues)
        const match = await bcrypt.compare(password.trim(), user.password);
        if (!match) {
            return res.status(401).json({ error: "Incorrect password" });
        }

        res.json({ message: "Password verified", verified: true });
    } catch (err) {
        console.error("Password verification error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Create or update user lock password
export const setLockPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password || !password.trim()) {
            return res.status(400).json({ error: "Lock password is required" });
        }

        // Hash the lock password
        const hashedPassword = await bcrypt.hash(password.trim(), 10);

        // Update user's lock password
        const user = await prisma.user.update({
            where: { id: userId },
            data: { lockPassword: hashedPassword },
        });

        res.json({ message: "Lock password set successfully", hasLockPassword: true });
    } catch (err) {
        console.error("Set lock password error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Verify user lock password
export const verifyLockPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user.id;

        if (!password || !password.trim()) {
            return res.status(400).json({ error: "Lock password is required" });
        }

        // Get user from database
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (!user.lockPassword) {
            return res.status(400).json({ error: "Lock password not set" });
        }

        // Compare password with hashed lock password
        const match = await bcrypt.compare(password.trim(), user.lockPassword);
        if (!match) {
            return res.status(401).json({ error: "Incorrect lock password" });
        }

        res.json({ message: "Lock password verified", verified: true });
    } catch (err) {
        console.error("Lock password verification error:", err);
        res.status(500).json({ error: err.message });
    }
};

// Check if user has lock password set
export const checkLockPassword = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({ 
            where: { id: userId },
            select: { lockPassword: true }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ hasLockPassword: !!user.lockPassword });
    } catch (err) {
        console.error("Check lock password error:", err);
        res.status(500).json({ error: err.message });
    }
};