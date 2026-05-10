import express from "express";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import * as pdf from "pdf-parse";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

export async function createExpressApp() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      console.log(`[SCRAPE] Starting: ${url}`);
      let response;
      try {
        response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 15000,
          maxContentLength: 10 * 1024 * 1024 // 10MB limit
        });
      } catch (axiosError: any) {
        console.error(`[SCRAPE] Fetch failed for ${url}:`, axiosError.message);
        return res.status(axiosError.response?.status || 500).json({ 
          error: `Failed to fetch URL: ${axiosError.message}`,
          details: axiosError.response?.data
        });
      }

      if (!response.data || typeof response.data !== 'string') {
        return res.status(422).json({ error: "URL returned non-textual content" });
      }

      console.log(`[SCRAPE] Parsing content for ${url} with Cheerio`);
      
      const $ = cheerio.load(response.data);

      // Remove unwanted elements
      $('script, style, nav, footer, header, noscript, iframe, .ads, #ads').remove();

      // Get readable content
      // We try to focus on main content if possible, otherwise body
      const content = $('main, article, .content, #content, body').text() || "";
      const title = $('title').text() || url;

      const cleanContent = content.replace(/\s+/g, ' ').trim().substring(0, 500000);
      const cleanTitle = title.trim().substring(0, 500);

      console.log(`[SCRAPE] Success: ${url} (Title: ${cleanTitle}, Content: ${cleanContent.length} chars)`);

      res.json({
        title: cleanTitle || "Untitled Source",
        content: cleanContent || "No readable content found."
      });
    } catch (error: any) {
      console.error("[SCRAPE] Unexpected error during processing:", error.message);
      res.status(500).json({ error: "System failure during content extraction", details: error.message });
    }
  });

  app.post("/api/analyze-pdf", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      console.log(`Analyzing PDF: ${req.file.originalname} (${req.file.size} bytes)`);
      
      let text = "";
      const pdfModule = pdf as any;
      const PDFParseClass = pdfModule.PDFParse || (pdfModule.default && pdfModule.default.PDFParse) || pdfModule.default;
      
      if (typeof PDFParseClass === 'function' && PDFParseClass.prototype && PDFParseClass.prototype.getText) {
        const parser = new (PDFParseClass as any)({ data: req.file.buffer });
        const result = await parser.getText();
        text = result.text;
      } else {
        const extractFunc = typeof pdf === 'function' ? pdf : (pdf as any).default;
        if (typeof extractFunc === 'function') {
          const data = await extractFunc(req.file.buffer);
          text = data.text;
        } else {
          throw new Error("Could not find a valid PDF parsing function or class");
        }
      }

      const cleanText = text.replace(/\s+/g, ' ').trim();
      res.json({
        title: req.file.originalname,
        content: cleanText.substring(0, 300000)
      });
    } catch (error) {
      console.error("PDF parsing error:", error);
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  return app;
}

async function startServer() {
  console.log("Starting GenAI Researcher server...");
  const app = await createExpressApp();
  const PORT = 3000;

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
