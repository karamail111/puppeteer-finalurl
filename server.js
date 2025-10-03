import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/final-url", async (req, res) => {
  const launchUrl = req.query.launchUrl;
  if (!launchUrl) {
    return res.status(400).json({ error: "Missing launchUrl parameter" });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage();
    await page.goto(launchUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // ดึง URL สุดท้ายหลัง redirect
    const finalUrl = page.url();

    res.json({
      finalUrl,
      time: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/", (req, res) => {
  res.send("✅ Puppeteer Final URL Service is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
