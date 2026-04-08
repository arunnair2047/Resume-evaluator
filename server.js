const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Load/save data helpers
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {}
  return { jobs: [], candidates: {} };
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET all data
app.get("/api/data", (req, res) => {
  res.json(loadData());
});

// POST save data
app.post("/api/data", (req, res) => {
  const current = loadData();
  const { jobs, jobId, candidates } = req.body;
  if (jobs !== undefined) current.jobs = jobs;
  if (jobId !== undefined && candidates !== undefined) current.candidates[jobId] = candidates;
  saveData(current);
  res.json({ ok: true });
});

// POST score a resume — proxies to Anthropic, API key never leaves server
app.post("/api/score", async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment" });
  const { resumeText, job } = req.body;
  const prompt = `You are a senior talent acquisition specialist. Evaluate this resume against the job opening.

JOB TITLE: ${job.title}
JOB DESCRIPTION: ${job.jd}
KEY RESPONSIBILITIES: ${job.responsibilities}

RESUME:
${resumeText.slice(0, 4000)}

Respond ONLY with valid JSON, no markdown, no extra text:
{
  "candidateName": "full name from resume or 'Unknown'",
  "totalScore": <integer 0-100>,
  "breakdown": {
    "skillsMatch": {"score": <integer 0-25>, "notes": "<one sentence>"},
    "experienceRelevance": {"score": <integer 0-25>, "notes": "<one sentence>"},
    "domainFit": {"score": <integer 0-25>, "notes": "<one sentence>"},
    "seniorityAlignment": {"score": <integer 0-25>, "notes": "<one sentence>"}
  },
  "strengths": ["<point 1>", "<point 2>", "<point 3>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "<exactly one of: Strong Hire | Hire | Maybe | No Hire>"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scoring failed", detail: err.message });
  }
});

app.listen(PORT, () => console.log(`TA Screener running on port ${PORT}`));
