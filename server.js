import express from "express";
import puppeteer from "puppeteer";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post("/getFinalUrl", async (req, res) => {
  const launchUrl = req.body.launchUrl;
  if (!launchUrl) {
    return res.status(400).json({ error: "Missing launchUrl" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    await page.goto(launchUrl, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    // Get final URL after redirects
    const finalUrl = page.url();

    res.json({
      finalUrl,
      original: launchUrl
    });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
