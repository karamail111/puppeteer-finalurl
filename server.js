import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ✅ เปิดเบราว์เซอร์แบบปลอดภัย (แก้ bug service worker บน Railway)
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new", // ใช้โหมด headless ใหม่ (จำเป็นสำหรับ Railway)
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
      "--disable-features=site-per-process,TranslateUI,BlinkGenPropertyTrees,InterestCohortAPI",
      "--disable-blink-features=AutomationControlled",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-software-rasterizer",
      "--disable-features=AudioServiceOutOfProcess",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      "--disable-notifications",
      "--disable-features=HeadlessExperimentalFeatures,HeadlessFeature,ServiceWorkerServicification", // 🧩 ปิด Service Worker
    ],
  });
}

/**
 * /clickgame?request=https://example.com
 * เข้าเว็บ, หา tag <img> (เกม), คลิก, คืน url ล่าสุด
 */
app.get("/clickgame", async (req, res) => {
  const requestUrl = req.query.request;
  console.log("requestUrl =", requestUrl);

  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // โหลดหน้าเว็บ (timeout 7 วิ)
    try {
      await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 7000 });
    } catch (e) {
      console.error("Timeout loading page");
      await browser.close();
      return res.json({ success: false, reason: "Page load timeout > 7s" });
    }

    // 🔧 ลบ service worker ที่มีอยู่
    await page.evaluate(async () => {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
      }
    });

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-156.png']";

    // รอ selector ถ้าไม่เจอใน 7 วิ → false
    try {
      await page.waitForSelector(selector, { timeout: 7000 });
    } catch (e) {
      console.error("Selector not found");
      await browser.close();
      return res.json({ success: false, reason: "Image not found" });
    }

    // ✅ ดักแท็บใหม่
    let newTarget = null;
    browser.on("targetcreated", (target) => {
      newTarget = target;
    });

    // คลิกภาพ
    await page.click(selector);

    // ✅ รอ URL ของแท็บใหม่ เปลี่ยนจาก about:blank
    let finalUrl = null;
    for (let i = 0; i < 20; i++) {
      if (newTarget && newTarget.url() && !newTarget.url().startsWith("about:")) {
        finalUrl = newTarget.url();
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // ถ้ายังไม่มี URL → พยายามเปิด page object
    if (!finalUrl && newTarget) {
      try {
        const newPage = await newTarget.page();
        if (newPage) {
          await newPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
          finalUrl = newPage.url();

          // fallback ดึงจาก frame
          if (!finalUrl || finalUrl.startsWith("about:") || finalUrl.endsWith(".js")) {
            const frames = newPage.frames();
            for (const f of frames) {
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

/**
 * ทดสอบง่ายๆ: /ping
 */
app.get("/ping", (req, res) => {
  res.send("✅ Puppeteer service running normally.");
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
