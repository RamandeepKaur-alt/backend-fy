# Backend Code Review - Fynora

## Executive Summary

This code review covers security, code quality, best practices, performance, and architecture concerns for the Fynora backend. Overall, the codebase is well-structured but has several critical security issues and areas for improvement.

---

## 🔴 CRITICAL SECURITY ISSUES

### 1. **Hardcoded Session Secret Fallback**
**Location:** `server.js:35`
```javascript
secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || "fynora-session-secret-change-in-production"
```
**Issue:** Hardcoded fallback secret is a major security vulnerability. If environment variables are not set, the app uses a predictable secret.
**Fix:** Remove fallback and fail fast if secrets are not configured:
```javascript
if (!process.env.SESSION_SECRET && !process.env.JWT_SECRET) {
  throw new Error("SESSION_SECRET or JWT_SECRET must be set");
}
secret: process.env.SESSION_SECRET || process.env.JWT_SECRET
```

### 2. **Missing Input Validation**
**Location:** Multiple controllers
**Issue:** No input validation/sanitization for:
- Email format validation
- Password strength requirements
- File name sanitization (path traversal risk)
- Folder name validation
- Numeric ID validation

**Fix:** Add validation middleware (e.g., `express-validator` or `joi`):
```javascript
// Example for signup
import { body, validationResult } from 'express-validator';

router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/[A-Za-z0-9@$!%*#?&]/),
  body('name').trim().isLength({ min: 1, max: 100 }).escape()
], signup);
```

### 3. **Path Traversal Vulnerability**
**Location:** `fileController.js:154`, `fileController.js:196`
```javascript
const filePath = path.join(process.cwd(), file.url);
```
**Issue:** If `file.url` contains `../`, it could access files outside the uploads directory.
**Fix:** Validate and sanitize file paths:
```javascript
const filePath = path.join(process.cwd(), file.url);
const resolvedPath = path.resolve(filePath);
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!resolvedPath.startsWith(uploadsDir)) {
  return res.status(403).json({ error: "Invalid file path" });
}
```

### 4. **No Rate Limiting**
**Location:** `server.js`
**Issue:** No rate limiting on authentication endpoints, file uploads, or API routes. Vulnerable to brute force and DoS attacks.
**Fix:** Add `express-rate-limit`:
```javascript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5 // 5 requests per window
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
```

### 5. **Missing CORS Origin Validation**
**Location:** `server.js:51-56`
**Issue:** CORS allows any origin if `FRONTEND_URL` is not set (defaults to localhost).
**Fix:** Validate and restrict CORS origins:
```javascript
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL] 
  : ['http://localhost:3000'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
```

### 6. **JWT Secret Not Validated**
**Location:** `middleware/auth.js:9`
**Issue:** No check if `JWT_SECRET` is set before using it.
**Fix:** Add validation at startup:
```javascript
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
```

### 7. **Sensitive Data in Logs**
**Location:** Multiple files
**Issue:** Logging user data, file paths, and errors that may contain sensitive information.
**Fix:** Sanitize logs and avoid logging sensitive data:
```javascript
// Instead of:
console.log(`File uploaded: ID=${file.id}, Name=${file.name}, UserID=${file.userId}`);

// Use:
console.log(`File uploaded: ID=${file.id}, UserID=${file.userId}`);
```

### 8. **No File Type Validation**
**Location:** `middleware/upload.js:25-28`
```javascript
const fileFilter = (req, file, cb) => {
  cb(null, true); // Accept all file types
};
```
**Issue:** Accepts all file types, including executables and scripts.
**Fix:** Implement MIME type and extension validation:
```javascript
const allowedMimes = ['image/', 'application/pdf', 'application/vnd.openxmlformats-officedocument'];
const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.txt'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isValidMime = allowedMimes.some(mime => file.mimetype.startsWith(mime));
  const isValidExt = allowedExts.includes(ext);
  
  if (isValidMime && isValidExt) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};
```

---

## 🟠 HIGH PRIORITY ISSUES

### 9. **Multiple Prisma Client Instances**
**Location:** Multiple files
**Issue:** Creating new `PrismaClient()` instances in multiple files can lead to connection pool exhaustion.
**Fix:** Create a singleton Prisma client:
```javascript
// utils/prisma.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default prisma;
```

Then import from this file instead of creating new instances.

### 10. **No Error Handling for Database Operations**
**Location:** Multiple controllers
**Issue:** Database operations may fail without proper error handling, exposing internal errors to clients.
**Fix:** Add try-catch and handle Prisma errors:
```javascript
try {
  const user = await prisma.user.findUnique({ where: { email } });
} catch (error) {
  if (error.code === 'P2002') {
    return res.status(409).json({ error: 'Email already exists' });
  }
  console.error('Database error:', error);
  return res.status(500).json({ error: 'Internal server error' });
}
```

