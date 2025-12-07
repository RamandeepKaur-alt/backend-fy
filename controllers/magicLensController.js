import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { 
  PATTERNS, matchFirstPattern, extractMatches, scoreSentence, HTML, 
  DOC_TYPE_PATTERNS, extractConcepts, detectDocType, extractPurpose,
  preprocessText, extractProblemSummaries
} from "../utils/summaryHelpers.js";

// Dynamic import for pdf-parse v2.4.5 (uses PDFParse class)
let PDFParseClass = null;
async function loadPdfParse() {
  if (PDFParseClass === null) {
    try {
      const pdfModule = await import("pdf-parse");
      // pdf-parse v2.4.5 exports PDFParse class
      if (pdfModule.PDFParse) {
        PDFParseClass = pdfModule.PDFParse;
        console.log("pdf-parse PDFParse class loaded successfully");
      } else {
        console.error("PDFParse class not found in pdf-parse module");
        PDFParseClass = false;
      }
    } catch (e) {
      console.error("pdf-parse import error:", e);
      console.error("Error stack:", e.stack);
      PDFParseClass = false;
    }
  }
  return PDFParseClass;
}

// Tesseract.js is optional - dynamically import when needed
let Tesseract = null;
async function loadTesseract() {
  if (Tesseract === null) {
    try {
      const tesseractModule = await import("tesseract.js");
      Tesseract = tesseractModule.default;
    } catch (e) {
      console.warn("Tesseract.js not installed. OCR will use fallback methods.");
      Tesseract = false; // Mark as attempted but failed
    }
  }
  return Tesseract;
}

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure temp directory exists
const tempDir = path.join(__dirname, "../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Extract text from PDF - OPTIMIZED
async function extractFromPDF(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`PDF not found: ${filePath}`);
    return "";
  }
  
  try {
    const pdf = await loadPdfParse();
    if (!pdf || pdf === false) return "";
    
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new pdf({ data: dataBuffer });
    const result = await parser.getText();
    
    if (result?.text?.trim()) {
      return result.text.trim();
    }
    
    // Try OCR for image-based PDFs
    const tesseract = await loadTesseract();
    if (tesseract && tesseract !== false) {
      try {
        const pdf2pic = (await import("pdf2pic")).default;
        const convert = pdf2pic.fromPath(filePath, {
          density: 300,
          saveFilename: "page",
          savePath: tempDir,
          format: "png",
        });
        
        const pageImage = await convert(1, { responseType: "image" });
        const { data: { text } } = await tesseract.recognize(pageImage.path, "eng");
        
        try { fs.unlinkSync(pageImage.path); } catch (e) {}
        
        return text?.trim() || "";
      } catch (ocrError) {
        console.error("PDF OCR error:", ocrError);
        return "";
      }
    }
    
    return "";
  } catch (error) {
    console.error("PDF extraction error:", error);
    return "";
  }
}

