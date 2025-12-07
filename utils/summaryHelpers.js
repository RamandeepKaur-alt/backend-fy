/**
 * Optimized Helper utilities for Magic Lens summarization
 * Consolidated patterns, formatting, and extraction logic
 */

// Common regex patterns
export const PATTERNS = {
  name: [
    /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)/m,
    /Name[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i
  ],
  email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
  phone: /(?:phone|mobile|tel|contact)[:\s]*([+]?[\d\s\-()]{10,})/i,
  date: /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g,
  amount: /(?:₹|Rs\.?|\$|USD|INR)[:\s]*([\d,]+\.?\d*)/gi,
  cgpa: /cgpa[:\s]*([\d.]+)/i,
  percentage: /(?:percentage|%|percent)[:\s]*([\d.]+)/i,
  experience: [
    /(\d+)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)/i,
    /experience[:\s]*(\d+)\s*(?:years?|yrs?)/i
  ],
  difficulty: /(easy|medium|hard|difficult)/gi,
  question: /(?:question|problem)\s*(\d+)[:.\s]*([^•]{50,400})/gi
};

// Match first pattern that works
export function matchFirstPattern(text, patterns) {
  if (!Array.isArray(patterns)) patterns = [patterns];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
}

// Extract multiple matches
export function extractMatches(text, pattern, limit = 10) {
  const matches = [...text.matchAll(pattern)];
  return matches.slice(0, limit).map(m => m[1] || m[0]);
}

// Score sentence importance
export function scoreSentence(sentence) {
  let score = 0;
  const lower = sentence.toLowerCase();
  const trimmed = sentence.trim();
  
  if (/\d/.test(sentence)) score += 3;
  if (trimmed.length > 80 && trimmed.length < 200) score += 2;
  
  const keywords = ['important', 'key', 'summary', 'conclusion', 'result', 'total', 'amount', 'date', 'deadline', 'action'];
  keywords.forEach(keyword => {
    if (lower.includes(keyword)) score += 2;
  });
  
  if (trimmed.includes('@') || trimmed.includes('http')) score -= 5;
  if (trimmed.length < 40) score -= 2;
  if (trimmed.length > 250) score -= 1;
  
  return score;
}

