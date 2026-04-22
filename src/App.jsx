import { useState, useRef, useCallback } from "react";

const RULEBOOK_VERSION = "v26";
const LAST_CHECKED = "April 16, 2026";

const GUARDIAN_SYSTEM_PROMPT = `You are Guardian, a dietary supplement label compliance auditing system. You reason from FDA 21 CFR Part 101, FTC, USDA, and Amazon policies.

AUTHORITY HIERARCHY: FDA 21 CFR Part 101 → FTC → USDA → Amazon policies
REVIEW ORDER: 1. PDP 2. SFP 3. Left Panel 4. Other Ingredients 5. Non-Label Tasks
SEVERITY: CRITICAL = Stop print/sale. WARNING = Fix before next run. NOTE = Low risk.
OUTPUT: LABEL = Fix printed label. VERIFY = Confirm externally. BOTH = Fix + verify.
CONFIDENCE: Confirmed = General regulatory facts. Verify = Product-specific facts.

KEY RULES SUMMARY:
L1.1 GENERAL: American spelling; trademark symbols on branded ingredients; trade name alongside common name; correct FDA units; website URL subjects entire site to FDA; minimum legibility standards.
L1.2 CLAIMS: Asterisk after every health claim; named disease = drug claim remove; no diagnosis/treatment/cure/prevention; Amazon prohibited keywords removed; action-oriented words require higher substantiation.
L1.3 ORGANIC: Organic seal matches certified %; USDA certifying agent on label; Made in USA requires mfg+processing+packaging in US.
L1.4 PDP: Dietary Supplement on statement of identity; net quantity in bottom 30% of PDP; total mg claim verified against SFP sum; asterisk next to total mg references equivalency footnote not FDA disclaimer.
L1.5 SFP: Supplement Facts title case 2x size full width; min 6pt font; hairline box; comma separators on values 1000+; trace minerals show less than 1% not 0%; DV ingredients show %DV number never symbol; non-DV use correct footnote symbol; asterisk only for calorie footnote; 2000 calorie footnote required when DV present; Calories %DV blank; Total Sugars %DV blank; FDA mandatory vitamin/mineral sequence per 21 CFR 101.36; non-essential nutrients descending order after thick line; FDA standard of identity names; sentence case in SFP body; L-/D- prefix capitalize prefix and first letter; vitamins/minerals standard of identity name plus form in parentheses; minerals elemental amount primary; botanical format: Common Name (plant part) Form; scientific names optional but flag species ambiguity; only scientific names italicized; equivalency claims NOT inside SFP; proprietary blend total on same line as blend name; DV ingredients cannot be inside proprietary blend; N-Acetyl-L-Cysteine correct format.
L1.6 OTHER INGREDIENTS: No intervening material between SFP/Other Ingredients/Allergen/Company Contact; heading must be Other Ingredients: not Ingredients:; descending order by weight; no SFP ingredients repeated; May contain must be confirmed with manufacturer; company contact before Warning section.
L1.7 LEFT PANEL: medical condition not known medical condition; FDA Disclaimer once only in bold in box; disclaimer singular/plural matches claim count; disclaimer only required when health claims present.
L1.8 PROBIOTICS: Microbial scientific names italicized; each distinct strain listed separately; quantitative counts verifiable until end of shelf life.
L2.1 COA: Heavy metals verified per serving; claims substantiation meets FTC standard; ID testing method accepted by FDA; seals supported by manufacturer written statements.
L2.2 STATE: Prop 65 limits for high-risk botanicals; Prop 65 warning on label if threshold exceeded; formula against state-banned ingredient lists.
L2.3 AMAZON: TIC Certificate on file; product title matches label; full SFP image in listing; no raw material equivalents or ratios in listing; expiration date visible; lot number visible.

GUARDIAN BEHAVIOR: Read every ingredient name character by character. When spelling error found in one location scan every other instance. Before flagging symbol usage trace every symbol to its footnote. Consolidate duplicate findings. Every finding needs what is wrong plus why it matters plus exact recommendation. Every Confirmed finding needs exact fix plus regulatory basis. Every Verify finding needs what is missing plus specific open question only never suggest an answer. If image area is too small or unclear flag it before proceeding.

OUTPUT FORMAT - Respond ONLY with valid JSON no preamble no markdown fences:
{
  "summary": {
    "product_name": "string or Unknown",
    "audit_date": "string",
    "total_findings": 0,
    "critical_count": 0,
    "warning_count": 0,
    "note_count": 0,
    "overall_status": "FAIL or PASS WITH WARNINGS or PASS"
  },
  "findings": [
    {
      "id": "F001",
      "panel": "PDP or SFP or LEFT PANEL or OTHER INGREDIENTS or GENERAL or AMAZON or STATE or COA",
      "severity": "CRITICAL or WARNING or NOTE",
      "output_type": "LABEL or VERIFY or BOTH",
      "confidence": "Confirmed or Verify",
      "title": "short title",
      "what_is_wrong": "clear description",
      "why_it_matters": "rule or regulation violated",
      "recommendation": "Change to exact text OR Remove OR Confirm with supplier question OR Verify against document OR No action needed"
    }
  ],
  "non_label_tasks": [
    {
      "id": "V001",
      "category": "COA & TESTING or STATE REQUIREMENTS or AMAZON",
      "severity": "CRITICAL or WARNING",
      "task": "description of what needs to be verified externally"
    }
  ]
}`;

