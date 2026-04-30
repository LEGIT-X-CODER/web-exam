/**
 * script.js — PyRunner Remote Frontend
 *
 * Sends Python code to a backend Java Servlet running on Apache Tomcat.
 * Endpoint: http://<BACKEND_IP>:8080/PythonRunner/run
 */

"use strict";

/* =====================================================
   CONFIGURATION — change BACKEND_IP here OR via the
   ⚙️ settings button in the UI.
   ===================================================== */
/* =====================================================
   CONFIGURATION — track three specialized node IPs
   ===================================================== */
const DEFAULT_IP = "localhost";
const BACKEND_PORT = "8083";

/* =====================================================
   DOM REFERENCES
   ===================================================== */
const codeEditor     = document.getElementById("codeEditor");
const dataEditor     = document.getElementById("dataEditor"); // NEW
const runBtn         = document.getElementById("runBtn");
const clearBtn       = document.getElementById("clearBtn");
const loadSampleBtn  = document.getElementById("loadSampleBtn");
const output         = document.getElementById("output");
const consoleStats   = document.getElementById("consoleStats");
const execTime       = document.getElementById("execTime");
const execStatus     = document.getElementById("execStatus");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText    = document.getElementById("loadingText"); // NEW
const lineNumbers    = document.getElementById("lineNumbers");
const lineCount      = document.getElementById("lineCount");
const charCount      = document.getElementById("charCount");
const statusPill     = document.getElementById("statusPill");
const statusDot      = document.getElementById("statusDot");
const statusLabel    = document.getElementById("statusLabel");
const consoleScroll  = document.getElementById("consoleScroll");
const copyOutputBtn  = document.getElementById("copyOutputBtn");
const clearOutputBtn = document.getElementById("clearOutputBtn");

/* Node Labels in footer */
const codeNodeUrlEl  = document.getElementById("codeNodeUrl");
const dataNodeUrlEl  = document.getElementById("dataNodeUrl");
const execNodeUrlEl  = document.getElementById("execNodeUrl");

/* Modal */
const configBtn      = document.getElementById("configBtn");
const modalBackdrop  = document.getElementById("modalBackdrop");
const modalClose     = document.getElementById("modalClose");
const modalCancel    = document.getElementById("modalCancel");
const modalSave      = document.getElementById("modalSave");

/* Modal Inputs */
const codeIpInput    = document.getElementById("codeIpInput");
const dataIpInput    = document.getElementById("dataIpInput");
const execIpInput    = document.getElementById("execIpInput");

/* =====================================================
   STATE
   ===================================================== */
let codeIp = localStorage.getItem("pyrunner_code_ip") || DEFAULT_IP;
let dataIp = localStorage.getItem("pyrunner_data_ip") || DEFAULT_IP;
let execIp = localStorage.getItem("pyrunner_exec_ip") || DEFAULT_IP;

let isRunning = false;

/* =====================================================
   UTILITIES
   ===================================================== */
function updateNodeLabels() {
  codeNodeUrlEl.textContent = `Code: ${codeIp}`;
  dataNodeUrlEl.textContent = `Data: ${dataIp}`;
  execNodeUrlEl.textContent = `Exec: ${execIp}`;
}

function setStatus(state, label) {
  statusPill.className = "status-pill " + state;
  statusLabel.textContent = label;
}

function setOutput(text, type = "active") {
  output.textContent = text;
  output.className   = "console-output " + type;
}

function showLoading(visible, text = "Executing...") {
  loadingOverlay.style.display = visible ? "flex" : "none";
  loadingText.textContent = text;
}

function showStats(time, ok) {
  consoleStats.style.display = "flex";
  execTime.textContent = `⏱ ${time}ms`;
  execStatus.textContent = ok ? "✓ Success" : "✗ Error";
  execStatus.className   = ok ? "ok" : "err";
}

/* ── Line numbers sync ── */
function updateLineNumbers() {
  const lines = codeEditor.value.split("\n");
  lineNumbers.textContent = lines.map((_, i) => i + 1).join("\n");
  lineCount.textContent = `Lines: ${lines.length}`;
  charCount.textContent = `Chars: ${codeEditor.value.length}`;
}

codeEditor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
});

codeEditor.addEventListener("input", updateLineNumbers);

/* =====================================================
   SAMPLE CODE
   ===================================================== */
const SAMPLE_CODE = `import math

def calculate_circle_area(radius):
    return math.pi * radius**2

# We will read 'r' from the Data Machine's data.txt if needed
# For now, let's just print something
print("Executing code from Code Machine...")
print(f"Area of circle with radius 5: {calculate_circle_area(5):.2f}")
`;

const SAMPLE_DATA = `# State variables for Data Machine
radius = 10
user_id = "admin_77"
execution_mode = "distributed"
`;

loadSampleBtn.addEventListener("click", () => {
  codeEditor.value = SAMPLE_CODE;
  dataEditor.value = SAMPLE_DATA;
  updateLineNumbers();
  codeEditor.focus();
});