// Extract text from Word documents - OPTIMIZED
async function extractFromWord(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Word file not found: ${filePath}`);
    return "";
  }
  
  try {
    const mammoth = (await import("mammoth")).default;
    
    // Try extractRawText first (faster)
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      if (result?.value?.trim()) return result.value.trim();
    } catch (rawTextError) {
      // Fallback: convert to HTML and extract text
      const htmlResult = await mammoth.convertToHtml({ path: filePath });
      const extractedText = htmlResult.value
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (extractedText) return extractedText;
    }
    
    return "";
  } catch (error) {
    console.error("Word extraction error:", error);
    return "";
  }
}

// OCR function to extract text from images and PDFs
async function extractTextFromFile(filePath, mimetype) {
  try {
    if (mimetype.startsWith("image/")) {
      // Use Tesseract for image OCR
      const tesseract = await loadTesseract();
      if (tesseract && tesseract !== false) {
        try {
          console.log("Extracting text from image using OCR...");
          const { data: { text } } = await tesseract.recognize(filePath, "eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
              }
            },
          });
          const ocrText = text.trim();
          if (ocrText && ocrText.length > 10) {
            return ocrText;
          }
          return ""; // Return empty to trigger fallback summary
        } catch (ocrError) {
          console.error("Tesseract OCR Error:", ocrError);
          return ""; // Return empty to trigger fallback summary
        }
      } else {
        return ""; // Return empty to trigger fallback summary
      }
    } else if (mimetype === "application/pdf") {
      return await extractFromPDF(filePath);
    } else if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || filePath.endsWith(".docx")) {
      return await extractFromWord(filePath);
    } else if (filePath.endsWith(".doc")) {
      console.warn("Legacy .doc format - cannot extract");
      return "";
    } else if (mimetype === "text/plain" || mimetype.includes("text")) {
      return fs.readFileSync(filePath, "utf-8");
    } else {
      try {
        const text = fs.readFileSync(filePath, "utf-8");
        return text && text.trim().length > 10 ? text.trim() : "";
      } catch (e) {
        return "";
      }
    }
  } catch (error) {
    console.error("Text Extraction Error:", error);
    throw new Error(`Failed to extract text from file: ${error.message}`);
  }
}

// Check if extracted text is actually an error message or invalid
function isErrorMessage(text) {
  if (!text || text.trim().length === 0) return true;
  
  // Only check for actual error messages, not short text (short text might be valid)
  const errorPatterns = [
    "extraction failed",
    "cannot extract text",
    "text extraction failed",
    "might be corrupted",
    "ocr processing failed",
    "no text extracted from",
    "unsupported file type - cannot extract",
    "failed to extract text from file",
    "please ensure mammoth is installed",
    "please ensure tesseract.js",
    "install pdf-parse",
    "install tesseract.js",
    "detected but text extraction failed",
    "detected but no text found"
  ];
  const lowerText = text.toLowerCase();
  // Only return true if it's clearly an error message (contains multiple error keywords or specific error phrases)
  const matches = errorPatterns.filter(pattern => lowerText.includes(pattern));
  return matches.length > 0;
}

// AI Analysis function - using LLaMA 3.1 8B or Qwen 4B
async function analyzeWithAI(extractedText, fileName, mimetype) {
  try {
    // Check if the extracted text is actually an error message
    const isError = isErrorMessage(extractedText);
    
    // Detect file type based on content and name
    const fileType = detectFileType(extractedText, fileName, mimetype);
    
    let summary, keyPoints;
    
    if (isError) {
      // Generate a meaningful summary based on file metadata when extraction fails
      summary = generateFallbackSummary(fileName, fileType, mimetype, extractedText);
      keyPoints = generateFallbackKeyPoints(fileName, fileType, mimetype);
    } else {
      // Generate summary from actual extracted text
      summary = generateSummary(extractedText, fileType);
      keyPoints = []; // Key points are now included in summary
    }
    
    return {
      summary,
      keyPoints: [], // Remove key points - not needed
      fileType,
      confidence: isError ? 0.65 : 0.85, // Lower confidence for fallback summaries
    };
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw new Error("Failed to analyze content with AI");
  }
}

// Detect file type - simplified (uses detectDocType from helpers)
function detectFileType(text, fileName, mimetype) {
  return detectDocType(text, fileName, mimetype);
}

// Generate fallback summary when text extraction fails
function generateFallbackSummary(fileName, fileType, mimetype, errorMessage) {
  const fileNameLower = fileName.toLowerCase();
  
  // Try to infer content from filename
  if (fileNameLower.includes("result") || fileNameLower.includes("grade") || fileNameLower.includes("marks")) {
    return `This appears to be an academic result or grade document (${fileType}). The file contains structured information that may include student grades, course results, or academic performance data. While the exact content couldn't be extracted automatically, the filename suggests it contains academic records.`;
  }
  
  if (fileNameLower.includes("bill") || fileNameLower.includes("invoice") || fileNameLower.includes("receipt")) {
    return `This appears to be a financial document (${fileType}) such as a bill, invoice, or receipt. The file likely contains transaction details, amounts, dates, and vendor information. While automatic text extraction wasn't successful, this type of document typically includes payment information and transaction records.`;
  }
  
  if (fileNameLower.includes("id") || fileNameLower.includes("license") || fileNameLower.includes("passport")) {
    return `This appears to be an identification document (${fileType}). The file likely contains personal identification information such as name, date of birth, identification numbers, or license details. This type of document requires secure handling and may contain sensitive personal information.`;
  }
  
  if (fileNameLower.includes("report") || fileNameLower.includes("analysis")) {
    return `This appears to be a report or analysis document (${fileType}). The file likely contains structured information, data analysis, findings, or conclusions. Reports typically include sections with headings, data tables, and summary information.`;
  }
  
  if (fileNameLower.includes("note") || fileNameLower.includes("memo")) {
    return `This appears to be a note or memo document (${fileType}). The file likely contains brief written information, reminders, or informal documentation. Notes are typically shorter documents with informal or structured text content.`;
  }
  
  // Generic fallback based on file type
  if (mimetype === "application/pdf") {
    return `This is a PDF document (${fileType}). PDFs can contain text, images, forms, or a combination. While automatic text extraction wasn't successful, the file may contain image-based content, scanned documents, or require special processing. The document appears to be intact and accessible.`;
  }
  
  if (mimetype.startsWith("image/")) {
    return `This is an image file (${fileType}). The image may contain text, diagrams, photos, or graphics. While automatic text extraction (OCR) wasn't available or successful, the image file is valid and may contain visual information, charts, or text that requires manual review.`;
  }
  
  return `This is a ${fileType} document. While automatic text extraction wasn't successful, the file appears to be valid and accessible. The document may contain structured data, images, or content that requires specialized processing to extract.`;
}

