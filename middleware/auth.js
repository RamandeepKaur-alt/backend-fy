import jwt from "jsonwebtoken";

export const auth =( req, res ,next) =>{
    const token = req.headers.authorization?.split(" ")[1];

    if(!token) return res.status(401).json({error: "No token provided"});

    try{
        const decoded = jwt.verify(token ,process.env.JWT_SECRET);
        req.user = decoded;
        
        // Verify user ID exists in token
        if (!req.user || !req.user.id) {
            console.error("Token decoded but missing user ID:", decoded);
            return res.status(401).json({error: "Invalid token: missing user ID"});
        }
        
        next();
    }catch(err){
        console.error("JWT verification error:", err.message);
        res.status(401).json({error: "Invalid or expired token"});
    }
};