import express from "express";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * ✅ ฟังก์ชันเปิดเบราว์เซอร์ (รองรับ Railway / Docker)
 */
async function launchBrowser() {
  return await puppeteer.launch({
    headless: "new", // ใช้ headless โหมดใหม่ (แทน false ที่ใช้ GUI)
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-popup-blocking",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
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
    console.error("Error in /geturl:", err.message);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
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
    console.error("Error in /getheader:", err.message);
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

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-156.png']";

    // รอ selector ถ้าไม่เจอใน 7 วิ → false
    try {
      await page.waitForSelector(selector, { timeout: 7000 });
    } catch (e) {
      console.error("Selector not found");
      await browser.close();
      return res.json({ success: false, reason: "Image not found" });
    }

    // ✅ ดักแท็บใหม่ (targetcreated + targetchanged)
    let newTarget = null;
    browser.on("targetcreated", (target) => {
      newTarget = target;
    });

    // คลิกภาพ
    await page.click(selector);

    // ✅ รอให้แท็บใหม่เปลี่ยน URL จาก about:blank → จริง
    let finalUrl = null;
    for (let i = 0; i < 20; i++) {
      if (newTarget && newTarget.url() && !newTarget.url().startsWith("about:")) {
        finalUrl = newTarget.url();
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // ถ้ายังไม่มี ให้ลองเอา page จาก target
    if (!finalUrl && newTarget) {
      try {
        const newPage = await newTarget.page();
        await newPage.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 5000 }).catch(() => {});
        finalUrl = newPage.url();

        // fallback ดึงจาก frame
        if (!finalUrl || finalUrl.startsWith("about:")) {
          const frames = newPage.frames();
          for (const f of frames) {
            if (f.url() && !f.url().startsWith("about:")) {
              finalUrl = f.url();
              break;
            }
          }
        }
      } catch (e) {
        console.warn("Cannot read newPage:", e.message);
      }
    }

    console.log("✅ finalUrl =", finalUrl);

    await browser.close();

    if (!finalUrl || finalUrl.startsWith("about:")) {
      return res.json({ success: false, reason: "No valid URL found", finalUrl });
    }

    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    console.error("Error on /clickgame:", err.message);
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