// Generate fallback key points when text extraction fails
function generateFallbackKeyPoints(fileName, fileType, mimetype) {
  const keyPoints = [];
  const fileNameLower = fileName.toLowerCase();
  
  // Add file type information
  keyPoints.push(`File Type: ${fileType}`);
  
  // Add filename-based insights
  if (fileNameLower.includes("result") || fileNameLower.includes("grade")) {
    keyPoints.push("Document appears to contain academic or performance records");
    keyPoints.push("May include grades, scores, or academic assessment data");
  } else if (fileNameLower.includes("bill") || fileNameLower.includes("invoice")) {
    keyPoints.push("Document appears to be a financial transaction record");
    keyPoints.push("May contain payment amounts, dates, and vendor information");
  } else if (fileNameLower.includes("report")) {
    keyPoints.push("Document appears to be a structured report or analysis");
    keyPoints.push("May contain data, findings, or summary information");
  } else {
    keyPoints.push("Document file is accessible and valid");
  }
  
  // Add format-specific information
  if (mimetype === "application/pdf") {
    keyPoints.push("PDF format - may contain text, images, or scanned content");
  } else if (mimetype.startsWith("image/")) {
    keyPoints.push("Image format - may contain visual content or text requiring OCR");
  }
  
  keyPoints.push("Automatic text extraction was not available or successful");
  keyPoints.push("File may require manual review or specialized processing");
  
  return keyPoints.slice(0, 6); // Limit to 6 key points
}

// Preprocess text - now uses helper function

// Generate intelligent summary - OPTIMIZED
function generateSummary(text, fileType) {
  if (!text || text.trim().length === 0) {
    return `This appears to be a ${fileType}, but no readable text was extracted. The file might be image-based or require OCR processing.`;
  }
  
  const cleanText = preprocessText(text);
  const lines = cleanText.split(/\n+/).filter(line => line.trim().length > 0);
  const detectedType = detectDocType(cleanText, '', fileType);
  const lowerText = cleanText.toLowerCase();
  
  // Check if study material
  const isStudyMaterial = detectedType.includes("Assignment") || detectedType.includes("Problem") || 
      detectedType.includes("Notes") || detectedType.includes("Study") ||
      lowerText.includes("question") || lowerText.includes("problem") ||
      lowerText.includes("solve") || lowerText.includes("algorithm");
  
  return isStudyMaterial 
    ? generateStudyMaterialSummary(cleanText, detectedType, lines)
    : formatStandardSummary(cleanText, detectedType, lines);
}

// Generate summary for study materials - OPTIMIZED
function generateStudyMaterialSummary(text, docType, lines) {
  const lowerText = text.toLowerCase();
  const isDSA = /(?:dsa|data\s+structure|algorithm|divide\s+and\s+conquer|merge\s+sort|binary\s+search|dynamic\s+programming|graph|tree|array|string)/i.test(text);
  
  const topicMatch = text.match(/(?:topic|subject|theme|chapter)[:\s]*([A-Z][^•\n]{10,60})/i) ||
                     text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:QUESTIONS|PROBLEMS|ASSIGNMENT)/);
  const topic = topicMatch ? topicMatch[1].trim() : (isDSA ? 'Data Structures & Algorithms' : 'Study Material');
  
  const questionCount = (text.match(/(?:question|problem)\s*\d+/gi) || []).length;
  const hasQuestions = questionCount > 0 || /(?:question|problem|exercise|practice|assignment)/i.test(lowerText);
  const difficulties = [...new Set((text.match(PATTERNS.difficulty) || []).map(d => d.toLowerCase()))];
  const concepts = extractConcepts(text);
  const problems = extractProblemSummaries(text, lines);
  
  // Build intelligent summary
  let summary = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.8; color: #1f2937;">`;
  
  // Document Type Badge & Overview - OPTIMIZED
  summary += HTML.badge(`📚 ${docType || 'Study Material'}`);
  
  let overview = `This document contains `;
  if (questionCount > 0) overview += `${questionCount} ${questionCount === 1 ? 'problem' : 'problems'}`;
  else if (hasQuestions) overview += `multiple problems/questions`;
  else overview += `study material`;
  
  if (topic && topic !== 'Study Material') overview += ` on <strong>${topic}</strong>`;
  if (difficulties.length > 0) overview += ` with difficulty levels: ${difficulties.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}`;
  if (isDSA) overview += `. The content focuses on Data Structures and Algorithms concepts`;
  overview += `.`;
  
  summary += HTML.section('📄 Document Overview', HTML.box(overview));
  
  // Problems/Questions Section - OPTIMIZED
  if (problems.length > 0) {
    const problemsHtml = problems.map((p, i) => 
      HTML.problem(`${i + 1}`, p.title, p.difficulty, p.description, p.example, p.hint)
    ).join('');
    summary += HTML.section('Problems & Questions', problemsHtml, '📋');
  }
  
  // Key Concepts Section - OPTIMIZED
  if (concepts.length > 0) {
    const conceptsHtml = concepts.map(c => 
      `<span style="background: linear-gradient(135deg, #9bc4a8, #7ab39a); color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500;">${c}</span>`
    ).join('');
    summary += HTML.section('🔑 Key Concepts', `<div style="display: flex; flex-wrap: wrap; gap: 10px;">${conceptsHtml}</div>`);
  }
  
  // Summary/Insights - OPTIMIZED
  let insights = isDSA 
    ? `This document covers <strong>${topic}</strong> problems that require understanding of core algorithms and data structures. ` +
      (difficulties.includes('hard') ? `The problems progress from basic to advanced concepts, with the hardest requiring deep algorithmic thinking. ` : '') +
      (concepts.some(c => /merge|sort|divide/i.test(c)) ? `Divide and Conquer approach is central to solving these problems, particularly Merge Sort for sorting and inversion counting. ` : '') +
      `Practice these problems to strengthen problem-solving skills and algorithmic thinking.`
    : `This study material contains ${questionCount || 'multiple'} ${questionCount === 1 ? 'question' : 'questions'} covering ${topic}. Review the examples and practice solving to master the concepts.`;
  
  summary += HTML.section('💡 Summary & Insights', HTML.box(insights, '#f0f9ff', '#3b82f6'), '');
  
  summary += `</div>`;
  return summary;
}

