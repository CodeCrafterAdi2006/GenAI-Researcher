import express from "express";
import path from "path";
import axios from "axios";
import { JSDOM } from "jsdom";
import * as pdf from "pdf-parse";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  console.log("Starting GenAI Researcher server...");
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      console.log(`Scraping URL: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      const dom = new JSDOM(response.data);
      const doc = dom.window.document;

      // Basic cleanup
      const scripts = doc.querySelectorAll('script, style, nav, footer, header');
      scripts.forEach(s => s.remove());

      const content = doc.body.textContent || "";
      const title = doc.title || url;

      res.json({
        title: title.trim().substring(0, 500),
        content: content.replace(/\s+/g, ' ').trim().substring(0, 100000)
      });
    } catch (error) {
      console.error("Scraping error:", error);
      res.status(500).json({ error: "Failed to scrape URL" });
    }
  });

  app.post("/api/analyze-pdf", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      console.log(`Analyzing PDF: ${req.file.originalname} (${req.file.size} bytes)`);
      
      let text = "";
      // Handle the different possible export patterns of pdf-parse v2.4.5
      const pdfModule = pdf as any;
      const PDFParseClass = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse) || pdfModule.default;
      
      if (typeof PDFParseClass === 'function' && PDFParseClass.prototype && PDFParseClass.prototype.getText) {
        // Constructor pattern (v2.4.5 style)
        const parser = new (PDFParseClass as any)({ data: req.file.buffer });
        const result = await parser.getText();
        text = result.text;
      } else {
        // Function pattern (v1.1.1 style)
        const extractFunc = typeof pdf === 'function' ? pdf : (pdf as any).default;
        if (typeof extractFunc === 'function') {
          const data = await extractFunc(req.file.buffer);
          text = data.text;
        } else {
          throw new Error("Could not find a valid PDF parsing function or class");
        }
      }

      const cleanText = text.replace(/\s+/g, ' ').trim();
      console.log(`Extraction complete. Length: ${cleanText.length}`);

      res.json({
        title: req.file.originalname,
        content: cleanText.substring(0, 300000)
      });
    } catch (error) {
      console.error("PDF parsing error:", error);
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  console.log("Configuring Vite middleware...");
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      console.log("Vite middleware configured.");
    } catch (err) {
      console.error("Failed to start Vite server:", err);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    
    console.log(`Production Mode: Serving static files from ${distPath}`);
    
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      console.log(`SPA Fallback: Serving index.html for ${req.url}`);
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error("Index serve error:", err);
          res.status(500).send("System Error: Application artifacts are missing. Support code: 404-dist");
        }
      });
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Fatal server error:", err);
});
