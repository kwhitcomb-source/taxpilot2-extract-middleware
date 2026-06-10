import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import multer from "multer";
import crypto from "crypto";
import axios from "axios";

const app = express();

app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));

const upload = multer({ storage: multer.memoryStorage() });

function hmacSha256(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

async function postToBase44(payload) {
  const base44Url = process.env.BASE44_WEBHOOK_URL;
  const secret = process.env.EXTRACTION_WEBHOOK_SECRET;

  if (!base44Url || !secret) {
    console.warn("Missing BASE44_WEBHOOK_URL or EXTRACTION_WEBHOOK_SECRET");
    return;
  }

  const rawBody = JSON.stringify(payload);
  const sig = hmacSha256(secret, rawBody);

  await axios.post(base44Url, payload, {
    headers: {
      "content-type": "application/json",
      "x-extraction-signature": sig
    },
    timeout: 30000
  });
}

// Root + health
app.get("/", (_req, res) => res.status(200).send("ok"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

function requireApiKey(expectedKey) {
  return (req, res, next) => {
    const key = req.header("x-api-key");
    if (!expectedKey) {
      return res.status(500).json({ ok: false, error: "API_KEY_NOT_CONFIGURED" });
    }
    if (!key || key !== expectedKey) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }
    next();
  };
}
app.post(
  "/v1/returns/:id/packages/generate",
  requireApiKey(process.env.FORMS_MIDDLEWARE_API_KEY),
  async (req, res) => {
    // Placeholder: return package shell so Base44 can proceed
    const taxYearProfileId = req.params.id;

    return res.status(200).json({
      ok: true,
      mode: "placeholder",
      message: "Forms engine not configured yet. No PDFs generated.",
      tax_year_profile_id: taxYearProfileId,
      packages: [],
      diagnostics: [
        {
          severity: "Info",
          code: "FORMS_ENGINE_NOT_CONFIGURED",
          message: "Forms generation is stubbed. Configure engine integration to produce PDFs."
        }
      ]
    });
  }
);
app.post(
  "/v1/efile/start",
  requireApiKey(process.env.EFILE_MIDDLEWARE_API_KEY),
  async (req, res) => {
    return res.status(200).json({
      ok: true,
      mode: "placeholder",
      message: "E-file engine not configured yet.",
      submission_id: `stub_${Date.now()}`,
      status: "NotStarted"
    });
  }
);

app.post(
  "/v1/efile/submit",
  requireApiKey(process.env.EFILE_MIDDLEWARE_API_KEY),
  async (req, res) => {
    return res.status(200).json({
      ok: false,
      mode: "placeholder",
      error: "EFILE_ENGINE_NOT_CONFIGURED",
      message: "E-file submit is stubbed. Configure engine integration to submit returns."
    });
  }
);

app.get(
  "/v1/efile/status",
  requireApiKey(process.env.EFILE_MIDDLEWARE_API_KEY),
  async (req, res) => {
    return res.status(200).json({
      ok: true,
      mode: "placeholder",
      status: "NotStarted",
      message: "E-file status is stubbed because engine is not configured."
    });
  }
);
// Upload endpoint
app.post("/v1/uploads", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const meta = req.body || {};

    if (!file) return res.status(400).json({ error: "file required" });

    const jobId = `job_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const requestId = `req_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    // Respond quickly
    res.json({
      job_id: jobId,
      request_id: requestId,
      detected_document_type: "UNKNOWN"
    });

    // MVP placeholder extraction result
    const extracted_fields = {
      note: "Extraction not wired yet. This is a middleware skeleton."
    };

    const webhookPayload = {
      job_id: jobId,
      request_id: requestId,
      upload_id: meta.upload_id || null,
      tax_return_id: meta.tax_return_id || null,
      detected_document_type: meta.file_type || "UNKNOWN",
      extraction_engine: "structured_parser",
      confidence_score: 0.0,
      extracted_fields,
      extracted_confidence: {},
      extracted_errors: {},
      status: "complete"
    };

    await postToBase44(webhookPayload);
  } catch (e) {
    console.error(e);
    // If response already sent, just log. Otherwise return 500.
    if (!res.headersSent) res.status(500).json({ error: "upload failed" });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => console.log(`Listening on ${port}`));