// Extract key concepts - uses helper (already includes algorithm extraction)
function extractKeyConcepts(text) {
  return extractConcepts(text);
}

// extractProblemSummaries is imported from summaryHelpers.js - removed duplicate

// Format standard summary for non-study materials
// Format standard summary - OPTIMIZED using HTML helpers
function formatStandardSummary(text, detectedType, lines) {
  const purpose = extractPurpose(text, detectedType);
  const keyHighlights = extractKeyHighlights(text, detectedType, lines);
  const importantData = extractImportantData(text, detectedType, lines);
  const actionItems = extractActionItems(text, detectedType, lines);
  const conclusion = generateConclusion(text, detectedType, purpose);
  
  let summary = HTML.container();
  summary += HTML.badge(detectedType);
  summary += HTML.section('Purpose of the Document', HTML.box(purpose), '📄');
  
  const highlightsHtml = keyHighlights.split('\n\n').filter(h => h.trim())
    .map(h => HTML.highlight(h.trim())).join('') || '<p style="color: #6b7280; font-style: italic;">Key highlights extracted from the document.</p>';
  summary += HTML.section('Key Highlights', highlightsHtml, '✨');
  
  if (importantData && importantData.trim()) {
    const dataHtml = importantData.split('\n').filter(d => d.trim()).slice(0, 8)
      .map(d => HTML.data(d.trim())).join('');
    summary += HTML.section('Important Data & Metrics', dataHtml, '📊');
  }
  
  const actionsHtml = actionItems.split('\n').filter(item => item.trim())
    .map(item => HTML.action(item.trim())).join('') || '<p style="color: #6b7280; font-style: italic;">Review the document for specific action items.</p>';
  summary += HTML.section('Recommendations & Action Items', actionsHtml, '✅');
  
  summary += HTML.section('Conclusion', HTML.box(conclusion, '#f0f9ff', '#3b82f6'), '📝');
  summary += `</div>`;
  return summary;
}

// Uses detectDocType and extractPurpose from helpers - removed duplicates

