import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Utility: เปิด browser (headless:true = เบื้องหลัง, false = โชว์)
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: true, // ถ้าอยากเห็น browser จริงๆ ให้เปลี่ยนเป็น false
    slowMo: 150,              // ให้เห็น step ชัดๆ
    defaultViewport: null,    // เต็มจอ
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-popup-blocking",
      "--window-size=1280,800",
    ],
  });
}

/**
 * /geturl?request=https://example.com
 * เข้าเว็บ, รอ redirect, ส่งคืน url สุดท้าย
 */
app.get("/geturl", async (req, res) => {
  const requestUrl = req.query.request;
  console.log("requestUrl =", requestUrl);
  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 60000 });
    const finalUrl = page.url();

    res.json({ finalUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    /*if (browser) await browser.close();*/
  }
});

/**
 * /getheader?request=https://example.com
 * เข้าเว็บ, ดึง response header ของ request แรก (main frame)
 */
app.get("/getheader", async (req, res) => {
  const requestUrl = req.query.request;
  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    let responseHeaders = {};
    page.on("response", async (response) => {
      if (response.url() === requestUrl) {
        responseHeaders = response.headers();
      }
    });

    await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 60000 });

    res.json({ headers: responseHeaders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

/**
 * /clickgame?request=https://example.com
 * เข้าเว็บ, หา tag <img> (เกม), คลิก, คืน url ล่าสุด
 */
app.get("/clickgame", async (req, res) => {
  const requestUrl = req.query.request;
  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 15000 });

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-156.png']";
    await page.waitForSelector(selector, { timeout: 10000 });

    // เก็บแท็บก่อนคลิก
    const beforeTargets = browser.targets().filter(t => t.type() === "page");

    // คลิก
    await page.click(selector);

    // ✅ รอจนแท็บใหม่ทั้งหมดถูกสร้าง (2 หรือมากกว่า)
    let allTargets = [];
    for (let i = 0; i < 30; i++) {
      allTargets = browser.targets().filter(t => t.type() === "page");
      if (allTargets.length > beforeTargets.length + 1) break; // มีแท็บมากกว่า 1 ใหม่ขึ้นมา
      await new Promise(r => setTimeout(r, 500));
    }

    // ✅ หาแท็บใหม่ล่าสุด (ตัวท้ายสุด)
    const newTargets = allTargets.filter(t => !beforeTargets.includes(t));
    let finalPage = null;

    if (newTargets.length > 0) {
      const lastTarget = newTargets[newTargets.length - 1]; // เอาแท็บสุดท้าย
      finalPage = await lastTarget.page();
    }

    let finalUrl = null;

    if (finalPage) {
      // ✅ รอจน URL ของแท็บสุดท้ายเปลี่ยนจาก about:blank
      for (let i = 0; i < 20; i++) {
        const url = finalPage.url();
        if (url && url !== "about:blank") {
          finalUrl = url;
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }

      // fallback evaluate
      if (!finalUrl || finalUrl === "about:blank") {
        try {
          await finalPage.waitForFunction(() => window.location.href !== "about:blank", { timeout: 5000 });
          finalUrl = await finalPage.evaluate(() => window.location.href);
        } catch {}
      }
    }

    // ✅ fallback ถ้ายังไม่เจอ URL
    if (!finalUrl) finalUrl = await page.evaluate(() => window.location.href);

    await browser.close();
    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    if (browser) await browser.close();
    return res.status(500).json({ success: false, error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