clearBtn.addEventListener("click", () => {
  codeEditor.value = "";
  dataEditor.value = "";
  updateLineNumbers();
  codeEditor.focus();
});

/* =====================================================
   OUTPUT CONTROLS
   ===================================================== */
clearOutputBtn.addEventListener("click", () => {
  setOutput("$ Console cleared. Ready.", "");
  consoleStats.style.display = "none";
  setStatus("", "Ready");
});

copyOutputBtn.addEventListener("click", async () => {
  const text = output.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyOutputBtn.textContent = "Copied!";
    setTimeout(() => (copyOutputBtn.textContent = "Copy"), 1800);
  } catch {
    copyOutputBtn.textContent = "Failed";
  }
});

/* =====================================================
   BACKEND CONFIG MODAL
   ===================================================== */
function openModal() {
  codeIpInput.value = codeIp;
  dataIpInput.value = dataIp;
  execIpInput.value = execIp;
  modalBackdrop.style.display = "flex";
}

function closeModal() {
  modalBackdrop.style.display = "none";
}

configBtn.addEventListener("click",  openModal);
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);

modalSave.addEventListener("click", () => {
  codeIp = codeIpInput.value.trim() || DEFAULT_IP;
  dataIp = dataIpInput.value.trim() || DEFAULT_IP;
  execIp = execIpInput.value.trim() || DEFAULT_IP;

  localStorage.setItem("pyrunner_code_ip", codeIp);
  localStorage.setItem("pyrunner_data_ip", dataIp);
  localStorage.setItem("pyrunner_exec_ip", execIp);

  updateNodeLabels();
  closeModal();
  setOutput(`$ Distributed Nodes Configured.\n$ Ready.`, "");
  setStatus("", "Ready");
});

/* =====================================================
   MAIN: DISTRIBUTED RUN
   ===================================================== */
async function runCode() {
  if (isRunning) return;

  const code = codeEditor.value.trim();
  const data = dataEditor.value.trim();

  if (!code) {
    setOutput("⚠ No code to execute.", "error");
    return;
  }

  isRunning = true;
  runBtn.disabled = true;
  runBtn.classList.add("running");
  runBtn.querySelector(".btn-label").textContent = "Running…";

  setOutput("$ Initiating distributed execution...\n", "");
  consoleStats.style.display = "none";

  const startTime = performance.now();

  try {
    // 1. Save Code to Code Machine
    showLoading(true, "Saving code to Code Machine...");
    const codeRes = await fetch(`http://${codeIp}:${BACKEND_PORT}/code-receiver/save`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: code,
    });
    if (!codeRes.ok) throw new Error(`Code Machine Error: ${codeRes.status}`);
    setOutput(output.textContent + "> Code Machine: Saved successfully.\n");

    // 2. Save Data to Data Machine
    showLoading(true, "Saving data to Data Machine...");
    const dataRes = await fetch(`http://${dataIp}:${BACKEND_PORT}/data-receiver/save`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: data || "# No data provided",
    });
    if (!dataRes.ok) throw new Error(`Data Machine Error: ${dataRes.status}`);
    setOutput(output.textContent + "> Data Machine: Saved successfully.\n");

    // 3. Execute on Executioner Machine
    showLoading(true, "Triggering execution on Executioner Machine...");
    const execRes = await fetch(`http://${execIp}:${BACKEND_PORT}/executioner/run`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: code, // Still sending code for execution convenience
    });

    const elapsed = Math.round(performance.now() - startTime);
    const resultText = await execRes.text();

    if (execRes.ok) {
      setOutput(output.textContent + "\n" + (resultText || "(no output)"), "active");
      setStatus("success", "Success");
      showStats(elapsed, true);
    } else {
      throw new Error(`Executioner Error: ${execRes.status}\n${resultText}`);
    }

  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    setOutput(output.textContent + "\n❌ FAILED\n" + err.message, "error");
    setStatus("error", "Error");
    showStats(elapsed, false);
  } finally {
    isRunning = false;
    runBtn.disabled = false;
    runBtn.classList.remove("running");
    runBtn.querySelector(".btn-label").textContent = "Run Code";
    showLoading(false);
    consoleScroll.scrollTop = consoleScroll.scrollHeight;
  }
}

/* ── Run button click ── */
runBtn.addEventListener("click", runCode);

/* =====================================================
   INIT
   ===================================================== */
updateNodeLabels();
updateLineNumbers();

/* Pre-load a small welcome message */
codeEditor.value = `# Welcome to PyRunner Distributed 🚀
# Code Machine: Saves your scripts.
# Data Machine: Saves your variables.
# Executioner: Runs the code.

print("Hello from the distributed system!")
`;
updateLineNumbers();

/* If no custom IP set, prompt user on first load */
if (!localStorage.getItem("pyrunner_code_ip")) {
  setTimeout(() => {
    openModal();
  }, 800);
}