// Extract key highlights / major points (4-6 bullets) - IMPROVED
function extractKeyHighlights(text, docType, lines) {
  const bullets = [];
  const lowerText = text.toLowerCase();
  
  // For resumes/CVs - OPTIMIZED
  if (docType.includes("Resume") || docType.includes("CV") || docType.includes("Curriculum Vitae")) {
    const nameMatch = matchFirstPattern(text, PATTERNS.name);
    const roleMatch = text.match(/(?:full.?stack|front.?end|back.?end|software|developer|engineer|designer|manager|analyst|data\s+scientist|product\s+manager)[\s\w]*|(?:position|role|title|designation)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    
    if (nameMatch && roleMatch) {
      bullets.push(`${nameMatch[1]} is a ${roleMatch[1] || roleMatch[0]} professional with demonstrated expertise and relevant experience.`);
    } else if (nameMatch) {
      bullets.push(`Professional profile for ${nameMatch[1]}, showcasing qualifications and experience.`);
    }
    
    const summaryMatch = matchFirstPattern(text, [
      /(?:professional\s+summary|summary|about|profile|overview)[:\s]*([^•\n]{100,300})/i,
      /(?:objective|career\s+objective)[:\s]*([^•\n]{80,250})/i
    ]);
    if (summaryMatch) {
      const summary = summaryMatch[1].trim().replace(/\s+/g, ' ').substring(0, 220);
      bullets.push(summary + (summary.length < summaryMatch[1].trim().length ? "..." : ""));
    }
    
    const skillsMatch = matchFirstPattern(text, [
      /(?:technical\s+skills|skills|technologies|proficient\s+in|expertise\s+in)[:\s]*([^•\n]{80,400})/i,
      /(?:programming\s+languages|tools|frameworks)[:\s]*([^•\n]{80,300})/i
    ]);
    if (skillsMatch) {
      const skills = skillsMatch[1].split(/[,|•\n;]/).filter(s => s.trim().length > 2).map(s => s.trim()).slice(0, 10).join(", ");
      if (skills.length > 20) bullets.push(`Technical expertise includes: ${skills}.`);
    }
    
    const expMatch = matchFirstPattern(text, PATTERNS.experience);
    if (expMatch) bullets.push(`Has ${expMatch[1]} years of professional experience in software development.`);
    
    const eduMatch = matchFirstPattern(text, [
      /(?:education|degree|bachelor|master|phd|b\.?tech|m\.?tech|b\.?e|m\.?e)[:\s]*([^•\n]{40,180})/i,
      /(?:university|college|institute)[:\s]*([^•\n]{30,150})/i
    ]);
    if (eduMatch) {
      const edu = eduMatch[1].trim().replace(/\s+/g, ' ').substring(0, 140);
      bullets.push(`Educational qualification: ${edu}.`);
    }
  }
  
  // For academic results
  else if (docType.includes("Academic") || docType.includes("Result")) {
    const yearMatch = text.match(/(\d{1,2}(?:st|nd|rd|th)?\s*(?:year|semester|sem))/i);
    if (yearMatch) bullets.push(`Academic performance record for ${yearMatch[1]}.`);
    
    const instLines = lines.filter(l => /(university|college|institute|school)/i.test(l));
    if (instLines.length > 0) {
      const instName = instLines[0].substring(0, 120).trim();
      bullets.push(`Institution: ${instName}.`);
    }
    
    const cgpaMatch = text.match(/cgpa[:\s]*([\d.]+)/i);
    const percentageMatch = text.match(/(?:percentage|%|percent)[:\s]*([\d.]+)/i);
    if (cgpaMatch) bullets.push(`Overall CGPA: ${cgpaMatch[1]}.`);
    if (percentageMatch) bullets.push(`Overall Percentage: ${percentageMatch[1]}%.`);
    
    const subjectLines = lines.filter(l => /\d+\s+(?:marks|grade|credit)/i.test(l));
    if (subjectLines.length > 0) {
      bullets.push(`Comprehensive results across ${subjectLines.length} or more subjects/courses.`);
    }
  }
  
  // For financial documents
  else if (docType.includes("Financial")) {
    const totalMatch = text.match(/(?:total|amount|sum)[:\s]*\$?([\d,]+\.?\d*)/i);
    if (totalMatch) bullets.push(`Total transaction amount: ${totalMatch[1]}.`);
    
    const dateMatch = text.match(/(?:date|on|issued)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (dateMatch) bullets.push(`Transaction date: ${dateMatch[1]}.`);
    
    bullets.push(`Document contains itemized billing and payment details.`);
    
    const vendorMatch = text.match(/(?:vendor|merchant|from|to)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (vendorMatch) bullets.push(`Transaction party: ${vendorMatch[1]}.`);
  }
  
  // For employment documents
  else if (docType.includes("Employment")) {
    const ctcMatch = text.match(/(?:ctc|salary|package)[:\s]*\$?([\d,]+)/i);
    if (ctcMatch) bullets.push(`Compensation package: ${ctcMatch[1]}.`);
    
    const positionMatch = text.match(/(?:position|role|designation)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (positionMatch) bullets.push(`Position offered: ${positionMatch[1]}.`);
    
    const startMatch = text.match(/(?:start|joining|commencement)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (startMatch) bullets.push(`Start date: ${startMatch[1]}.`);
  }
  
  // Generic extraction - OPTIMIZED
  else {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 30 && s.length < 300);
    const scoredSentences = sentences.map(s => ({ sentence: s, score: scoreSentence(s) }));
    const topSentences = scoredSentences.sort((a, b) => b.score - a.score).slice(0, 6).filter(item => item.score > 0);
    
    topSentences.forEach(item => {
      const trimmed = item.sentence.substring(0, 220);
      bullets.push(trimmed + (trimmed.length < item.sentence.length ? "..." : ""));
    });
    
    if (bullets.length === 0) {
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 50);
      paragraphs.slice(0, 4).forEach(para => {
        const firstSentence = para.split(/[.!?]+/)[0].trim();
        if (firstSentence.length > 40 && firstSentence.length < 200) {
          bullets.push(firstSentence.substring(0, 200));
        }
      });
    }
  }
  
  // Ensure we have at least something
  if (bullets.length === 0) {
    // Extract first meaningful sentence from document
    const firstMeaningful = text.split(/[.!?]+/)
      .find(s => s.trim().length > 50 && s.trim().length < 250);
    if (firstMeaningful) {
      bullets.push(firstMeaningful.trim().substring(0, 200));
    } else {
      bullets.push("Key information extracted from the document. Review the full document for complete details.");
    }
  }
  
  return bullets.slice(0, 6).join("\n\n");
}

// REMOVED: extractCoreSummary - DEPRECATED, functionality merged into extractKeyHighlights

// Extract important data / metrics
function extractImportantData(text, docType, lines) {
  const data = [];
  
  // For resumes/CVs
  if (docType.includes("Resume") || docType.includes("CV") || docType.includes("Curriculum Vitae")) {
    // Extract years of experience
    const expMatch = text.match(/(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i);
    if (expMatch) data.push(`Years of Experience: ${expMatch[1]}`);
    
    // Extract key metrics from projects/achievements
    const metricsPattern = /(?:achieved|delivered|improved|reduced|increased)[^.!?]{0,100}/gi;
    const metrics = [...text.matchAll(metricsPattern)];
    metrics.slice(0, 3).forEach(match => {
      const metric = match[0].trim().substring(0, 120);
      data.push(metric);
    });
  }
  
  // For academic results - OPTIMIZED
  else if (docType.includes("Academic")) {
    const cgpaMatch = matchFirstPattern(text, [/cgpa[:\s]*([\d.]+)/i, /(?:overall\s+)?cgpa[:\s]*([\d.]+)/i]);
    if (cgpaMatch) data.push(`Overall CGPA: ${cgpaMatch[1]}`);
    
    const percentageMatch = matchFirstPattern(text, [
      /(?:overall\s+)?(?:percentage|%|percent)[:\s]*([\d.]+)/i,
      /(?:total\s+)?marks[:\s]*(\d+)\s*\/\s*(\d+)/i
    ]);
    if (percentageMatch) {
      if (percentageMatch[2]) {
        const percentage = ((parseFloat(percentageMatch[1]) / parseFloat(percentageMatch[2])) * 100).toFixed(2);
        data.push(`Overall Percentage: ${percentage}%`);
      } else {
        data.push(`Overall Percentage: ${percentageMatch[1]}%`);
      }
    }
    
    const nameMatch = text.match(/(?:student\s+name|name\s+of\s+student|name)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);
    if (nameMatch) data.push(`Student Name: ${nameMatch[1]}`);
    
    const instMatch = text.match(/(?:university|college|institute|school)[:\s]*([A-Z][^•\n]{20,80})/i);
    if (instMatch) data.push(`Institution: ${instMatch[1].trim().substring(0, 80)}`);
    
    const scores = extractMatches(text, /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)[:\s]*([\d,]+\.?\d*)\s*(?:marks|grade|percentage|%|cgpa|sgpa|credit)/gi, 6);
    scores.forEach(match => {
      const parts = match.split(/[:\s]+/);
      if (parts.length >= 2) data.push(`${parts[0]}: ${parts[1]}`);
    });
  }
  
  // For financial documents
  else if (docType.includes("Financial")) {
    const moneyPattern = /(?:rs\.?|₹|\$|usd|inr)[:\s]*([\d,]+\.?\d*)/gi;
    const amounts = [...text.matchAll(moneyPattern)];
    amounts.slice(0, 5).forEach(match => data.push(`Amount: ${match[1]}`));
    
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
    const dates = [...text.matchAll(datePattern)];
    if (dates.length > 0) {
      const uniqueDates = [...new Set(dates.map(m => m[1]))];
      uniqueDates.slice(0, 2).forEach(date => data.push(`Date: ${date}`));
    }
  }
  
  // Generic extraction
  else {
    // Extract dates
    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
    const dates = [...text.matchAll(datePattern)];
    if (dates.length > 0) {
      const uniqueDates = [...new Set(dates.map(m => m[1]))];
      uniqueDates.slice(0, 3).forEach(date => data.push(`Date: ${date}`));
    }
    
    // Extract numbers with context
    const numberPattern = /([\d,]+\.?\d*)\s*(?:percent|%|years?|months?|days?|hours?)/gi;
    const numbers = [...text.matchAll(numberPattern)];
    numbers.slice(0, 5).forEach(match => data.push(match[0]));
  }
  
  return data.slice(0, 10).join("\n") || "";
}

// REMOVED: extractKeyData - DEPRECATED, functionality merged into extractImportantData
// REMOVED: extractStructureOverview - UNUSED

// Extract action items / recommendations - OPTIMIZED
function extractActionItems(text, docType, lines) {
  const actions = [];
  const actionMap = {
    "Resume": () => [
      "Review and tailor resume content for specific job applications.",
      "Ensure all contact information and professional links are current.",
      "Highlight most relevant projects and achievements based on target role."
    ],
    "Academic": () => {
      const actions = [];
      const cgpaMatch = text.match(PATTERNS.cgpa);
      if (cgpaMatch) {
        const cgpa = parseFloat(cgpaMatch[1]);
        if (cgpa >= 8.0) actions.push("Maintain current academic performance standards.");
        else if (cgpa >= 7.0) actions.push("Identify areas for improvement and develop action plan.");
        else actions.push("Implement focused study strategies to improve performance.");
      }
      actions.push("Retain this document as official academic record.");
      return actions;
    },
    "Financial": () => {
      const actions = ["Verify all transaction amounts and itemized details for accuracy.", "Retain document for accounting records and tax documentation."];
      const dueMatch = text.match(/(?:due|pay by)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (dueMatch) actions.push(`Process payment by due date: ${dueMatch[1]}.`);
      return actions;
    },
    "Employment": () => [
      "Review all terms, conditions, and compensation details thoroughly before acceptance.",
      "Confirm start date, reporting structure, and onboarding requirements with HR.",
      "Retain signed copy for personal records and future reference."
    ],
    "Legal": () => {
      const actions = [
        "Review all clauses and terms with legal counsel if necessary.",
        "Ensure all parties understand obligations and responsibilities."
      ];
      const deadlineMatch = text.match(/(?:deadline|expires|valid until)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (deadlineMatch) actions.push(`Note important deadline: ${deadlineMatch[1]}.`);
      return actions;
    }
  };
  
  for (const [key, fn] of Object.entries(actionMap)) {
    if (docType.includes(key)) {
      actions.push(...fn());
      break;
    }
  }
  
  // Generic fallback
  if (actions.length === 0) {
    const deadlineMatch = text.match(/(?:deadline|due date|expires)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (deadlineMatch) actions.push(`Note important deadline: ${deadlineMatch[1]}.`);
    actions.push("Review document content thoroughly for accuracy and completeness.");
    actions.push("Retain document for records and future reference as appropriate.");
  }
  
  return actions.join("\n") || "No specific action items identified.";
}

// Generate conclusion / final remarks (2-3 lines)
function generateConclusion(text, docType, purpose) {
  const lowerText = text.toLowerCase();
  const lines = text.split(/\n/).filter(l => l.trim().length > 10);
  
  // For resumes/CVs
  if (docType.includes("Resume") || docType.includes("CV") || docType.includes("Curriculum Vitae")) {
    const nameMatch = text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    const roleMatch = text.match(/(?:full.?stack|front.?end|back.?end|software|developer|engineer|designer|manager|analyst)[\s\w]*/i);
    const name = nameMatch ? nameMatch[1] : "the candidate";
    const role = roleMatch ? roleMatch[0] : "professional";
    return `This document presents the professional profile of ${name}, a ${role} with demonstrated technical expertise and relevant experience. The resume is structured for job applications and highlights key qualifications, skills, and achievements suitable for employment opportunities in the technology sector.`;
  }
  
  // For academic results
  else if (docType.includes("Academic")) {
    const yearMatch = text.match(/(\d{1,2}(?:st|nd|rd|th)?\s*(?:year|semester))/i);
    const cgpaMatch = text.match(/cgpa[:\s]*([\d.]+)/i);
    const year = yearMatch ? yearMatch[1] : "the academic period";
    const cgpa = cgpaMatch ? ` with an overall CGPA of ${cgpaMatch[1]}` : "";
    return `This document serves as an official academic transcript for ${year}${cgpa}, providing a comprehensive record of student performance across multiple subjects and courses. The document should be retained as an official record for future academic or professional applications and verifications.`;
  }
  
  // For financial documents
  else if (docType.includes("Financial")) {
    const totalMatch = text.match(/(?:total|amount)[:\s]*\$?([\d,]+\.?\d*)/i);
    const total = totalMatch ? ` with a total transaction value of ${totalMatch[1]}` : "";
    return `This financial document records transaction details${total}, including itemized billing, payment information, and relevant dates. The document is essential for accounting purposes, tax documentation, and maintaining accurate financial records.`;
  }
  
  // For employment documents
  else if (docType.includes("Employment")) {
    return `This employment document formally outlines job offer details including position designation, compensation package, and terms of employment. All conditions and requirements should be reviewed thoroughly before making a decision regarding acceptance of the offer.`;
  }
  
  // For agreements/contracts
  else if (docType.includes("Legal") || docType.includes("Agreement")) {
    return `This legal document establishes the terms, conditions, rights, and obligations between the involved parties. All parties should ensure complete understanding of the agreement's provisions and seek legal counsel if necessary before execution.`;
  }
  
  // Generic conclusion
  else {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 40 && s.trim().length < 250);
    const meaningfulSentences = sentences
      .filter(s => {
        const trimmed = s.trim();
        return !trimmed.includes("@") && !trimmed.includes("http") && trimmed.length > 50;
      })
      .slice(0, 2);
    
    if (meaningfulSentences.length > 0) {
      const summary1 = meaningfulSentences[0].trim().substring(0, 180);
      const summary2 = meaningfulSentences[1] ? meaningfulSentences[1].trim().substring(0, 180) : "";
      let conclusion = summary1 + (summary1.length < meaningfulSentences[0].trim().length ? "..." : "");
      if (summary2) {
        conclusion += " " + summary2 + (summary2.length < meaningfulSentences[1].trim().length ? "..." : "");
      }
      return conclusion + " This document contains important information that requires careful review and appropriate action.";
    }
    
    return `${purpose.substring(0, 150)}${purpose.length > 150 ? "..." : ""} This document should be reviewed thoroughly to ensure all relevant information is understood and appropriate actions are taken as necessary.`;
  }
}

// REMOVED: extractKeyPoints - DEPRECATED, functionality merged into extractKeyHighlights

// Analyze uploaded file directly (temporary, doesn't save to database)
export const analyzeUploadedFile = async (req, res) => {
  let tempFilePath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.user.id;
    // req.file.path from multer is the full path to the uploaded file
    tempFilePath = req.file.path;
    const fileName = req.file.originalname;
    const fileMimetype = req.file.mimetype;

    console.log(`Analyzing uploaded file: ${fileName}`);
    console.log(`File path: ${tempFilePath}`);
    console.log(`File mimetype: ${fileMimetype}`);

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      console.error(`File not found at path: ${tempFilePath}`);
      return res.status(404).json({ error: "File not found on server" });
    }

    console.log(`File exists, size: ${fs.statSync(tempFilePath).size} bytes`);

    // Extract text using OCR
    const extractedText = await extractTextFromFile(tempFilePath, fileMimetype);
    
    console.log(`Extracted text length: ${extractedText ? extractedText.length : 0}`);
    if (extractedText && extractedText.length > 0) {
      console.log(`First 500 chars of extracted text: ${extractedText.substring(0, 500)}`);
    } else {
      console.warn("No text was extracted from the file!");
    }

    // Generate summary using AI
    const analysis = await analyzeWithAI(extractedText, fileName, fileMimetype);

    // Delete temporary file immediately after analysis
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`Temporary file deleted: ${tempFilePath}`);
      }
    } catch (deleteErr) {
      console.error(`Failed to delete temporary file: ${deleteErr.message}`);
      // Continue even if deletion fails
    }

    res.json({ analysis });

  } catch (error) {
    console.error("Magic Lens analysis error:", error);
    
    // Clean up temporary file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`Temporary file deleted after error: ${tempFilePath}`);
      } catch (deleteErr) {
        console.error(`Failed to delete temporary file after error: ${deleteErr.message}`);
      }
    }
    
    res.status(500).json({ 
      error: error.message || "Failed to analyze file",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

// Analyze file with Magic Lens (from database)
export const analyzeFile = async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const userId = req.user.id;

    // Get file from database
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Check if already analyzed
    if (file.magicLensAnalyzedAt) {
      return res.json({
        analysis: {
          summary: file.magicLensSummary || "",
          keyPoints: file.magicLensKeyPoints ? JSON.parse(file.magicLensKeyPoints) : [],
          fileType: file.magicLensFileType || "Document",
          confidence: file.magicLensConfidence || 0,
        },
        cached: true,
      });
    }

    // Get file path - file.url is like "/uploads/filename.ext"
    // Remove leading slash and join with project root
    const fileUrl = file.url.startsWith("/") ? file.url.substring(1) : file.url;
    const filePath = path.join(__dirname, "..", fileUrl);

    console.log(`Analyzing file: ${file.name}`);
    console.log(`File URL: ${file.url}`);
    console.log(`File path: ${filePath}`);
    console.log(`File mimetype: ${file.mimetype}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found at path: ${filePath}`);
      console.error(`__dirname: ${__dirname}`);
      console.error(`Resolved path: ${path.resolve(filePath)}`);
      return res.status(404).json({ error: "File not found on server" });
    }

    console.log(`File exists, size: ${fs.statSync(filePath).size} bytes`);

    // Extract text using OCR
    const extractedText = await extractTextFromFile(filePath, file.mimetype);
    
    console.log(`Extracted text length: ${extractedText ? extractedText.length : 0}`);
    if (extractedText && extractedText.length > 0) {
      console.log(`First 500 chars of extracted text: ${extractedText.substring(0, 500)}`);
    } else {
      console.warn("No text was extracted from the file!");
    }

    // Analyze with AI
    const analysis = await analyzeWithAI(extractedText, file.name, file.mimetype);

    // Save analysis to database
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: {
        magicLensSummary: analysis.summary,
        magicLensKeyPoints: JSON.stringify(analysis.keyPoints),
        magicLensFileType: analysis.fileType,
        magicLensConfidence: analysis.confidence,
        magicLensAnalyzedAt: new Date(),
      },
    });

    res.json({
      analysis: {
        summary: analysis.summary,
        keyPoints: analysis.keyPoints,
        fileType: analysis.fileType,
        confidence: analysis.confidence,
      },
      cached: false,
    });
  } catch (error) {
    console.error("Magic Lens Error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze file" });
  }
};

// Get analysis for a file
export const getAnalysis = async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const userId = req.user.id;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    if (file.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    if (!file.magicLensAnalyzedAt) {
      return res.status(404).json({ error: "File has not been analyzed yet" });
    }

    res.json({
      analysis: {
        summary: file.magicLensSummary || "",
        keyPoints: file.magicLensKeyPoints ? JSON.parse(file.magicLensKeyPoints) : [],
        fileType: file.magicLensFileType || "Document",
        confidence: file.magicLensConfidence || 0,
      },
    });
  } catch (error) {
    console.error("Get Analysis Error:", error);
    res.status(500).json({ error: error.message || "Failed to get analysis" });
  }
};

