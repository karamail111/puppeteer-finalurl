import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ✅ เปิดเบราว์เซอร์พร้อมปิด service worker ผ่าน CDP
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-popup-blocking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-sync",
      "--disable-translate",
      "--disable-extensions",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-features=AudioServiceOutOfProcess",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      "--disable-notifications",
      "--disable-software-rasterizer",
      "--disable-features=InterestCohortAPI,HeadlessExperimentalFeatures,HeadlessFeature,ServiceWorkerServicification",
    ],
  });
}

app.get("/clickgame", async (req, res) => {
  const requestUrl = req.query.request;
  console.log("requestUrl =", requestUrl);
  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // ✴️ ปิดการทำงานของ service worker ทั้งระบบผ่าน CDP
    const client = await page.target().createCDPSession();
    await client.send("ServiceWorker.disable");
    await client.send("Network.setBypassServiceWorker", { bypass: true });

    // โหลดหน้าเว็บ
    try {
      await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 10000 });
    } catch (e) {
      console.error("Timeout loading page");
      await browser.close();
      return res.json({ success: false, reason: "Page load timeout > 10s" });
    }

    // 🎯 รายการรูปที่ต้องการสุ่มกด
    const images = [
      "PG-SLOT-164.png",
      "PG-SLOT-149.png",
      "PG-SLOT-166.png"
    ];
    
// 🎲 สุ่มเลือก 1 รูป
    const randomImage = images[Math.floor(Math.random() * images.length)];
    
    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-149.png']";

    try {
      await page.waitForSelector(selector, { timeout: 8000 });
    } catch (e) {
      console.error("Selector not found");
      await browser.close();
      return res.json({ success: false, reason: "Image not found" });
    }

    // ✅ ดักแท็บใหม่
    let newTarget = null;
    browser.on("targetcreated", (target) => (newTarget = target));

    await page.click(selector);

    // ✅ รอ URL ของแท็บใหม่
    let finalUrl = null;
    for (let i = 0; i < 20; i++) {
      if (newTarget && newTarget.url() && !newTarget.url().startsWith("about:") && !newTarget.url().endsWith(".js")) {
        finalUrl = newTarget.url();
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // fallback: อ่านจาก newPage
    if (!finalUrl && newTarget) {
      try {
        const newPage = await newTarget.page();
        if (newPage) {
          await newPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 }).catch(() => {});
          finalUrl = newPage.url();
          // ดึงจาก frames ถ้ายังไม่ได้
          if (!finalUrl || finalUrl.startsWith("about:") || finalUrl.endsWith(".js")) {
            for (const f of newPage.frames()) {
              if (f.url() && !f.url().startsWith("about:") && !f.url().endsWith(".js")) {
                finalUrl = f.url();
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Cannot read newPage:", err.message);
      }
    }

    console.log("✅ finalUrl =", finalUrl);
    await browser.close();

    if (!finalUrl || finalUrl.startsWith("about:") || finalUrl.endsWith(".js")) {
      return res.json({ success: false, reason: "Invalid URL (about/js)", finalUrl });
    }

    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    console.error("Error on /clickgame:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/ping", (req, res) => {
  res.send("✅ Puppeteer service running fine.");
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
