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

    // โหลดหน้าเว็บ (timeout 7 วิ)
    try {
      await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 14000 });
    } catch (e) {
      console.error("Timeout loading page");
      await browser.close();
      return res.json({ success: false, reason: "Page load timeout > 14s" });
    }

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-164.png']";

    // รอ selector ถ้าไม่เจอใน 7 วิ → false
    try {
      await page.waitForSelector(selector, { timeout: 14000 });
    } catch (e) {
      console.error("Selector not found");
      await browser.close();
      return res.json({ success: false, reason: "Image not found" });
    }

    // ดัก event tab ใหม่
    const newPagePromise = new Promise((resolve) =>
      browser.once("targetcreated", async (target) => {
        const newPage = await target.page();
        resolve(newPage);
      })
    );

    // คลิก
    await page.click(selector);

    // รอแท็บใหม่ (9 วิ)
    let newPage;
    try {
      newPage = await Promise.race([
        newPagePromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("No new tab")), 9000)
        ),
      ]);
    } catch (e) {
      console.error("No new tab opened");
      await browser.close();
      return res.json({ success: false, reason: "No new tab opened" });
    }

    // รอโหลดเล็กน้อยแล้วเอา URL
    await newPage.bringToFront();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const finalUrl = newPage.url();
    console.log("finalUrl =", finalUrl);

    // ✅ ปิด browser หลังทำเสร็จ
    await browser.close();

    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    console.error("Error on /clickgame:", err.message);
    if (browser) await browser.close(); // ปิดทั้ง browser เวลา error
    res.status(500).json({ success: false, error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