### 11. **Missing Authorization Checks**
**Location:** `fileController.js:164-177` (`getSingleFile`)
**Issue:** `getSingleFile` doesn't check if user owns the file.
**Fix:** Add ownership check:
```javascript
export const getSingleFile = async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const userId = req.user.id;

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: "File not found" });
    
    if (file.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({ file });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

### 12. **Circular Dependency Risk in Folder Moves**
**Location:** `folderController.js:388-424` (`moveFolder`)
**Issue:** Only checks if folder is moved into itself, not if it's moved into a child folder (circular reference).
**Fix:** Add recursive check:
```javascript
async function isDescendant(folderId, potentialParentId, userId) {
  if (folderId === potentialParentId) return true;
  const folder = await prisma.folder.findUnique({
    where: { id: potentialParentId },
    select: { parentId: true, userId: true }
  });
  if (!folder || folder.userId !== userId) return false;
  if (folder.parentId === null) return false;
  return await isDescendant(folderId, folder.parentId, userId);
}

// In moveFolder:
if (finalParentId) {
  if (await isDescendant(folderId, finalParentId, req.user.id)) {
    return res.status(400).json({ error: "Cannot move folder into its own descendant" });
  }
}
```

### 13. **Unused/Dead Code**
**Location:** `utils/authHelper.js`
**Issue:** File imports MongoDB `User` model but project uses Prisma. This file appears unused.
**Fix:** Remove or update to use Prisma.

### 14. **No Request Size Limits**
**Location:** `server.js:59`
**Issue:** `express.json()` has default 100kb limit, but file uploads are 500MB. Inconsistent limits.
**Fix:** Set explicit limits:
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

### 15. **Missing Transaction Handling**
**Location:** `itemsController.js:128-262` (`duplicateItem`)
**Issue:** Folder duplication involves multiple database operations without transactions. If one fails, partial data may be created.
**Fix:** Use Prisma transactions:
```javascript
await prisma.$transaction(async (tx) => {
  const newFolder = await tx.folder.create({...});
  await duplicateFolderContents(folder.id, newFolder.id, userId, tx);
});
```

---

## 🟡 MEDIUM PRIORITY ISSUES

### 16. **Inconsistent Error Messages**
**Location:** Throughout codebase
**Issue:** Error messages vary in format and detail level.
**Fix:** Standardize error responses:
```javascript
// utils/errorHandler.js
export const errorResponse = (res, status, message, details = null) => {
  const response = { error: message };
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }
  return res.status(status).json(response);
};
```

### 17. **No Request ID/Correlation ID**
**Location:** `server.js`
**Issue:** No request tracking for debugging and logging.
**Fix:** Add request ID middleware:
```javascript
import { v4 as uuidv4 } from 'uuid';

app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});
```

### 18. **Magic Numbers**
**Location:** Multiple files
**Issue:** Hardcoded values like `10` (bcrypt rounds), `7d` (JWT expiry), `500 * 1024 * 1024` (file size).
**Fix:** Move to constants:
```javascript
// config/constants.js
export const BCRYPT_ROUNDS = 10;
export const JWT_EXPIRY = '7d';
export const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
```

### 19. **No Health Check Endpoint**
**Location:** `server.js`
**Issue:** Only has `/api/test` endpoint. No proper health check for monitoring.
**Fix:** Add health check:
```javascript
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});
```

### 20. **Missing API Documentation**
**Issue:** No OpenAPI/Swagger documentation.
**Fix:** Add Swagger/OpenAPI documentation using `swagger-jsdoc` and `swagger-ui-express`.

### 21. **Inconsistent Async/Await Error Handling**
**Location:** Multiple files
**Issue:** Some async functions don't handle errors properly.
**Fix:** Use consistent error handling or async wrapper:
```javascript
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/signup', asyncHandler(signup));
```

### 22. **No File Cleanup on Failed Operations**
**Location:** `fileController.js:194-206`
**Issue:** If database deletion fails after file deletion, orphaned files remain.
**Fix:** Use transactions or cleanup on failure:
```javascript
try {
  await prisma.file.delete({ where: { id: fileId } });
} catch (dbError) {
  // Restore file if database deletion fails
  if (fs.existsSync(filePath)) {
    // Log error but don't restore (file was already deleted)
  }
  throw dbError;
}
```

### 23. **Share Token Not Stored**
**Location:** `itemsController.js:399-452` (`shareItem`)
**Issue:** Share tokens are generated but not stored in database. No expiration or revocation.
**Fix:** Create Share model in Prisma and store tokens with expiration.

### 24. **Missing Input Sanitization for HTML**
**Location:** `magicLensController.js`
**Issue:** Generated HTML summaries may contain user input that could be XSS vulnerable.
**Fix:** Sanitize HTML output or use a library like `DOMPurify`.

---

## 🟢 LOW PRIORITY / CODE QUALITY

### 25. **Inconsistent Code Style**
- Mix of single/double quotes
- Inconsistent spacing
- Some functions have JSDoc, others don't

**Fix:** Add ESLint and Prettier configuration.

### 26. **No TypeScript**
**Issue:** Backend uses JavaScript instead of TypeScript, reducing type safety.
**Recommendation:** Consider migrating to TypeScript for better type safety.

### 27. **Large Controller Files**
**Location:** `magicLensController.js` (1007 lines), `folderController.js` (549 lines)
**Issue:** Controllers are too large and handle too many responsibilities.
**Fix:** Split into smaller, focused modules.

### 28. **Missing Unit Tests**
**Issue:** No test files found.
**Fix:** Add unit tests using Jest or Mocha.

### 29. **Console.log Instead of Logger**
**Location:** Throughout codebase
**Issue:** Using `console.log` instead of a proper logging library.
**Fix:** Use `winston` or `pino` for structured logging.

### 30. **No Environment Variable Validation**
**Issue:** No validation that required environment variables are set at startup.
**Fix:** Use `dotenv-safe` or `envalid`:
```javascript
import { cleanEnv, str, num } from 'envalid';

