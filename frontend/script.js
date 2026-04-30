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
const DEFAULT_BACKEND_IP = "localhost"; // ← change this to your Laptop B's IP
const BACKEND_PORT        = "8080";
const BACKEND_PATH        = "/PythonRunner/run";

/* =====================================================
   DOM REFERENCES
   ===================================================== */
const codeEditor     = document.getElementById("codeEditor");
const runBtn         = document.getElementById("runBtn");
const clearBtn       = document.getElementById("clearBtn");
const loadSampleBtn  = document.getElementById("loadSampleBtn");
const output         = document.getElementById("output");
const consoleStats   = document.getElementById("consoleStats");
const execTime       = document.getElementById("execTime");
const execStatus     = document.getElementById("execStatus");
const loadingOverlay = document.getElementById("loadingOverlay");
const lineNumbers    = document.getElementById("lineNumbers");
const lineCount      = document.getElementById("lineCount");
const charCount      = document.getElementById("charCount");
const statusPill     = document.getElementById("statusPill");
const statusDot      = document.getElementById("statusDot");
const statusLabel    = document.getElementById("statusLabel");
const backendUrlEl   = document.getElementById("backendUrl");
const consoleScroll  = document.getElementById("consoleScroll");
const copyOutputBtn  = document.getElementById("copyOutputBtn");
const clearOutputBtn = document.getElementById("clearOutputBtn");

/* Modal */
const configBtn      = document.getElementById("configBtn");
const modalBackdrop  = document.getElementById("modalBackdrop");
const modalClose     = document.getElementById("modalClose");
const modalCancel    = document.getElementById("modalCancel");
const modalSave      = document.getElementById("modalSave");
const backendIpInput = document.getElementById("backendIpInput");

/* =====================================================
   STATE
   ===================================================== */
let backendIp  = localStorage.getItem("pyrunner_ip") || DEFAULT_BACKEND_IP;
let isRunning  = false;

/* =====================================================
   UTILITIES
   ===================================================== */
function getEndpoint() {
  return `http://${backendIp}:${BACKEND_PORT}${BACKEND_PATH}`;
}

function updateBackendLabel() {
  backendUrlEl.textContent = `http://${backendIp}:${BACKEND_PORT}`;
}

function setStatus(state, label) {
  statusPill.className = "status-pill " + state;
  statusLabel.textContent = label;
}

function setOutput(text, type = "active") {
  output.textContent = text;
  output.className   = "console-output " + type;
}

function showLoading(visible) {
  loadingOverlay.style.display = visible ? "flex" : "none";
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

/* ── Sync scroll between textarea and line numbers ── */
codeEditor.addEventListener("scroll", () => {
  lineNumbers.scrollTop = codeEditor.scrollTop;
});

/* ── Tab key support ── */
codeEditor.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeEditor.selectionStart;
    const end   = codeEditor.selectionEnd;
    codeEditor.value =
      codeEditor.value.substring(0, start) + "    " + codeEditor.value.substring(end);
    codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
    updateLineNumbers();
  }

  /* Ctrl + Enter → Run */
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runCode();
  }
});

codeEditor.addEventListener("input", updateLineNumbers);

/* =====================================================
   SAMPLE CODE
   ===================================================== */
const SAMPLE_CODE = `# Sample: Fibonacci sequence + statistics
import math

def fibonacci(n):
    a, b = 0, 1
    seq = []
    for _ in range(n):
        seq.append(a)
        a, b = b, a + b
    return seq

n = 12
fib = fibonacci(n)
print(f"First {n} Fibonacci numbers:")
print(fib)

total = sum(fib)
avg   = total / len(fib)
print(f"\\nSum  : {total}")
print(f"Mean : {avg:.2f}")
print(f"Max  : {max(fib)}")
print(f"sqrt(Max): {math.sqrt(max(fib)):.4f}")
`;

loadSampleBtn.addEventListener("click", () => {
  codeEditor.value = SAMPLE_CODE;
  updateLineNumbers();
  codeEditor.focus();
});

clearBtn.addEventListener("click", () => {
  codeEditor.value = "";
  updateLineNumbers();
  codeEditor.focus();
});

/* =====================================================
   OUTPUT CONTROLS
   ===================================================== */
