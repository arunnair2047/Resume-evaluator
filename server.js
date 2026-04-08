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

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {}
  return { jobs: [], candidates: {} };
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get("/api/data", (req, res) => {
  res.json(loadData());
});

app.post("/api/data", (req, res) => {
  const current = loadData();
  const { jobs, jobId, candidates } = req.body;
  if (jobs !== undefined) current.jobs = jobs;
  if (jobId !== undefined && candidates !== undefined) current.candidates[jobId] = candidates;
  saveData(current);
  res.json({ ok: true });
});

app.post("/api/score", async (req, res) => {
  console.log("Score request received");
  console.log("API_KEY present:", !!API_KEY);
  
  if (!API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  
  const { resumeText, job } = req.body;
  console.log("Resume text length:", resumeText?.length);
  console.log("Job title:", job?.title);

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
    console.log("Calling Anthropic API...");
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
    console.log("Anthropic response status:", response.status);
    console.log("Anthropic response:", JSON.stringify(data).slice(0, 500));
    
    if (!response.ok) {
      return res.status(500).json({ error: "Anthropic API error", detail: data });
    }
    
    const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
    console.log("Raw response text:", raw.slice(0, 200));
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("Scoring error:", err);
    res.status(500).json({ error: "Scoring failed", detail: err.message });
  }
});

app.listen(PORT, () => console.log(`TA Screener running on port ${PORT}`));
