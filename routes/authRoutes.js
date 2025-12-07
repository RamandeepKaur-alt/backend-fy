import express from "express";
import { getUsers, verifyPassword, setLockPassword, verifyLockPassword, checkLockPassword} from "../controllers/userController.js";
import { signup, login, logout } from "../controllers/authController.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/logout", logout);

router.get("/all", getUsers);
router.post("/users/verify-password", auth, verifyPassword);
router.post("/users/set-lock-password", auth, setLockPassword);
router.post("/users/verify-lock-password", auth, verifyLockPassword);
router.get("/users/check-lock-password", auth, checkLockPassword);

export default router;
