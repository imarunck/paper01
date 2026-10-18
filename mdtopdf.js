#!/usr/bin/env node

/**
 * mdtopdf.js
 * Converts Markdown files (default: Abstract.md) to clean, publication-ready PDFs.
 * 
 * Usage:
 *   node mdtopdf.js
 *   node mdtopdf.js input.md
 *   node mdtopdf.js input.md output.pdf
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Determine input and output paths
const args = process.argv.slice(2);
const inputFile = args[0] ? path.resolve(args[0]) : path.resolve(__dirname, 'Abstract.md');
const outputFile = args[1]
  ? path.resolve(args[1])
  : path.resolve(path.dirname(inputFile), `${path.basename(inputFile, path.extname(inputFile))}.pdf`);

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file not found: ${inputFile}`);
  process.exit(1);
}

// Locate Chrome / Chromium binary across OS environments
function getChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ];

  const winPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  if (process.platform === 'darwin') {
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === 'win32') {
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    // Linux binaries check via 'which'
    const linuxBinaries = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
    for (const bin of linuxBinaries) {
      try {
        const found = execSync(`which ${bin} 2>/dev/null`, { encoding: 'utf-8' }).trim();
        if (found) return found;
      } catch (e) {
        // continue
      }
    }
  }

  return null;
}

// Built-in Markdown-to-HTML parser (no external npm dependencies required)
function parseMarkdown(md) {
  try {
    const marked = require('marked');
    if (marked && typeof marked.parse === 'function') {
      return marked.parse(md);
    }
  } catch (e) {
    // Fall back to robust built-in parser
  }

  const lines = md.split('\n');
  const htmlLines = [];
  let inList = null; // 'ul' or 'ol'
  let inCodeBlock = false;
  let codeBlockContent = [];

  function closeList() {
    if (inList) {
      htmlLines.push(`</${inList}>`);
      inList = null;
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineFormat(text) {
    // Escape HTML first so tags like <title> or <h1> in markdown become &lt;title&gt;
    const escaped = escapeHtml(text);

    return escaped
      // Bold + Italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.*?)__/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push(`<pre><code>${codeBlockContent.join('\n')}</code></pre>`);
        inCodeBlock = false;
        codeBlockContent = [];
      } else {
        closeList();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    // Blank line
    if (!line) {
      closeList();
      continue;
    }

    // Horizontal Rule
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(line)) {
      closeList();
      htmlLines.push('<hr />');
      continue;
    }

    // Headers
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      const title = inlineFormat(hMatch[2]);
      htmlLines.push(`<h${level}>${title}</h${level}>`);
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        htmlLines.push('<ul>');
        inList = 'ul';
      }
      htmlLines.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        htmlLines.push('<ol>');
        inList = 'ol';
      }
      htmlLines.push(`<li>${inlineFormat(olMatch[2])}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    htmlLines.push(`<p>${inlineFormat(line)}</p>`);
  }

  closeList();
  return htmlLines.join('\n');
}

// Generate styled HTML document with academic formatting
function wrapHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 20mm 18mm 20mm;
      @bottom-right {
        content: counter(page);
        font-size: 8.5pt;
        font-family: 'Times New Roman', Times, Georgia, serif;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Times New Roman', Times, Georgia, serif;
      font-size: 10.5pt;
      line-height: 1.42;
      color: #111111;
      background: #ffffff;
      margin: 0;
      padding: 0;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    h1 {
      font-size: 15.5pt;
      font-weight: bold;
      line-height: 1.25;
      text-align: center;
      margin-top: 0;
      margin-bottom: 11pt;
      color: #0d1b2a;
    }

    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin-top: 10pt;
      margin-bottom: 4pt;
      color: #1b263b;
      page-break-after: avoid;
      break-after: avoid;
    }

    h3 {
      font-size: 11pt;
      font-weight: bold;
      margin-top: 8pt;
      margin-bottom: 3pt;
      color: #1b263b;
      page-break-after: avoid;
      break-after: avoid;
    }

    p {
      margin-top: 0;
      margin-bottom: 5.5pt;
      text-align: justify;
      hyphens: auto;
    }

    hr {
      border: 0;
      height: 1px;
      background: #d0d7de;
      margin: 8pt 0;
    }

    ul, ol {
      margin-top: 0;
      margin-bottom: 5.5pt;
      padding-left: 18pt;
    }

    li {
      margin-bottom: 3pt;
      text-align: justify;
    }

    strong {
      font-weight: bold;
      color: #0a0a0a;
    }

    em {
      font-style: italic;
    }

    code {
      font-family: 'Menlo', 'Consolas', 'Courier New', monospace;
      font-size: 9pt;
      background: #f1f3f5;
      padding: 1pt 3.5pt;
      border-radius: 2.5pt;
      border: 1px solid #e2e8f0;
    }

    pre code {
      display: block;
      padding: 6pt;
      overflow-x: auto;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      font-size: 8.5pt;
      line-height: 1.35;
    }

    a {
      color: #1a56db;
      text-decoration: none;
    }

    @media print {
      body {
        width: 100%;
      }
      a {
        color: inherit;
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
}

async function convert() {
  console.log(`Reading: ${inputFile}`);
  const mdContent = fs.readFileSync(inputFile, 'utf-8');

  // Extract first H1 as document title
  const h1Match = mdContent.match(/^#\s+(.*)$/m);
  const docTitle = h1Match ? h1Match[1].trim() : 'Extended Abstract';

  const bodyHtml = parseMarkdown(mdContent);
  const fullHtml = wrapHtml(bodyHtml, docTitle);

  const tempHtmlPath = path.resolve(path.dirname(outputFile), `.temp_${Date.now()}.html`);
  fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8');

  const chromePath = getChromePath();
  if (!chromePath) {
    console.error('Error: Could not locate Google Chrome or Chromium executable on this system.');
    console.error('Please install Chrome or specify CHROME_PATH environment variable.');
    if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
    process.exit(1);
  }

  console.log(`Generating PDF via: ${chromePath}`);
  const chromeCmd = `"${chromePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputFile}" "file://${tempHtmlPath}"`;

  try {
    execSync(chromeCmd, { stdio: 'pipe' });
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile);
      console.log(`✅ Success! Created: ${outputFile} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      console.error('Error: Chrome process completed but output PDF was not found.');
    }
  } catch (error) {
    console.error('Failed to generate PDF:', error.message);
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

convert();
