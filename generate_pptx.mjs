import PptxGenJS from "pptxgenjs";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

// ── COLOR TOKENS ──
const NAVY = "1B2A3B";
const NAVY_DK = "162234";
const RED = "BF1120";
const WHITE = "FFFFFF";
const ICE = "EEF3F8";
const MUTED = "5E6A7A";
const BORDER = "D8DCE4";
const WARM = "F7F8FA";

// ── FONTS ──
const HEADER = "Georgia";
const BODY = "Calibri";
const MONO = "Courier New";

// ── IMAGE URLS — real CCF content from completecustomfence.com ──
const CCF_CDN = "https://mlr4zezkusej.i.optimole.com";
const CCF_GALLERY = `${CCF_CDN}/w:900/h:auto/q:mauto/f:best/https://completecustomfence.com/wp-content/uploads/photo-gallery/imported_from_media_libray`;
const IMAGE_URLS = {
  logo: `${CCF_CDN}/w:auto/h:auto/q:mauto/f:best/https://completecustomfence.com/wp-content/uploads/2023/04/NEW-CCF-logo-2.png`,
  hero: `${CCF_CDN}/w:1800/h:auto/q:mauto/f:best/https://completecustomfence.com/wp-content/uploads/2023/03/Photo-Oct-29-10-38-45-AM-scaled.jpg`,
  g1: `${CCF_GALLERY}/Vinyl1.jpg`,
  g2: `${CCF_GALLERY}/Aluminum1-scaled.jpg`,
  g3: `${CCF_GALLERY}/Aluminum5-scaled.jpg`,
  g4: `${CCF_GALLERY}/wood1.jpg`,
  g5: `${CCF_GALLERY}/Vinyl5.jpg`,
  g6: `${CCF_GALLERY}/Vinyl10.jpg`,
  // Extra install photos for additional slides
  vinyl2: `${CCF_GALLERY}/Vinyl2.jpg`,
  vinyl3: `${CCF_GALLERY}/Vinyl3.jpg`,
  aluminum3: `${CCF_GALLERY}/Aluminum3-scaled.jpg`,
  aluminum8: `${CCF_GALLERY}/Aluminum8-scaled.jpg`,
  wood3: `${CCF_GALLERY}/wood3.jpg`,
  wood5: `${CCF_GALLERY}/wood5.jpg`,
};

const IMG_DIR = "/tmp/ccf_images";

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith("https") ? https : http;
    getter.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const stream = fs.createWriteStream(filepath);
      res.pipe(stream);
      stream.on("finish", () => { stream.close(); resolve(filepath); });
      stream.on("error", reject);
    }).on("error", reject);
  });
}

async function downloadAllImages() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  const results = {};
  for (const [key, url] of Object.entries(IMAGE_URLS)) {
    const fp = path.join(IMG_DIR, `${key}.jpg`);
    if (fs.existsSync(fp) && fs.statSync(fp).size > 1000) {
      results[key] = fp;
      continue;
    }
    try {
      await downloadImage(url, fp);
      results[key] = fp;
      console.log(`  Downloaded: ${key}`);
    } catch (e) {
      console.warn(`  Failed to download ${key}: ${e.message}`);
      results[key] = null;
    }
  }
  return results;
}

function addRedBar(slide) {
  slide.addShape("rect", { x: 0, y: 0, w: "100%", h: 0.06, fill: { color: RED } });
}

function monoLabel(slide, text, opts = {}) {
  slide.addText(text, {
    fontFace: MONO, fontSize: 8, color: MUTED,
    charSpacing: 2, bold: false,
    x: opts.x || 0.5, y: opts.y || 0.3, w: opts.w || 4, h: 0.25,
    ...opts,
  });
}