clearOutputBtn.addEventListener("click", () => {
  setOutput("$ Console cleared. Write some code and click Run.", "");
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
    setTimeout(() => (copyOutputBtn.textContent = "Copy"), 1800);
  }
});

/* =====================================================
   BACKEND CONFIG MODAL
   ===================================================== */
function openModal() {
  backendIpInput.value    = backendIp;
  modalBackdrop.style.display = "flex";
  setTimeout(() => backendIpInput.focus(), 80);
}

function closeModal() {
  modalBackdrop.style.display = "none";
}

configBtn.addEventListener("click",  openModal);
modalClose.addEventListener("click", closeModal);
modalCancel.addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

modalSave.addEventListener("click", () => {
  const ip = backendIpInput.value.trim();
  if (!ip) { backendIpInput.focus(); return; }
  backendIp = ip;
  localStorage.setItem("pyrunner_ip", ip);
  updateBackendLabel();
  closeModal();
  setOutput(`$ Backend configured → http://${ip}:${BACKEND_PORT}\n$ Ready to execute Python code.`, "");
  setStatus("", "Ready");
});

backendIpInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") modalSave.click();
});

/* =====================================================
   MAIN: RUN CODE
   ===================================================== */
async function runCode() {
  if (isRunning) return;

  const code = codeEditor.value.trim();
  if (!code) {
    setOutput("⚠ No code to execute. Write some Python first.", "error");
    return;
  }

  isRunning = true;
  runBtn.disabled = true;
  runBtn.classList.add("running");
  runBtn.querySelector(".btn-label").textContent = "Running…";

  showLoading(true);
  setStatus("running", "Executing…");
  setOutput("$ Sending code to remote server…\n$ Please wait…", "");
  consoleStats.style.display = "none";

  const startTime = performance.now();

  try {
    const response = await fetch(getEndpoint(), {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    code,
    });

    const elapsed = Math.round(performance.now() - startTime);
    const text    = await response.text();

    if (response.ok) {
      setOutput(text || "(no output)", "active");
      setStatus("success", "Success");
      showStats(elapsed, true);
    } else {
      const msg = `Server returned HTTP ${response.status} ${response.statusText}\n\n${text}`;
      setOutput(msg, "error");
      setStatus("error", `HTTP ${response.status}`);
      showStats(elapsed, false);
    }

    /* Auto-scroll console to bottom */
    consoleScroll.scrollTop = consoleScroll.scrollHeight;

  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);

    let friendlyMsg;
    if (err instanceof TypeError && err.message.toLowerCase().includes("fetch")) {
      friendlyMsg =
        `⚡ Network Error — Cannot reach the backend server.\n\n` +
        `  Endpoint tried: ${getEndpoint()}\n\n` +
        `  Possible causes:\n` +
        `  • Tomcat is not running on Laptop B\n` +
        `  • Wrong IP address (click ⚙️ to change)\n` +
        `  • Both laptops must be on the same Wi-Fi\n` +
        `  • Firewall is blocking port ${BACKEND_PORT}\n\n` +
        `  Quick check: open http://${backendIp}:${BACKEND_PORT} in a browser.`;
    } else {
      friendlyMsg = `Unexpected error:\n${err.message}`;
    }

    setOutput(friendlyMsg, "error");
    setStatus("error", "Network Error");
    showStats(elapsed, false);
  } finally {
    isRunning = false;
    runBtn.disabled = false;
    runBtn.classList.remove("running");
    runBtn.querySelector(".btn-label").textContent = "Run Code";
    showLoading(false);
  }
}

/* ── Run button click ── */
runBtn.addEventListener("click", runCode);

/* =====================================================
   INIT
   ===================================================== */
updateBackendLabel();
updateLineNumbers();

/* Pre-load a small welcome message */
codeEditor.value = `# Welcome to PyRunner Remote 🚀
# Your Python code runs on a remote server via HTTP.
#
# Tip: Press Ctrl+Enter to run, or click "Sample" for a demo.

print("Hello from the remote machine!")
`;
updateLineNumbers();

/* If no custom IP set, prompt user on first load */
if (!localStorage.getItem("pyrunner_ip")) {
  setTimeout(() => {
    openModal();
  }, 800);
}