const env = cleanEnv(process.env, {
  DATABASE_URL: str(),
  JWT_SECRET: str(),
  PORT: num({ default: 5000 })
});
```

---

## 📋 RECOMMENDATIONS SUMMARY

### Immediate Actions (Critical):
1. ✅ Remove hardcoded secrets
2. ✅ Add input validation
3. ✅ Fix path traversal vulnerability
4. ✅ Add rate limiting
5. ✅ Validate CORS origins
6. ✅ Add file type validation

### Short-term (High Priority):
7. ✅ Create singleton Prisma client
8. ✅ Add proper error handling
9. ✅ Fix authorization checks
10. ✅ Add circular dependency check for folders
11. ✅ Remove unused code
12. ✅ Add transaction handling

### Medium-term:
13. ✅ Standardize error responses
14. ✅ Add request ID tracking
15. ✅ Extract magic numbers to constants
16. ✅ Add health check endpoint
17. ✅ Add API documentation

### Long-term:
18. ✅ Add comprehensive testing
19. ✅ Consider TypeScript migration
20. ✅ Refactor large controllers
21. ✅ Implement proper logging
22. ✅ Add CI/CD pipeline

---

## 📊 Code Quality Metrics

- **Total Issues Found:** 30
- **Critical:** 8
- **High Priority:** 7
- **Medium Priority:** 9
- **Low Priority:** 6

---

## ✅ Positive Aspects

1. ✅ Good separation of concerns (controllers, routes, middleware)
2. ✅ Uses Prisma ORM (type-safe database access)
3. ✅ Proper use of async/await
4. ✅ JWT authentication implemented
5. ✅ Google OAuth integration
6. ✅ File upload handling with Multer
7. ✅ Cascade deletes in database schema
8. ✅ Good folder structure

---

## 🔧 Quick Wins

1. Add `.env.example` file with all required variables
2. Add `package.json` scripts for linting and formatting
3. Add `README.md` with setup instructions
4. Add `.gitignore` to exclude sensitive files
5. Add error handling middleware

---

**Review Date:** 2024
**Reviewed By:** AI Code Review Assistant
**Next Review:** After implementing critical fixes



Review summary
Created CODE_REVIEW.md with 30 issues across:
Critical security issues (8)
Hardcoded session secret fallback
Missing input validation
Path traversal vulnerability
No rate limiting
Missing CORS origin validation
JWT secret not validated
Sensitive data in logs
No file type validation
High priority (7)
Multiple Prisma client instances
Missing error handling
Missing authorization checks
Circular dependency risk in folder moves
Unused/dead code
No request size limits
Missing transaction handling
Medium priority (9)
Inconsistent error messages
No request ID tracking
Magic numbers
No health check endpoint
Missing API documentation
And more...
Low priority / code quality (6)
Inconsistent code style
No TypeScript
Large controller files
Missing unit tests
Console.log instead of logger
Positive aspects
Good separation of concerns
Uses Prisma ORM
Proper async/await usage
JWT authentication
Google OAuth integration
Good folder structure
Next steps
Review backend/CODE_REVIEW.md for details
Prioritize critical security fixes
Implement fixes incrementally
Add tests and documentation
The review document includes code examples and fixes for each issue. Should I start implementing any of these fixes?












