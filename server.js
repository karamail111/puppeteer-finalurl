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

    console.log("🟢 เปิดหน้าแรก:", requestUrl);
    await page.goto(requestUrl, { waitUntil: "networkidle2", timeout: 15000 });

    const selector = "img[src*='/image/gameIcon/PG/PG-SLOT-156.png']";
    await page.waitForSelector(selector, { timeout: 10000 });

    // เก็บแท็บก่อนคลิก
    const beforeTargets = browser.targets().filter((t) => t.type() === "page");
    console.log("📄 ก่อนคลิก มีแท็บทั้งหมด:", beforeTargets.length);

    // คลิก
    await page.click(selector);
    console.log("🖱️ คลิกเรียบร้อย รอแท็บใหม่...");

    // ✅ รอแท็บใหม่เกิดขึ้น
    let allTargets = [];
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      allTargets = browser.targets().filter((t) => t.type() === "page");
      const newCount = allTargets.length - beforeTargets.length;
      console.log(`⏱️ [${i + 1}] มีแท็บทั้งหมด: ${allTargets.length} (+${newCount})`);
      for (let [idx, t] of allTargets.entries()) {
        try {
          const p = await t.page();
          console.log(`  └─ #${idx + 1} ${t._targetId} → ${await p.url()}`);
        } catch {
          console.log(`  └─ #${idx + 1} ${t._targetId} → (access denied)`);
        }
      }
      if (allTargets.length > beforeTargets.length + 1) break;
    }

    // ✅ หาแท็บที่ "URL เปลี่ยนล่าสุด" จาก about:blank
    const newTargets = allTargets.filter((t) => !beforeTargets.includes(t));
    console.log("🆕 เจอแท็บใหม่ทั้งหมด:", newTargets.length);

    let finalPage = null;
    let finalUrl = null;

    for (const [idx, t] of newTargets.entries()) {
      try {
        const p = await t.page();
        let currentUrl = p.url();
        console.log(`🔎 ตรวจแท็บใหม่ #${idx + 1}: ${currentUrl}`);

        // ถ้ายังเป็น about:blank → รอ redirect
        if (currentUrl === "about:blank") {
          for (let j = 0; j < 20; j++) {
            await new Promise((r) => setTimeout(r, 500));
            currentUrl = p.url();
            if (currentUrl !== "about:blank" && currentUrl !== requestUrl) break;
          }
        }

        console.log(`✅ แท็บ #${idx + 1} URL สุดท้าย: ${currentUrl}`);
        if (currentUrl && currentUrl !== "about:blank" && currentUrl !== requestUrl) {
          finalPage = p;
          finalUrl = currentUrl;
        }
      } catch (err) {
        console.log("❌ อ่านแท็บล้มเหลว:", err.message);
      }
    }

    if (!finalUrl) {
      finalUrl = await page.evaluate(() => window.location.href);
      console.log("⚠️ ใช้ URL fallback:", finalUrl);
    }

    await browser.close();
    console.log("🎯 Final URL =", finalUrl);

    return res.json({ success: true, clickedUrl: finalUrl });
  } catch (err) {
    console.error("💥 Error:", err.message);
    if (browser) await browser.close();
    return res.status(500).json({ success: false, error: err.message });
  }
});



app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