const uid = () => Math.random().toString(36).slice(2, 9);
const nowStr = () =>
  new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const SEV = {
  CRITICAL: { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  WARNING: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  NOTE: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  PASS: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  "PASS WITH WARNINGS": { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  FAIL: { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
  COMPLETED: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  PENDING: { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  FAILED: { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA" },
};

const PANEL_COLOR = {
  PDP: "#7C3AED",
  SFP: "#0284C7",
  "LEFT PANEL": "#059669",
  "OTHER INGREDIENTS": "#B45309",
  GENERAL: "#4B5563",
  AMAZON: "#EA580C",
  STATE: "#DB2777",
  COA: "#0D9488",
};

const OUT_ICON = { LABEL: "🏷️", VERIFY: "✅", BOTH: "🔄" };

const RULEBOOK_SECTIONS = [
  {
    id: "L1.1",
    label: "General & Appearance",
    rules: [
      "American spelling throughout",
      "Trademark symbols on branded ingredients",
      "Trade name alongside common name always",
      "Correct FDA unit formats",
      "Website URL = entire site subject to FDA",
      "All text minimum legibility standards",
    ],
  },
  {
    id: "L1.2",
    label: "Claims",
    rules: [
      "Asterisk (*) immediately after every health claim",
      "Named disease anywhere = drug claim — remove",
      "No diagnosis / treatment / cure / prevention language",
      "Remove Amazon prohibited keywords",
      "Action-oriented words require higher substantiation",
    ],
  },
  {
    id: "L1.3",
    label: "Organic & Origin",
    rules: [
      "Organic seal matches certified % of product",
      "USDA certifying agent identified on label",
      '"Made in USA" — mfg + processing + packaging in US',
    ],
  },
  {
    id: "L1.4",
    label: "Front Panel (PDP)",
    rules: [
      '"Dietary Supplement" on statement of identity',
      "Net quantity in bottom 30% of PDP, parallel to base",
      "Total mg claim must match sum of all SFP ingredients",
      "Asterisk next to total mg → equivalency footnote (not FDA disclaimer)",
    ],
  },
  {
    id: "L1.5",
    label: "Supplement Facts Panel",
    rules: [
      '"Supplement Facts" — title case, 2× size, full width',
      "Minimum 6pt font (5.5pt acceptable)",
      "Enclosed in hairline box",
      "Comma separators on values ≥ 1,000",
      "Trace minerals: < 1% not 0% in %DV",
      "DV ingredients: %DV number — never a symbol",
      "Non-DV ingredients: correct footnote symbol",
      "Calorie footnote: asterisk (*) only",
      "2,000 calorie footnote required when any DV present",
      "Calories %DV column → blank",
      "Total Sugars %DV column → blank",
      "FDA mandatory vitamin/mineral sequence per 21 CFR 101.36",
      "Non-essential nutrients: descending order after thick line",
      "Every ingredient: FDA standard of identity name",
      "SFP body: sentence case",
      "Botanical format: Common Name (plant part) Form",
      "Equivalency claims NOT inside SFP",
      "Proprietary blend total on same line as blend name",
    ],
  },
  {
    id: "L1.6",
    label: "Other Ingredients",
    rules: [
      'Heading must be "Other Ingredients:" not "Ingredients:"',
      "Descending order by weight",
      "No SFP ingredients repeated here",
      '"May contain" — confirm actual cross-contact risk with manufacturer',
      "Company contact appears before Warning section",
    ],
  },
  {
    id: "L1.7",
    label: "Left Panel",
    rules: [
      '"medical condition" — not "known medical condition"',
      "FDA Disclaimer: once only, in bold, in separate box",
      "Disclaimer singular/plural must match claim count",
      "Disclaimer only required when health claims are present",
    ],
  },
  {
    id: "L1.8",
    label: "Probiotics",
    rules: [
      "Microbial scientific names correctly italicized",
      "Each distinct strain listed separately",
      "Quantitative counts verifiable until end of shelf life",
    ],
  },
  {
    id: "L2.1",
    label: "COA & Testing",
    rules: [
      "Heavy metals verified per serving against state limits",
      "Claims substantiation meets current FTC standard",
      "ID testing method accepted by FDA",
      "All seals supported by manufacturer written statements",
    ],
  },
  {
    id: "L2.2",
    label: "State Requirements",
    rules: [
      "Prop 65 limits verified for high-risk botanicals",
      "Prop 65 warning on label if threshold exceeded",
      "Formula verified against state-banned ingredient lists",
    ],
  },
  {
    id: "L2.3",
    label: "Amazon Requirements",
    rules: [
      "TIC Certificate on file",
      "Product title matches label",
      "Full SFP image included in listing",
      "No raw material equivalents or concentration ratios in listing",
      "Expiration date visible on product",
      "Lot number visible on product",
      "Every ingredient weight in listing exactly matches SFP",
    ],
  },
];

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function GuardianDashboard() {
  const [page, setPage] = useState("dashboard");
  const [scans, setScans] = useState([]);
  const [detail, setDetail] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [panelFilter, setPanelFilter] = useState("all");
  const [openSection, setOpenSection] = useState(null);
  const [checked, setChecked] = useState({});
  const [tableFilter, setTableFilter] = useState("All Scans");
  const fileRef = useRef();

  const total = scans.length;
  const completed = scans.filter((s) => s.status === "COMPLETED").length;
  const pending = scans.filter((s) => s.status === "PENDING").length;
  const failed = scans.filter((s) => s.status === "FAILED").length;

  const processFile = useCallback(async (file) => {
    const isImage = file?.type?.startsWith("image/");
    const isPDF = file?.type === "application/pdf";
    if (!file || (!isImage && !isPDF)) return;

    const id = uid();
    const previewUrl = URL.createObjectURL(file);
    setScans((prev) => [
      {
        id,
        name: file.name,
        status: "PENDING",
        created: nowStr(),
        result: null,
        imageUrl: previewUrl,
        isPDF,
      },
      ...prev,
    ]);
    setPage("dashboard");
    setUploading(true);

    try {
      const base64 = await readFileAsBase64(file);

      const steps = [
        isPDF ? "Reading PDF document..." : "Analyzing PDP — Front Panel...",
        "Reviewing Supplement Facts Panel...",
        "Checking Left Panel — Warnings & Directions...",
        "Reviewing Other Ingredients...",
        "Running Non-Label Verification Tasks...",
        "Compiling findings...",
      ];
      let si = 0;
      setUploadProgress(steps[0]);
      const iv = setInterval(() => {
        si++;
        if (si < steps.length) setUploadProgress(steps[si]);
      }, 1400);

      // Build content block — PDF uses document type, image uses image type
      const contentBlock = isPDF
        ? {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          }
        : {
            type: "image",
            source: { type: "base64", media_type: file.type, data: base64 },
          };

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-beta": "pdfs-2024-09-25",
          "x-api-key":
            "process.env.REACT_APP_ANTHROPIC_API_KEY-api03-XWWAaEL6M1JpTbMXwKXtVLsyqQa3xOXI8s1POiCB5aOUhDhQpbCb51tU_BqSmKvJ9pkrq1XobLVEYJ_furNzQw-i_JWAwAA",
        },

        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: GUARDIAN_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: [
                contentBlock,
                {
                  type: "text",
                  text: "Audit this dietary supplement label. Follow Guardian review order: PDP → SFP → Left Panel → Other Ingredients → Non-Label Tasks. Apply ALL rules systematically. Read every ingredient name character by character. Trace every symbol to its footnote. Consolidate duplicate findings. Return ONLY the JSON — no preamble, no markdown fences.",
                },
              ],
            },
          ],
        }),
      });

      clearInterval(iv);
      const data = await resp.json();
      const raw = data.content?.map((b) => b.text || "").join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setScans((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "COMPLETED",
                result: parsed,
                productName: parsed.summary.product_name,
              }
            : s
        )
      );
    } catch (err) {
      console.error(err);
      setScans((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "FAILED" } : s))
      );
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }, []);

  const handleFiles = (files) => [...files].forEach((f) => processFile(f));
  const openDetail = (scan) => {
    setDetail(scan);
    setExpandedId(null);
    setPanelFilter("all");
    setPage("detail");
  };
  const deleteScan = (id, e) => {
    e.stopPropagation();
    setScans((p) => p.filter((s) => s.id !== id));
    if (detail?.id === id) {
      setDetail(null);
      setPage("dashboard");
    }
  };

  const displayedScans = scans.filter((s) => {
    if (tableFilter === "All Scans") return true;
    if (tableFilter === "Pending") return s.status === "PENDING";
    if (tableFilter === "Completed") return s.status === "COMPLETED";
    if (tableFilter === "Failed") return s.status === "FAILED";
    return true;
  });

  const uniquePanels = [
    ...new Set(detail?.result?.findings?.map((f) => f.panel) || []),
  ];
  const filteredFindings =
    detail?.result?.findings?.filter(
      (f) => panelFilter === "all" || f.panel === panelFilter
    ) || [];

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#F1F5F9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: 248,
          background: "#fff",
          borderRight: "1px solid #E2E8F0",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "18px 16px 16px",
            borderBottom: "1px solid #F1F5F9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: "linear-gradient(135deg,#4F46E5,#7C3AED)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 18,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              G
            </div>
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 800,
                  color: "#0F172A",
                  letterSpacing: "-0.02em",
                }}
              >
                Guardian
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>
                AI Compliance QA
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding: "10px 10px", flex: 1 }}>
          {[
            {
              id: "upload",
              icon: "↑",
              label: "Upload",
              sub: "Upload files for analysis",
            },
            {
              id: "dashboard",
              icon: "▦",
              label: "Dashboard",
              sub: "View scan results",
            },
            {
              id: "rulebook",
              icon: "≡",
              label: "Rulebook",
              sub: "Manage compliance rules",
            },
          ].map((n) => {
            const active =
              page === n.id || (page === "detail" && n.id === "dashboard");
            return (
              <button
                key={n.id}
                onClick={() => {
                  setPage(n.id);
                  if (n.id !== "detail") setDetail(null);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: "none",
                  background: active ? "#EEF2FF" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: 2,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    background: active ? "#4F46E5" : "#F1F5F9",
                    color: active ? "#fff" : "#64748B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {n.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      color: active ? "#4338CA" : "#374151",
                      lineHeight: 1.3,
                    }}
                  >
                    {n.label}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.3 }}
                  >
                    {n.sub}
                  </div>
                </div>
                {n.id === "dashboard" && pending > 0 && (
                  <span
                    style={{
                      marginLeft: "auto",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#F59E0B",
                      flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "12px 14px", borderTop: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "linear-gradient(135deg,#4F46E5,#7C3AED)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              GF
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                Gino Franco
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>
                Rulebook {RULEBOOK_VERSION} · {LAST_CHECKED}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* UPLOAD PAGE */}
        {page === "upload" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#0F172A",
                  margin: 0,
                  letterSpacing: "-0.03em",
                }}
              >
                Upload
              </h1>
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 5 }}>
                Upload label images or PDFs for Guardian compliance analysis
              </p>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragOver ? "#4F46E5" : "#CBD5E1"}`,
                borderRadius: 16,
                padding: "72px 40px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver ? "#EEF2FF" : "#fff",
                transition: "all 0.18s",
                maxWidth: 560,
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.3 }}>
                ⬆
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#1E293B",
                  marginBottom: 6,
                }}
              >
                Drop label files here
              </div>
              <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 22 }}>
                PNG, JPG, WEBP and PDF supported
              </div>
              <div
                style={{
                  display: "inline-block",
                  background: "linear-gradient(135deg,#4F46E5,#7C3AED)",
                  color: "#fff",
                  borderRadius: 9,
                  padding: "10px 26px",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Choose Files
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            {uploading && (
              <div
                style={{
                  marginTop: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "#EEF2FF",
                  border: "1px solid #C7D2FE",
                  borderRadius: 10,
                  padding: "13px 18px",
                  maxWidth: 560,
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2.5px solid #C7D2FE",
                    borderTopColor: "#4F46E5",
                    animation: "spin 0.7s linear infinite",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{ fontSize: 13, color: "#4338CA", fontWeight: 500 }}
                >
                  {uploadProgress}
                </span>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD PAGE */}
        {page === "dashboard" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 26,
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#0F172A",
                    margin: 0,
                    letterSpacing: "-0.03em",
                  }}
                >
                  Dashboard
                </h1>
                <p style={{ fontSize: 13, color: "#64748B", marginTop: 5 }}>
                  Monitor your compliance scans and view results
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#64748B",
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    padding: "7px 12px",
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#22C55E",
                      display: "inline-block",
                    }}
                  />
                  Rulebook {RULEBOOK_VERSION} · {LAST_CHECKED}
                </div>
                <button
                  onClick={() => setPage("upload")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    background: "linear-gradient(135deg,#4F46E5,#7C3AED)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ↑ Upload Label
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,1fr)",
                gap: 14,
                marginBottom: 26,
              }}
            >
              {[
                {
                  label: "Total Scans",
                  value: total,
                  icon: "▦",
                  iconBg: "#F1F5F9",
                  iconColor: "#64748B",
                },
                {
                  label: "Completed",
                  value: completed,
                  icon: "✓",
                  iconBg: "#DCFCE7",
                  iconColor: "#16A34A",
                },
                {
                  label: "Pending",
                  value: pending,
                  icon: "◷",
                  iconBg: "#FEF9C3",
                  iconColor: "#CA8A04",
                },
                {
                  label: "Failed",
                  value: failed,
                  icon: "✕",
                  iconBg: "#FEE2E2",
                  iconColor: "#DC2626",
                },
              ].map((c) => (
                <div
                  key={c.label}
                  style={{
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 13,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 11,
                      background: c.iconBg,
                      color: c.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 20,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {c.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94A3B8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 2,
                      }}
                    >
                      {c.label}
                    </div>
                    <div
                      style={{
                        fontSize: 28,
                        fontWeight: 800,
                        color: "#0F172A",
                        lineHeight: 1,
                      }}
                    >
                      {c.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "#fff",
                border: "1px solid #E2E8F0",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "14px 18px",
                  borderBottom: "1px solid #F1F5F9",
                }}
              >
                {["All Scans", "Pending", "Completed", "Failed"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setTableFilter(f)}
                    style={{
                      padding: "6px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: tableFilter === f ? "#4F46E5" : "#F8FAFC",
                      color: tableFilter === f ? "#fff" : "#64748B",
                      fontSize: 13,
                      fontWeight: tableFilter === f ? 700 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {displayedScans.length === 0 ? (
                <div style={{ padding: "64px 20px", textAlign: "center" }}>
                  <div
                    style={{ fontSize: 40, opacity: 0.15, marginBottom: 14 }}
                  >
                    ▦
                  </div>
                  <div
                    style={{ fontSize: 14, color: "#94A3B8", marginBottom: 16 }}
                  >
                    {scans.length === 0
                      ? "No audits yet — upload a label to get started"
                      : `No ${tableFilter.toLowerCase()} scans`}
                  </div>
                  {scans.length === 0 && (
                    <button
                      onClick={() => setPage("upload")}
                      style={{
                        background: "linear-gradient(135deg,#4F46E5,#7C3AED)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9,
                        padding: "10px 22px",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Upload Label
                    </button>
                  )}
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      <th style={{ width: 44, padding: "10px 16px" }}></th>
                      <th
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94A3B8",
                          letterSpacing: "0.06em",
                        }}
                      >
                        FILE / PRODUCT
                      </th>
                      <th
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94A3B8",
                          letterSpacing: "0.06em",
                        }}
                      >
                        STATUS
                      </th>
                      <th
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94A3B8",
                          letterSpacing: "0.06em",
                        }}
                      >
                        FINDINGS
                      </th>
                      <th
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94A3B8",
                          letterSpacing: "0.06em",
                        }}
                      >
                        CREATED
                      </th>
                      <th
                        style={{
                          padding: "10px 14px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#94A3B8",
                          letterSpacing: "0.06em",
                        }}
                      >
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedScans.map((scan) => {
                      const ss = SEV[scan.status] || SEV.NOTE;
                      const os = scan.result?.summary?.overall_status;
                      const oStyle = os ? SEV[os] || SEV.NOTE : null;
                      return (
                        <tr
                          key={scan.id}
                          style={{ borderTop: "1px solid #F8FAFC" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "#FAFBFF")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "")
                          }
                        >
                          <td style={{ padding: "12px 16px" }}>
                            <input
                              type="checkbox"
                              checked={!!checked[scan.id]}
                              onChange={(e) => {
                                e.stopPropagation();
                                setChecked((p) => ({
                                  ...p,
                                  [scan.id]: !p[scan.id],
                                }));
                              }}
                              style={{
                                width: 15,
                                height: 15,
                                accentColor: "#4F46E5",
                                cursor: "pointer",
                              }}
                            />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: "50%",
                                  background: ss.bg,
                                  border: `1.5px solid ${ss.border}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 11,
                                  color: ss.color,
                                  flexShrink: 0,
                                  fontWeight: 700,
                                }}
                              >
                                {scan.status === "COMPLETED"
                                  ? "✓"
                                  : scan.status === "PENDING"
                                  ? "…"
                                  : "✕"}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "#1E293B",
                                  }}
                                >
                                  {scan.productName || scan.name}
                                </div>
                                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                                  ID: {scan.id}...
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                color: ss.color,
                                background: ss.bg,
                                border: `1px solid ${ss.border}`,
                                borderRadius: 6,
                                padding: "3px 10px",
                              }}
                            >
                              {scan.status}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            {scan.result ? (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "#EF4444",
                                    fontWeight: 700,
                                  }}
                                >
                                  {scan.result.summary.critical_count} Critical
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "#D97706",
                                    fontWeight: 700,
                                  }}
                                >
                                  {scan.result.summary.warning_count} Warning
                                </span>
                                {oStyle && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 700,
                                      color: oStyle.color,
                                      background: oStyle.bg,
                                      border: `1px solid ${oStyle.border}`,
                                      borderRadius: 5,
                                      padding: "2px 8px",
                                    }}
                                  >
                                    {os}
                                  </span>
                                )}
                              </div>
                            ) : scan.status === "PENDING" ? (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <div
                                  style={{
                                    width: 13,
                                    height: 13,
                                    borderRadius: "50%",
                                    border: "2px solid #C7D2FE",
                                    borderTopColor: "#4F46E5",
                                    animation: "spin 0.7s linear infinite",
                                  }}
                                />
                                <span
                                  style={{ fontSize: 12, color: "#94A3B8" }}
                                >
                                  Analyzing...
                                </span>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "#94A3B8" }}>
                                —
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: "12px 14px",
                              fontSize: 12,
                              color: "#64748B",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {scan.created}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: 12 }}>
                              {scan.status === "COMPLETED" && (
                                <button
                                  onClick={() => openDetail(scan)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#4F46E5",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    padding: 0,
                                  }}
                                >
                                  ◉ Details
                                </button>
                              )}
                              <button
                                onClick={(e) => deleteScan(scan.id, e)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "#EF4444",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  padding: 0,
                                }}
                              >
                                🗑 Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* DETAIL PAGE */}
        {page === "detail" && detail?.result && (
          <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
            <button
              onClick={() => {
                setPage("dashboard");
                setDetail(null);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#4F46E5",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 22,
                padding: 0,
              }}
            >
              ← Back to Dashboard
            </button>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              <div style={{ width: 270, flexShrink: 0 }}>
                {detail.imageUrl && (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #E2E8F0",
                      borderRadius: 14,
                      overflow: "hidden",
                      marginBottom: 14,
                    }}
                  >
                    <img
                      src={detail.imageUrl}
                      alt="Label"
                      style={{
                        width: "100%",
                        display: "block",
                        maxHeight: 300,
                        objectFit: "contain",
                        background: "#F8FAFC",
                      }}
                    />
                  </div>
                )}
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 14,
                    padding: "16px 18px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#0F172A",
                      marginBottom: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {detail.result.summary.product_name}
                  </div>
                  {(() => {
                    const os = detail.result.summary.overall_status;
                    const st = SEV[os] || SEV.NOTE;
                    return (
                      <div style={{ marginBottom: 14 }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: st.color,
                            background: st.bg,
                            border: `1px solid ${st.border}`,
                            borderRadius: 8,
                            padding: "5px 12px",
                          }}
                        >
                          {os}
                        </span>
                      </div>
                    );
                  })()}
                  {[
                    {
                      label: "Critical",
                      value: detail.result.summary.critical_count,
                      color: "#EF4444",
                    },
                    {
                      label: "Warning",
                      value: detail.result.summary.warning_count,
                      color: "#D97706",
                    },
                    {
                      label: "Note",
                      value: detail.result.summary.note_count,
                      color: "#2563EB",
                    },
                    {
                      label: "Total",
                      value: detail.result.summary.total_findings,
                      color: "#4F46E5",
                    },
                  ].map((r) => (
                    <div
                      key={r.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 0",
                        borderBottom: "1px solid #F8FAFC",
                      }}
                    >
                      <span style={{ fontSize: 12, color: "#64748B" }}>
                        {r.label}
                      </span>
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: r.color,
                        }}
                      >
                        {r.value}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{ marginTop: 12, fontSize: 11, color: "#94A3B8" }}
                  >
                    Audited {detail.result.summary.audit_date}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: "#0F172A",
                      margin: 0,
                    }}
                  >
                    Audit Findings
                  </h2>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>
                    {filteredFindings.length} findings
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginBottom: 18,
                  }}
                >
                  <button
                    onClick={() => setPanelFilter("all")}
                    style={{
                      padding: "5px 13px",
                      borderRadius: 7,
                      border: "none",
                      background: panelFilter === "all" ? "#4F46E5" : "#F1F5F9",
                      color: panelFilter === "all" ? "#fff" : "#64748B",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    All ({detail.result.findings.length})
                  </button>
                  {uniquePanels.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPanelFilter(p)}
                      style={{
                        padding: "5px 13px",
                        borderRadius: 7,
                        border: "none",
                        background:
                          panelFilter === p
                            ? (PANEL_COLOR[p] || "#4B5563") + "22"
                            : "#F1F5F9",
                        color:
                          panelFilter === p
                            ? PANEL_COLOR[p] || "#4B5563"
                            : "#64748B",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {p} (
                      {
                        detail.result.findings.filter((f) => f.panel === p)
                          .length
                      }
                      )
                    </button>
                  ))}
                </div>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {filteredFindings.map((f) => {
                    const sev = SEV[f.severity] || SEV.NOTE;
                    const isOpen = expandedId === f.id;
                    const pc = PANEL_COLOR[f.panel] || "#64748B";
                    return (
                      <div
                        key={f.id}
                        onClick={() => setExpandedId(isOpen ? null : f.id)}
                        style={{
                          background: "#fff",
                          border: `1px solid ${
                            isOpen ? sev.border : "#E2E8F0"
                          }`,
                          borderLeft: `4px solid ${sev.color}`,
                          borderRadius: 11,
                          padding: "13px 16px",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              letterSpacing: "0.06em",
                              color: sev.color,
                              background: sev.bg,
                              borderRadius: 5,
                              padding: "2px 8px",
                            }}
                          >
                            {f.severity}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: pc,
                              background: pc + "1A",
                              borderRadius: 5,
                              padding: "2px 8px",
                            }}
                          >
                            {f.panel}
                          </span>
                          <span style={{ fontSize: 11, color: "#94A3B8" }}>
                            {OUT_ICON[f.output_type]} {f.output_type}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color:
                                f.confidence === "Confirmed"
                                  ? "#16A34A"
                                  : "#D97706",
                              marginLeft: "auto",
                            }}
                          >
                            {f.confidence === "Confirmed"
                              ? "✓ Confirmed"
                              : "⚠ Verify"}
                          </span>
                          <span style={{ fontSize: 11, color: "#CBD5E1" }}>
                            {isOpen ? "▴" : "▾"}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#1E293B",
                            marginTop: 8,
                            lineHeight: 1.4,
                          }}
                        >
                          {f.title}
                        </div>
                        {isOpen && (
                          <div
                            style={{
                              marginTop: 14,
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                background: "#F8FAFC",
                                borderRadius: 9,
                                padding: "11px 14px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#94A3B8",
                                  letterSpacing: "0.07em",
                                  marginBottom: 5,
                                }}
                              >
                                WHAT IS WRONG
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  lineHeight: 1.6,
                                }}
                              >
                                {f.what_is_wrong}
                              </div>
                            </div>
                            <div
                              style={{
                                background: "#F8FAFC",
                                borderRadius: 9,
                                padding: "11px 14px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#94A3B8",
                                  letterSpacing: "0.07em",
                                  marginBottom: 5,
                                }}
                              >
                                WHY IT MATTERS
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  lineHeight: 1.6,
                                }}
                              >
                                {f.why_it_matters}
                              </div>
                            </div>
                            <div
                              style={{
                                background: sev.bg,
                                border: `1px solid ${sev.border}`,
                                borderRadius: 9,
                                padding: "11px 14px",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: sev.color,
                                  letterSpacing: "0.07em",
                                  marginBottom: 5,
                                  opacity: 0.8,
                                }}
                              >
                                RECOMMENDATION
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#111827",
                                  lineHeight: 1.6,
                                  fontWeight: 600,
                                }}
                              >
                                {f.recommendation}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {detail.result.non_label_tasks?.length > 0 && (
                  <div style={{ marginTop: 28 }}>
                    <h3
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#0F172A",
                        marginBottom: 14,
                      }}
                    >
                      Non-Label Verification Tasks
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {detail.result.non_label_tasks.map((t) => {
                        const ts = SEV[t.severity] || SEV.NOTE;
                        return (
                          <div
                            key={t.id}
                            style={{
                              background: "#fff",
                              border: "1px solid #E2E8F0",
                              borderLeft: `4px solid ${ts.color}`,
                              borderRadius: 11,
                              padding: "11px 16px",
                              display: "flex",
                              gap: 12,
                              alignItems: "flex-start",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 800,
                                color: ts.color,
                                background: ts.bg,
                                borderRadius: 5,
                                padding: "2px 8px",
                                flexShrink: 0,
                                marginTop: 1,
                              }}
                            >
                              {t.severity}
                            </span>
                            <div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#94A3B8",
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                  marginBottom: 3,
                                }}
                              >
                                {t.category}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "#374151",
                                  lineHeight: 1.55,
                                }}
                              >
                                {t.task}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* RULEBOOK PAGE */}
        {page === "rulebook" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 32 }}>
            <div style={{ marginBottom: 28 }}>
              <h1
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#0F172A",
                  margin: 0,
                  letterSpacing: "-0.03em",
                }}
              >
                Rulebook
              </h1>
              <p style={{ fontSize: 13, color: "#64748B", marginTop: 5 }}>
                Guardian Logic Master Document · {RULEBOOK_VERSION} · Last
                checked {LAST_CHECKED}
              </p>
            </div>
            <div
              style={{
                maxWidth: 700,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {RULEBOOK_SECTIONS.map((sec) => (
                <div
                  key={sec.id}
                  style={{
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() =>
                      setOpenSection(openSection === sec.id ? null : sec.id)
                    }
                    style={{
                      width: "100%",
                      padding: "14px 18px",
                      background: "none",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#4F46E5",
                        background: "#EEF2FF",
                        borderRadius: 5,
                        padding: "3px 9px",
                        flexShrink: 0,
                      }}
                    >
                      {sec.id}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1E293B",
                        flex: 1,
                      }}
                    >
                      {sec.label}
                    </span>
                    <span style={{ fontSize: 13, color: "#CBD5E1" }}>
                      {openSection === sec.id ? "▴" : "▾"}
                    </span>
                  </button>
                  {openSection === sec.id && (
                    <div
                      style={{
                        padding: "4px 18px 16px",
                        borderTop: "1px solid #F8FAFC",
                      }}
                    >
                      {sec.rules.map((rule, i) => (
                        <div
                          key={i}
                          style={{
                            fontSize: 13,
                            color: "#374151",
                            padding: "7px 0",
                            borderBottom:
                              i < sec.rules.length - 1
                                ? "1px solid #F8FAFC"
                                : "none",
                            display: "flex",
                            gap: 10,
                            lineHeight: 1.55,
                          }}
                        >
                          <span
                            style={{
                              color: "#C7D2FE",
                              flexShrink: 0,
                              fontWeight: 700,
                            }}
                          >
                            ·
                          </span>
                          {rule}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
