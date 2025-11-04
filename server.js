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
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
  console.log("requestUrl =", requestUrl);

  if (!requestUrl) return res.status(400).json({ error: "Missing request param" });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 7000 });

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-156.png']";

    await page.waitForSelector(selector, { timeout: 7000 });

    let finalUrl = null;

    // ✅ ดักทุกการเปลี่ยนหน้าใน tab เดียว
    page.on("framenavigated", (frame) => {
      finalUrl = frame.url();
    });

    await page.click(selector);

    // รอให้เกิด navigation ภายใน 9 วิ
    await page.waitForNavigation({ timeout: 9000 }).catch(() => {});

    // ถ้าไม่มี navigation จริง ก็คืน URL ปัจจุบัน
    if (!finalUrl) finalUrl = page.url();

    await browser.close();
    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