async function main() {
  console.log("Downloading images...");
  const imgs = await downloadAllImages();
  console.log("Building PPTX...");

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  pres.author = "Complete Custom Fence";
  pres.subject = "New Hire Orientation";
  pres.title = "CCF New Hire Orientation Deck";

  const W = 13.33;
  const H = 7.5;

  // ════════════════════════════════════════
  // SLIDE 1: COVER
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NAVY_DK };
    if (imgs.hero) {
      s.addImage({ path: imgs.hero, x: 0, y: 0, w: W, h: H, sizing: { type: "cover", w: W, h: H } });
      // Dark overlay
      s.addShape("rect", { x: 0, y: 0, w: W, h: H, fill: { color: NAVY_DK, transparency: 40 } });
    }
    addRedBar(s);
    // CCF Logo in top-left
    if (imgs.logo) {
      s.addImage({ path: imgs.logo, x: 0.8, y: 0.6, w: 2.2, h: 0.8, sizing: { type: "contain", w: 2.2, h: 0.8 } });
    }
    // Mono label
    s.addText("COMPLETE CUSTOM FENCE  ·  GROVELAND, FL", {
      fontFace: MONO, fontSize: 9, color: WHITE, charSpacing: 2,
      x: 0.8, y: 5.0, w: 6, h: 0.3,
    });
    // Title
    s.addText("Welcome to\nthe team.", {
      fontFace: HEADER, fontSize: 54, color: WHITE, bold: true,
      x: 0.8, y: 5.3, w: 8, h: 1.6, lineSpacingMultiple: 0.9,
    });
    // Pills row
    const pills = ["20+ Years", "American-Made", "Lifetime Warranty", "Real Leads · Real Commissions"];
    pills.forEach((t, i) => {
      s.addShape("roundRect", {
        x: 0.8 + i * 2.2, y: 7.0, w: 2.0, h: 0.32, rectRadius: 0.16,
        fill: { color: WHITE, transparency: 85 },
        line: { color: WHITE, width: 0.5, transparency: 70 },
      });
      s.addText(t, {
        fontFace: BODY, fontSize: 8, color: WHITE,
        x: 0.8 + i * 2.2, y: 7.0, w: 2.0, h: 0.32, align: "center", valign: "middle",
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 2: LETTER FROM LUKE
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    addRedBar(s);
    // Left red accent bar
    s.addShape("rect", { x: 0, y: 0, w: 0.06, h: H, fill: { color: RED } });

    monoLabel(s, "A NOTE FROM OWNERSHIP", { x: 0.7, y: 0.4, color: "8898AA" });

    // Title — 28pt to prevent overlap (QA fix)
    s.addText("We're glad you're here.", {
      fontFace: HEADER, fontSize: 28, color: WHITE, bold: true,
      x: 0.7, y: 0.8, w: 7.5, h: 0.6,
    });

    // Body text — pushed down (QA fix)
    const letterBody = `Complete Custom Fence was built on a simple idea: do the job right, treat people like they matter, and the reputation takes care of itself. Twenty years later, that's still the whole strategy.

When you show up to a job site wearing this company's name, you're carrying something we worked hard to build. We're going to do everything on our end to make sure you're proud to carry it.

If you're in sales, here's what I want you to know: the hardest part of selling is already done. We spent 20 years building a reputation that homeowners trust before you ever knock on their door. Lifetime warranty, American-made materials, five-star reviews you can pull up on your phone at the kitchen table.

We don't hire people to fill seats. We hire people we want to build something with. You're one of those people — now let's get to work.`;

    s.addText(letterBody, {
      fontFace: BODY, fontSize: 12, color: "B8C4D4", lineSpacingMultiple: 1.4,
      x: 0.7, y: 1.6, w: 7.5, h: 4.2,
    });

    // Signature
    s.addShape("rect", { x: 0.7, y: 5.9, w: 5, h: 0.01, fill: { color: "3A5080" } });
    s.addText("Luke Payne", { fontFace: HEADER, fontSize: 16, color: WHITE, bold: true, x: 0.7, y: 6.0, w: 4, h: 0.35 });
    s.addText("Owner  ·  Complete Custom Fence", { fontFace: BODY, fontSize: 9, color: "8898AA", x: 0.7, y: 6.35, w: 5, h: 0.25 });

    // Right side: stat blocks
    const stats = [
      { val: "20+", lbl: "Years serving Central Florida" },
      { val: "50+", lbl: "Years combined team experience" },
      { val: "100%", lbl: "American-made materials" },
      { val: "★★★★★", lbl: "Verified Google & Facebook" },
    ];
    const sx = 9.2;
    stats.forEach((st, i) => {
      const sy = 0.8 + i * 1.6;
      s.addShape("rect", {
        x: sx, y: sy, w: 3.5, h: 1.35, rectRadius: 0.08,
        fill: { color: WHITE, transparency: 95 },
        line: { color: WHITE, width: 0.3, transparency: 85 },
      });
      s.addText(st.val, {
        fontFace: HEADER, fontSize: 30, color: WHITE, bold: true,
        x: sx + 0.25, y: sy + 0.15, w: 3, h: 0.6,
      });
      s.addText(st.lbl, {
        fontFace: BODY, fontSize: 10, color: "8898AA",
        x: sx + 0.25, y: sy + 0.8, w: 3, h: 0.4,
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 3: GALLERY
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: ICE };

    monoLabel(s, "THIS IS WHAT WE BUILD", { x: 0.5, y: 0.3, color: RED });
    s.addText("Real Work. Real Florida Homes.", {
      fontFace: HEADER, fontSize: 32, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.6,
    });

    const gImgs = ["g1", "g2", "g3", "g4", "g5", "g6"];
    const gLabels = [
      "Shadow Box Privacy Panel", "Estate Gate & Perimeter", "Business Perimeter Security",
      "Full Privacy Panel", "Closed Top Panel System", "Front Yard Curb Appeal",
    ];
    const gTypes = [
      "VINYL PRIVACY", "ALUMINUM ORNAMENTAL", "COMMERCIAL ALUMINUM",
      "CEDAR WOOD", "VINYL PRIVACY", "VINYL SCALLOP PICKET",
    ];

    const cols = 3, rows = 2;
    const gw = 3.8, gh = 2.5, gap = 0.15;
    const startX = 0.5, startY = 1.5;

    gImgs.forEach((key, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const gx = startX + col * (gw + gap);
      const gy = startY + row * (gh + gap);

      if (imgs[key]) {
        s.addImage({ path: imgs[key], x: gx, y: gy, w: gw, h: gh, rounding: true, sizing: { type: "cover", w: gw, h: gh } });
      } else {
        s.addShape("rect", { x: gx, y: gy, w: gw, h: gh, fill: { color: BORDER } });
      }
      // Dark overlay at bottom
      s.addShape("rect", { x: gx, y: gy + gh - 0.8, w: gw, h: 0.8, fill: { color: NAVY_DK, transparency: 20 } });
      // Type label
      s.addText(gTypes[i], {
        fontFace: MONO, fontSize: 7, color: WHITE, charSpacing: 1.5,
        x: gx + 0.15, y: gy + gh - 0.7, w: gw - 0.3, h: 0.2,
      });
      // Name
      s.addText(gLabels[i], {
        fontFace: HEADER, fontSize: 13, color: WHITE, bold: true,
        x: gx + 0.15, y: gy + gh - 0.5, w: gw - 0.3, h: 0.35,
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 4: CUSTOMER REVIEWS
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NAVY_DK };
    addRedBar(s);

    monoLabel(s, "WHAT HOMEOWNERS SAY", { x: 0.5, y: 0.4, color: "8898AA" });
    s.addText("Real Customers. Real Results.", {
      fontFace: HEADER, fontSize: 28, color: WHITE, bold: true,
      x: 0.5, y: 0.75, w: 8, h: 0.5,
    });
    s.addText("★★★★★", {
      fontFace: BODY, fontSize: 16, color: "C9A535",
      x: 0.5, y: 1.25, w: 3, h: 0.4,
    });

    const reviews = [
      { name: "Jose Vega", quote: "They are prompt on getting the permit, the Groveland office was great in keeping me informed of everything and the guys that did the job couldn't have been nicer. They did a fantastic job." },
      { name: "Max Hitzemann", quote: "Complete Custom Fence was professional until the end. They were extremely flexible with what I wanted. Fantastic customer service and extremely quick fence install!" },
      { name: "Robert Williams", quote: "Submitted a request and within 5 minutes I received a call from a very polite lady. This is a company I'd want to do business with — from the very first phone call there was a connection." },
      { name: "Jonatan Portillo", quote: "George was very responsive, never felt pressured. The customer service was great. Thanks for the reasonable quote and great quality product!" },
    ];

    const cw = 2.95, ch = 4.0;
    reviews.forEach((rv, i) => {
      const cx = 0.5 + i * (cw + 0.15);
      const cy = 2.0;

      s.addShape("roundRect", {
        x: cx, y: cy, w: cw, h: ch, rectRadius: 0.1,
        fill: { color: WHITE, transparency: 96 },
        line: { color: WHITE, width: 0.3, transparency: 90 },
      });

      s.addText("★★★★★", {
        fontFace: BODY, fontSize: 11, color: "C9A535",
        x: cx + 0.2, y: cy + 0.2, w: 2, h: 0.3,
      });

      s.addText(`"${rv.quote}"`, {
        fontFace: HEADER, fontSize: 11, color: "C8D2E0", italic: true,
        lineSpacingMultiple: 1.45,
        x: cx + 0.2, y: cy + 0.6, w: cw - 0.4, h: 2.6,
      });

      s.addText(rv.name, {
        fontFace: BODY, fontSize: 10, color: WHITE, bold: true,
        x: cx + 0.2, y: cy + ch - 0.7, w: cw - 0.4, h: 0.25,
      });
      s.addText("Verified Google Review", {
        fontFace: MONO, fontSize: 7, color: "6A7A8A", charSpacing: 1,
        x: cx + 0.2, y: cy + ch - 0.45, w: cw - 0.4, h: 0.2,
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 5: CCF'S PROMISE TO YOU
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };

    // Navy left panel
    s.addShape("rect", { x: 0, y: 0, w: 4.0, h: H, fill: { color: NAVY } });
    addRedBar(s);

    monoLabel(s, "✦  PROMISE", { x: 0.5, y: 2.5, color: "8898AA" });
    s.addText("CCF's Promise\nto You", {
      fontFace: HEADER, fontSize: 34, color: WHITE, bold: true,
      x: 0.5, y: 3.0, w: 3.2, h: 1.4, lineSpacingMultiple: 1.0,
    });
    s.addText("Before we ask anything of you, here is what we commit to as your employer.", {
      fontFace: BODY, fontSize: 11, color: "8898AA", italic: true,
      x: 0.5, y: 4.5, w: 3.0, h: 0.8, lineSpacingMultiple: 1.3,
    });

    const promises = [
      { ic: "🎯", title: "You'll Know Where You Stand", desc: "Clear expectations, direct feedback, 30/60/90-day reviews on schedule." },
      { ic: "📈", title: "Growth Is Real Here", desc: "Crew leads come from within. High performers get compensated." },
      { ic: "🛡️", title: "We Back Our Team", desc: "Difficult customers? Office handles it. Safety stops the job." },
      { ic: "🤝", title: "You're Not a Number", desc: "Family-owned. Leadership knows your name and your work." },
      { ic: "🔧", title: "You'll Have What You Need", desc: "Proper equipment. Clear processes. Tools and systems." },
      { ic: "🏆", title: "Proud of the Work", desc: "Lifetime warranty. 100% American materials. The standard." },
    ];

    const pcols = 2, prows = 3;
    const pw = 4.2, ph = 1.5;
    promises.forEach((p, i) => {
      const col = i % pcols, row = Math.floor(i / pcols);
      const px = 4.5 + col * (pw + 0.15);
      const py = 0.5 + row * (ph + 0.15);

      s.addShape("roundRect", {
        x: px, y: py, w: pw, h: ph, rectRadius: 0.08,
        fill: { color: ICE },
        line: { color: BORDER, width: 0.5 },
      });
      s.addText(p.title, {
        fontFace: HEADER, fontSize: 14, color: NAVY_DK, bold: true,
        x: px + 0.2, y: py + 0.2, w: pw - 0.4, h: 0.4,
      });
      s.addText(p.desc, {
        fontFace: BODY, fontSize: 10, color: MUTED, lineSpacingMultiple: 1.3,
        x: px + 0.2, y: py + 0.65, w: pw - 0.4, h: 0.7,
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 6: ROLE & EXPECTATIONS
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    addRedBar(s);

    monoLabel(s, "04  ROLE & EXPECTATIONS", { color: RED });
    s.addText("Your Role & Expectations", {
      fontFace: HEADER, fontSize: 28, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.5,
    });

    const rows = [
      ["Daily Responsibilities", "Fence installation, measuring, material handling, photo documentation in Company Cam every job."],
      ["Physical Requirements", "Lifting 60+ lbs. Extended outdoor work in all Florida weather. Uneven terrain is standard."],
      ["Tools Used", "Post hole diggers, augers, saws, nail guns, levels. ARC Site + Measure App."],
      ["Quality Standard", "Posts plumb. Alignment clean. Zero debris. Company Cam close-out photos confirm every job."],
      ["Customer Interaction", "Professional, brief, respectful. Questions go to crew lead. No field commitments."],
      ["Work Schedule", "Monday–Friday. Hours per job schedule. Weather delays through office."],
      ["Reporting Structure", "You → Crew Lead → Director of Sales → Luke (Owner)."],
    ];

    const tx = 0.5, tw = 12.3;
    const headerH = 0.35;
    const rowH = 0.6;
    const ty = 1.3;

    // Header row
    s.addShape("rect", { x: tx, y: ty, w: tw, h: headerH, fill: { color: NAVY } });
    s.addText("CATEGORY", { fontFace: MONO, fontSize: 8, color: WHITE, charSpacing: 2, x: tx + 0.15, y: ty, w: 2.5, h: headerH, valign: "middle" });
    s.addText("DETAILS", { fontFace: MONO, fontSize: 8, color: WHITE, charSpacing: 2, x: tx + 2.8, y: ty, w: 9.3, h: headerH, valign: "middle" });

    rows.forEach((r, i) => {
      const ry = ty + headerH + i * rowH;
      const bgColor = i % 2 === 0 ? WARM : WHITE;
      s.addShape("rect", { x: tx, y: ry, w: tw, h: rowH, fill: { color: bgColor }, line: { color: BORDER, width: 0.3 } });
      s.addText(r[0], { fontFace: BODY, fontSize: 10, color: NAVY_DK, bold: true, x: tx + 0.15, y: ry, w: 2.5, h: rowH, valign: "middle" });
      s.addText(r[1], { fontFace: BODY, fontSize: 10, color: MUTED, x: tx + 2.8, y: ry, w: 9.3, h: rowH, valign: "middle", lineSpacingMultiple: 1.2 });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 7: DAY-ONE DOCUMENTS
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    addRedBar(s);

    monoLabel(s, "02  DAY-ONE DOCUMENTS", { color: RED });
    s.addText("Day-One Documents", {
      fontFace: HEADER, fontSize: 28, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.5,
    });
    s.addText("Legally required. Complete before or on your first day.", {
      fontFace: BODY, fontSize: 11, color: MUTED, italic: true,
      x: 0.5, y: 1.1, w: 8, h: 0.3,
    });

    const docs = [
      "Form I-9 — Employment Eligibility Verification",
      "W-4 — Federal Tax Withholding",
      "Florida State Tax Forms (if applicable)",
      "Direct Deposit Authorization",
      "Emergency Contact Form",
      "Driver's License / Government ID — copy on file",
      "Employee Handbook Acknowledgment",
    ];

    // QA fix: tighter padding to fit all 7 + footer
    const docStartY = 1.65;
    const docH = 0.55; // reduced from 0.65
    docs.forEach((d, i) => {
      const dy = docStartY + i * docH;
      const bgColor = i % 2 === 0 ? ICE : WHITE;
      s.addShape("rect", { x: 0.5, y: dy, w: 11.5, h: docH, fill: { color: bgColor }, line: { color: BORDER, width: 0.3 } });
      // Checkbox
      s.addShape("roundRect", {
        x: 0.7, y: dy + 0.12, w: 0.3, h: 0.3, rectRadius: 0.05,
        fill: { color: WHITE }, line: { color: BORDER, width: 1 },
      });
      s.addText(d, {
        fontFace: BODY, fontSize: 11, color: NAVY_DK,
        x: 1.2, y: dy, w: 10.5, h: docH, valign: "middle",
      });
    });

    // Footer bar
    const footerY = docStartY + docs.length * docH + 0.2;
    s.addShape("roundRect", {
      x: 0.5, y: footerY, w: 11.5, h: 0.65, rectRadius: 0.06,
      fill: { color: ICE }, line: { color: BORDER, width: 0.5 },
    });
    s.addText("📋  OFFICE CONTACT", {
      fontFace: MONO, fontSize: 8, color: NAVY_DK, charSpacing: 1.5, bold: true,
      x: 0.8, y: footerY + 0.05, w: 5, h: 0.25,
    });
    s.addText("720 W Broad Street, Groveland, FL  ·  (352) 429-9999  ·  info@completecustomfence.com", {
      fontFace: BODY, fontSize: 9, color: MUTED,
      x: 0.8, y: footerY + 0.3, w: 10, h: 0.25,
    });
  }

  // ════════════════════════════════════════
  // SLIDE 8: SAFETY GUIDELINES
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    addRedBar(s);

    monoLabel(s, "07  SAFETY GUIDELINES", { color: RED });
    s.addText("Safety Guidelines", {
      fontFace: HEADER, fontSize: 28, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.5,
    });

    // Red 811 banner
    s.addShape("roundRect", {
      x: 0.5, y: 1.3, w: 12.3, h: 1.3, rectRadius: 0.1,
      fill: { color: RED },
    });
    s.addText("⚠️  FLORIDA LAW — CALL 811 BEFORE EVERY DIG", {
      fontFace: MONO, fontSize: 10, color: WHITE, bold: true, charSpacing: 1.5,
      x: 0.8, y: 1.4, w: 11, h: 0.3,
    });
    s.addText("Florida Statute 556 requires calling 811 before any ground penetration — no exceptions. The office coordinates during permitting, but every crew member must verbally confirm before any post hole digger touches the ground.", {
      fontFace: BODY, fontSize: 10, color: WHITE, lineSpacingMultiple: 1.3,
      x: 0.8, y: 1.75, w: 11.5, h: 0.7,
    });

    const safety = [
      { ic: "🥾", title: "Required PPE", desc: "Steel-toed boots, safety glasses, gloves, high-vis vest near roadways. Not optional." },
      { ic: "🌡️", title: "Heat & Weather", desc: "Hydrate constantly. Lightning within 10 miles stops the job. Look out for your crew." },
      { ic: "⚙️", title: "Equipment Safety", desc: "Inspect tools before use. Report defects immediately. Augers require two-person handling." },
      { ic: "🚨", title: "Incident Reporting", desc: "Any injury, near-miss, or property damage — even minor — reported immediately and logged same day." },
    ];

    const scw = 2.95, sch = 2.8;
    safety.forEach((sf, i) => {
      const sx = 0.5 + i * (scw + 0.15);
      const sy = 2.9;
      s.addShape("roundRect", {
        x: sx, y: sy, w: scw, h: sch, rectRadius: 0.08,
        fill: { color: ICE }, line: { color: BORDER, width: 0.5 },
      });
      s.addText(sf.title, {
        fontFace: HEADER, fontSize: 15, color: NAVY_DK, bold: true,
        x: sx + 0.2, y: sy + 0.25, w: scw - 0.4, h: 0.35,
      });
      s.addText(sf.desc, {
        fontFace: BODY, fontSize: 10, color: MUTED, lineSpacingMultiple: 1.4,
        x: sx + 0.2, y: sy + 0.7, w: scw - 0.4, h: 1.8,
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 9: 30/60/90 DAY PLAN
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    addRedBar(s);

    monoLabel(s, "08  30 / 60 / 90 DAY PLAN", { color: RED });
    s.addText("30 / 60 / 90 Day Plan", {
      fontFace: HEADER, fontSize: 28, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.5,
    });

    const phases = [
      {
        label: "DAYS 1–30", title: "Learn", items: [
          "Complete all orientation paperwork",
          "Shadow experienced crew on 3–5 jobs",
          "Learn installation standards",
          "Onboard to all 9 apps",
          "Log Company Cam photos every job",
          "PPE compliance daily",
          "30-day supervisor check-in",
        ],
      },
      {
        label: "DAYS 31–60", title: "Execute", items: [
          "Lead install sections supervised",
          "JotForm entries without prompting",
          "Active Knocker D2D workflow",
          "Hit productivity benchmarks",
          "Customer-facing professionalism",
          "60-day formal evaluation",
        ],
      },
      {
        label: "DAYS 61–90", title: "Elevate", items: [
          "Fully independent on standard installs",
          "Identifying quality issues proactively",
          "Mentoring newer teammates",
          "Crew lead track conversation",
          "90-day review & compensation",
          "Eligible for performance incentives",
        ],
      },
    ];

    const pcw = 3.95, pch = 5.2;
    phases.forEach((ph, i) => {
      const px = 0.5 + i * (pcw + 0.15);
      const py = 1.4;

      // Card
      s.addShape("roundRect", {
        x: px, y: py, w: pcw, h: pch, rectRadius: 0.08,
        fill: { color: ICE }, line: { color: BORDER, width: 0.5 },
      });
      // Header bar
      s.addShape("rect", { x: px, y: py, w: pcw, h: 0.9, fill: { color: NAVY } });
      s.addText(ph.label, {
        fontFace: MONO, fontSize: 8, color: RED, charSpacing: 2,
        x: px + 0.2, y: py + 0.1, w: pcw - 0.4, h: 0.25,
      });
      s.addText(ph.title, {
        fontFace: HEADER, fontSize: 18, color: WHITE, bold: true,
        x: px + 0.2, y: py + 0.4, w: pcw - 0.4, h: 0.4,
      });

      // Items
      ph.items.forEach((item, j) => {
        s.addText(`—  ${item}`, {
          fontFace: BODY, fontSize: 9.5, color: MUTED, lineSpacingMultiple: 1.2,
          x: px + 0.2, y: py + 1.1 + j * 0.55, w: pcw - 0.4, h: 0.45,
        });
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 10: TECH STACK
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    addRedBar(s);

    monoLabel(s, "11  TECH STACK & TOOLS", { color: RED });
    s.addText("Tech Stack & Tools", {
      fontFace: HEADER, fontSize: 28, color: NAVY_DK, bold: true,
      x: 0.5, y: 0.6, w: 8, h: 0.5,
    });
    s.addText("Functional in all 9 platforms by Day 30.", {
      fontFace: BODY, fontSize: 11, color: MUTED, italic: true,
      x: 0.5, y: 1.1, w: 8, h: 0.3,
    });

    const apps = [
      { name: "Gmail", desc: "Primary communication", color: "EA4335", tag: "Required" },
      { name: "Company Cam", desc: "Photo documentation", color: "1565C0", tag: "Field" },
      { name: "JobNimbus", desc: "CRM & job management", color: "2563EB", tag: "Required" },
      { name: "Active Knocker", desc: "D2D tracking & leads", color: "E07B28", tag: "Field" },
      { name: "Discord", desc: "Team communication", color: "5865F2", tag: "Required" },
      { name: "Natural Forms", desc: "Digital forms & data", color: "2ECC71", tag: "Field" },
      { name: "ARC Site", desc: "Mobile estimating", color: "BF1120", tag: "Field" },
      { name: "Turbo Scan", desc: "Mobile scanning", color: "445568", tag: "Office" },
      { name: "Measure App", desc: "Quick confirmations", color: "1A3461", tag: "Field" },
    ];

    const acols = 3, arows = 3;
    const aw = 3.8, ah = 1.6, agap = 0.2;
    const asx = 0.5, asy = 1.65;

    apps.forEach((app, i) => {
      const col = i % acols, row = Math.floor(i / acols);
      const ax = asx + col * (aw + agap);
      const ay = asy + row * (ah + agap);

      s.addShape("roundRect", {
        x: ax, y: ay, w: aw, h: ah, rectRadius: 0.06,
        fill: { color: ICE }, line: { color: BORDER, width: 0.5 },
      });
      // Color bar
      s.addShape("rect", { x: ax, y: ay, w: aw, h: 0.06, fill: { color: app.color } });
      // Name
      s.addText(app.name, {
        fontFace: HEADER, fontSize: 14, color: NAVY_DK, bold: true,
        x: ax + 0.2, y: ay + 0.2, w: aw - 0.4, h: 0.35,
      });
      // Desc
      s.addText(app.desc, {
        fontFace: BODY, fontSize: 10, color: MUTED,
        x: ax + 0.2, y: ay + 0.55, w: aw - 0.4, h: 0.3,
      });
      // Tag
      const tagColor = app.tag === "Required" ? RED : app.tag === "Field" ? "1B6645" : MUTED;
      const tagBg = app.tag === "Required" ? "FBF0F1" : app.tag === "Field" ? "E8F5EE" : ICE;
      s.addShape("roundRect", {
        x: ax + 0.2, y: ay + ah - 0.45, w: 1.0, h: 0.28, rectRadius: 0.04,
        fill: { color: tagBg }, line: { color: tagColor, width: 0.5, transparency: 50 },
      });
      s.addText(app.tag.toUpperCase(), {
        fontFace: MONO, fontSize: 7, color: tagColor, charSpacing: 1,
        x: ax + 0.2, y: ay + ah - 0.45, w: 1.0, h: 0.28, align: "center", valign: "middle",
      });
    });
  }

  // ════════════════════════════════════════
  // SLIDE 11: ACKNOWLEDGMENT
  // ════════════════════════════════════════
  {
    const s = pres.addSlide();
    s.background = { color: NAVY_DK };
    addRedBar(s);

    monoLabel(s, "14  ACKNOWLEDGMENT", { x: 0.5, y: 0.4, color: "8898AA" });
    s.addText("Acknowledgment", {
      fontFace: HEADER, fontSize: 34, color: WHITE, bold: true,
      x: 0.5, y: 0.8, w: 8, h: 0.6,
    });
    s.addText("Review each item. Sign below to confirm receipt and understanding of this orientation kit.", {
      fontFace: BODY, fontSize: 12, color: "8898AA", italic: true,
      x: 0.5, y: 1.5, w: 10, h: 0.4,
    });

    // Signature block
    s.addShape("roundRect", {
      x: 0.5, y: 2.3, w: 12.3, h: 4.5, rectRadius: 0.1,
      fill: { color: WHITE, transparency: 96 },
      line: { color: WHITE, width: 0.3, transparency: 85 },
    });

    // Header bar inside signature block
    s.addShape("rect", { x: 0.5, y: 2.3, w: 12.3, h: 0.6, fill: { color: NAVY } });
    s.addText("Employee Signature Block", {
      fontFace: HEADER, fontSize: 16, color: WHITE, bold: true,
      x: 0.8, y: 2.3, w: 6, h: 0.6, valign: "middle",
    });
    s.addText("Complete Custom Fence · New Hire Orientation Kit · 2026", {
      fontFace: MONO, fontSize: 7, color: "8898AA", charSpacing: 1,
      x: 7, y: 2.3, w: 5.5, h: 0.6, valign: "middle", align: "right",
    });

    // Signature lines
    const sigFields = [
      ["Employee Printed Name", "Employee Signature"],
      ["Date", "Supervisor Signature & Title"],
    ];

    sigFields.forEach((row, ri) => {
      row.forEach((label, ci) => {
        const fx = 1.0 + ci * 5.8;
        const fy = 3.4 + ri * 1.8;

        s.addText(label.toUpperCase(), {
          fontFace: MONO, fontSize: 7, color: "8898AA", charSpacing: 1.5,
          x: fx, y: fy, w: 5, h: 0.2,
        });
        s.addShape("rect", {
          x: fx, y: fy + 0.6, w: 5.0, h: 0.02,
          fill: { color: BORDER },
        });
      });
    });

    // Footer
    s.addText("Complete Custom Fence  ·  720 W Broad St, Groveland FL 34736  ·  (352) 429-9999", {
      fontFace: MONO, fontSize: 7, color: "5A6A7A", charSpacing: 1,
      x: 0.5, y: 7.0, w: 12, h: 0.3, align: "center",
    });
  }

  // ── SAVE ──
  const outPath = path.resolve("CCF_Orientation_Deck.pptx");
  await pres.writeFile({ fileName: outPath });
  console.log(`\nPPTX saved: ${outPath}`);
}

main().catch(console.error);
