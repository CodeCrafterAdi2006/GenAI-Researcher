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

    // Set a strict timeout for the entire request handler
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 20000); // 20s total logic timeout

    try {
      console.log(`[SCRAPE] Initiating ingestion for: ${url}`);
      let response;
      try {
        response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          timeout: 12000, // 12s fetch timeout
          maxContentLength: 5 * 1024 * 1024, // Reduced to 5MB to save memory
          signal: abortController.signal
        });
      } catch (axiosError: any) {
        clearTimeout(timeoutId);
        if (axios.isCancel(axiosError) || axiosError.code === 'ECONNABORTED') {
          return res.status(504).json({ error: "Source retrieval timed out. The website is too slow." });
        }
        console.error(`[SCRAPE] Network failure for ${url}:`, axiosError.message);
        return res.status(axiosError.response?.status || 500).json({ 
          error: `Network failure: ${axiosError.message}`,
          details: "The target website may be blocking the request or is currently offline."
        });
      }

      if (!response.data || typeof response.data !== 'string') {
        clearTimeout(timeoutId);
        return res.status(422).json({ error: "Target URL returned incompatible data format (non-HTML)" });
      }

      console.log(`[SCRAPE] Processing content for ${url} (${response.data.length} bytes)`);
      
      const $ = cheerio.load(response.data);

      // Aggressive cleaning to minimize memory footprint
      $('script, style, nav, footer, header, noscript, iframe, .ads, #ads, svg, canvas, .sidebar, .menu').remove();

      // Prioritize content areas
      const contentSelectors = ['main', 'article', '.content', '#content', '.post-content', '.article-body', 'body'];
      let content = "";
      
      for (const selector of contentSelectors) {
        const found = $(selector).text().trim();
        if (found.length > 200) {
          content = found;
          break;
        }
      }
      
      if (!content) content = $('body').text() || "";

      const title = $('title').text() || url;

      // Limit processed strings immediately
      const cleanContent = content.replace(/\s+/g, ' ').trim().substring(0, 300000);
      const cleanTitle = title.trim().substring(0, 300);

      console.log(`[SCRAPE] Complete: ${url} (${cleanContent.length} chars)`);

      clearTimeout(timeoutId);
      res.json({
        title: cleanTitle || "Extracted Source",
        content: cleanContent || "Critical: No readable text extracted from endpoint."
      });
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("[SCRAPE] Critical Processor Fault:", error.message);
      res.status(500).json({ error: "System overload during analysis", details: error.message });
    }
  });

  app.post("/api/analyze-pdf", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file provided" });

    try {
      console.log(`[PDF] Analyzing: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`);
      
      if (req.file.size > 8 * 1024 * 1024) {
        return res.status(413).json({ error: "PDF exceeds 8MB analysis limit" });
      }

      let text = "";
      try {
        const data = await pdf(req.file.buffer);
        text = data.text;
      } catch (pdfErr: any) {
        console.error("[PDF] Extraction failed:", pdfErr.message);
        return res.status(500).json({ error: "PDF encoding incompatible with current analyzer" });
      }

      const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 400000);
      
      console.log(`[PDF] Success: ${req.file.originalname} (${cleanText.length} chars)`);
      
      res.json({
        title: req.file.originalname,
        content: cleanText || "PDF contained no extractable text layer."
      });
    } catch (error: any) {
      console.error("[PDF] Critical System Error:", error.message);
      res.status(500).json({ error: "Neural analysis engine failure", details: error.message });
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