// HTML formatting helpers
export const HTML = {
  container: () => `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.8; color: #1f2937;">`,
  
  badge: (text, icon = '') => `
    <div style="background: linear-gradient(135deg, #9bc4a8, #7ab39a); color: white; padding: 12px 20px; border-radius: 8px; display: inline-block; margin-bottom: 24px; font-weight: 600; font-size: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
      ${icon} ${text}
    </div>
  `,
  
  section: (title, content, icon = '') => `
    <div style="margin-bottom: 32px;">
      <h2 style="font-size: 22px; font-weight: 700; color: #1f2937; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #9bc4a8;">
        ${icon} ${title}
      </h2>
      ${content}
    </div>
  `,
  
  highlight: (text) => `
    <div style="margin-bottom: 14px; padding: 12px 16px; background: #f9fafb; border-radius: 6px; border-left: 3px solid #9bc4a8; color: #4b5563; font-size: 15px; line-height: 1.8;">
      <span style="color: #9bc4a8; font-weight: 600; margin-right: 8px;">•</span>${text}
    </div>
  `,
  
  data: (text) => `
    <div style="margin-bottom: 10px; padding: 10px 14px; background: #fef3c7; border-radius: 6px; color: #78350f; font-size: 14px; line-height: 1.7;">
      <strong>📊</strong> ${text}
    </div>
  `,
  
  action: (text) => `
    <div style="margin-bottom: 12px; padding: 12px 16px; background: #ecfdf5; border-radius: 6px; border-left: 3px solid #10b981; color: #065f46; font-size: 15px; line-height: 1.8;">
      <span style="color: #10b981; font-weight: 600; margin-right: 8px;">✓</span>${text}
    </div>
  `,
  
  box: (content, bgColor = '#f9fafb', borderColor = '#9bc4a8') => `
    <div style="background: ${bgColor}; padding: 16px; border-radius: 8px; border-left: 4px solid ${borderColor}; color: #4b5563; font-size: 15px; line-height: 1.8;">
      ${content}
    </div>
  `,
  
  problem: (number, title, difficulty, description, example, hint) => {
    const difficultyEmoji = difficulty === 'easy' ? '🟢' : difficulty === 'medium' ? '🟡' : difficulty === 'hard' ? '🔴' : '⚪';
    const difficultyColor = difficulty === 'easy' ? '#10b981' : difficulty === 'medium' ? '#f59e0b' : difficulty === 'hard' ? '#ef4444' : '#6b7280';
    
    let html = `
      <div style="margin-bottom: 20px; padding: 18px; background: #f9fafb; border-radius: 8px; border-left: 4px solid ${difficultyColor};">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
          <span style="font-size: 20px;">${number}️⃣</span>
          <span style="font-weight: 600; color: #1f2937; font-size: 16px;">${title}</span>
          ${difficulty ? `<span style="background: ${difficultyColor}; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${difficultyEmoji} ${difficulty.toUpperCase()}</span>` : ''}
        </div>
    `;
    
    if (description) {
      html += `<p style="color: #4b5563; font-size: 15px; margin: 8px 0; line-height: 1.8;">${description}</p>`;
    }
    
    if (example) {
      html += `
        <div style="margin-top: 12px; padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 3px solid #f59e0b;">
          <strong style="color: #78350f;">💡 Example:</strong>
          <div style="color: #78350f; font-size: 14px; margin-top: 6px; font-family: 'Courier New', monospace;">${example}</div>
        </div>
      `;
    }
    
    if (hint) {
      html += `
        <div style="margin-top: 8px; padding: 10px; background: #dbeafe; border-radius: 6px;">
          <strong style="color: #1e40af;">💭 Hint:</strong> <span style="color: #1e40af; font-size: 14px;">${hint}</span>
        </div>
      `;
    }
    
    html += `</div>`;
    return html;
  }
};

// Document type detection patterns
export const DOC_TYPE_PATTERNS = {
  resume: /(?:resume|cv|curriculum\s+vitae|professional\s+summary|work\s+experience|technical\s+skills)/i,
  academic: /(?:result|grade|marksheet|transcript|cgpa|sgpa)/i,
  financial: /(?:invoice|bill|receipt|payment|amount\s+due|total)/i,
  employment: /(?:offer\s+letter|appointment|ctc|salary|joining)/i,
  legal: /(?:agreement|contract|terms|clause|legal)/i,
  study: /(?:question|problem|solve|algorithm|assignment|note|formula)/i
};

// DSA Concepts
export const DSA_CONCEPTS = [
  'Merge Sort', 'Quick Sort', 'Binary Search', 'Divide and Conquer',
  'Dynamic Programming', 'Greedy Algorithm', 'Graph', 'Tree', 'Array',
  'String', 'Stack', 'Queue', 'Hash Table', 'Linked List', 'Heap',
  'Boyer-Moore', 'Inversion Count', 'Majority Element'
];

// Extract key concepts from text
export function extractConcepts(text) {
  const concepts = DSA_CONCEPTS.filter(concept => 
    new RegExp(concept.replace(/\s+/g, '[\\s-]+'), 'i').test(text)
  );
  
  const algoPattern = /(?:algorithm|method|approach|technique)[:\s]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi;
  const algoMatches = [...text.matchAll(algoPattern)];
  algoMatches.slice(0, 3).forEach(match => {
    if (!concepts.includes(match[1])) concepts.push(match[1]);
  });
  
  return concepts.slice(0, 8);
}

// Document type detection - consolidated
export function detectDocType(text, fileName, mimetype) {
  const lowerText = text.toLowerCase();
  const lowerName = fileName.toLowerCase();
  
  // Check patterns in order of specificity
  if (DOC_TYPE_PATTERNS.resume.test(text)) return "Resume / Curriculum Vitae (CV)";
  if (DOC_TYPE_PATTERNS.academic.test(text)) return "Academic Result / Grade Sheet / Transcript";
  if (DOC_TYPE_PATTERNS.financial.test(text)) return "Financial Document (Invoice/Bill/Receipt)";
  if (DOC_TYPE_PATTERNS.employment.test(text)) return "Employment Document (Offer Letter/Appointment Letter)";
  if (DOC_TYPE_PATTERNS.legal.test(text)) return "Legal Document (Agreement/Contract)";
  if (DOC_TYPE_PATTERNS.study.test(text)) return "Study Material / Questions";
  
  // Check by filename
  if (lowerName.includes("result") || lowerName.includes("grade")) return "Academic Result / Grade Sheet / Transcript";
  if (lowerName.includes("bill") || lowerName.includes("invoice")) return "Financial Document (Invoice/Bill/Receipt)";
  if (lowerName.includes("id") || lowerName.includes("license")) return "Identification Document";
  if (lowerName.includes("report")) return "Report / Analysis Document";
  if (lowerName.includes("note")) return "Notes / Study Material";
  
  // Check by extension
  if (lowerName.endsWith(".pdf")) return "PDF Document";
  if (mimetype.startsWith("image/")) return "Image Document";
  
  return "Document";
}

// Extract purpose based on doc type - consolidated
export function extractPurpose(text, docType) {
  const lowerText = text.toLowerCase();
  
  const purposes = {
    "Resume": () => {
      const hasExp = lowerText.includes("experience") || lowerText.includes("work");
      const hasSkills = lowerText.includes("skills") || lowerText.includes("technical");
      const hasEdu = lowerText.includes("education") || lowerText.includes("degree");
      const components = [];
      if (hasExp) components.push("work experience and professional history");
      if (hasSkills) components.push("technical skills and competencies");
      if (hasEdu) components.push("educational qualifications");
      return `This is a professional resume presenting ${components.join(", ")} for employment opportunities.`;
    },
    "Academic": () => "Displays academic performance, grades, and course results for a student. Provides official record of academic achievements.",
    "Financial": () => "Records financial transaction details, including amounts, items/services purchased, payment information, and billing details.",
    "Employment": () => "Formal job offer document outlining position details, compensation, benefits, and employment terms.",
    "Legal": () => "Legal document establishing terms, conditions, rights, and obligations between parties.",
    "Assignment": () => "Academic assignment or problem set containing questions, problems, or tasks to be completed by a student."
  };
  
  for (const [key, fn] of Object.entries(purposes)) {
    if (docType.includes(key)) return fn();
  }
  
  // Generic
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join(". ").substring(0, 200) + "...";
  }
  
  return "Document contains important information that requires review and understanding.";
}

// Preprocess text
export function preprocessText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/^\d+\s*$/gm, '')
    .replace(/Page \d+/gi, '')
    .replace(/[|]/g, 'I')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/--\s*Sent from.*$/gim, '')
    .replace(/This email.*confidential.*$/gim, '')
    .trim();
}

// Extract problem summaries
export function extractProblemSummaries(text, lines) {
  const problems = [];
  const matches = [...text.matchAll(PATTERNS.question)];
  
  matches.forEach(match => {
    const problemText = match[2].trim();
    let title = problemText.split(/[.!?]/)[0].trim();
    if (title.length > 100) title = title.substring(0, 100) + '...';
    
    const difficultyMatch = problemText.match(PATTERNS.difficulty);
    const difficulty = difficultyMatch ? difficultyMatch[1].toLowerCase() : null;
    
    const exampleMatch = problemText.match(/(?:sample|example)[:\s]*(?:input|output)[:\s]*([^•]{20,150})/i);
    const example = exampleMatch ? exampleMatch[1].trim().substring(0, 120) : null;
    
    const hintMatch = problemText.match(/(?:hint|note)[:\s]*([^•]{20,100})/i);
    const hint = hintMatch ? hintMatch[1].trim().substring(0, 100) : null;
    
    let description = problemText
      .replace(/(?:sample|example)[:\s]*(?:input|output)[:\s]*[^•]{20,150}/gi, '')
      .replace(/(?:constraints|extra\s+conditions)[:\s]*[^•]{50,200}/gi, '')
      .trim()
      .substring(0, 200);
    
    if (description.length < 50) description = title;
    
    problems.push({ number: match[1], title, description, difficulty, example, hint });
  });
  
  // Fallback: extract from numbered items
  if (problems.length === 0) {
    const numberedPattern = /(\d+)[\.\)]\s*([A-Z][^•\n]{30,200})/g;
    const numberedMatches = [...text.matchAll(numberedPattern)];
    numberedMatches.slice(0, 5).forEach(match => {
      const content = match[2].trim();
      if (content.length > 30 && (content.toLowerCase().includes('given') || content.toLowerCase().includes('find'))) {
        problems.push({
          number: match[1],
          title: content.substring(0, 100),
          description: content.substring(0, 180),
          difficulty: null,
          example: null,
          hint: null
        });
      }
    });
  }
  
  return problems.slice(0, 10);
}
