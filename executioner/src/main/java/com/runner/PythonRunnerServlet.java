package com.runner;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.*;
import java.util.logging.Logger;

/**
 * PythonRunnerServlet
 *
 * Accepts Python source code via HTTP POST (Content-Type: text/plain),
 * saves it to a temp file, executes it using ProcessBuilder, captures
 * stdout + stderr, and returns the combined output as plain text.
 *
 * URL mapping : /run
 * Full URL    : http://<BACKEND_IP>:8080/PythonRunner/run
 *
 * ⚠ WARNING: This is NOT production-safe.
 *   For real deployments, sandbox execution inside Docker containers.
 */
@WebServlet("/run")
public class PythonRunnerServlet extends HttpServlet {

    private static final Logger LOG = Logger.getLogger(PythonRunnerServlet.class.getName());

    /* ── Configuration ── */

    /** Directory where script.py is written before execution. */
    private static final String WORK_DIR = "C:/temp/code_runner/";

    /** Name of the temporary Python file. */
    private static final String SCRIPT_NAME = "script.py";

    /**
     * Maximum execution time in seconds.
     * Processes that exceed this limit are forcibly killed.
     */
    private static final int TIMEOUT_SECONDS = 3;

    /**
     * The Python executable.
     * Use "python3" on Linux/macOS. On Windows "python" usually works.
     * If python is not on PATH, use the full path, e.g. "C:/Python311/python.exe"
     */
    private static final String PYTHON_CMD = "python";

    /* ================================================================
       init — ensure working directory exists
       ================================================================ */
    @Override
    public void init() throws ServletException {
        super.init();
        try {
            Files.createDirectories(Paths.get(WORK_DIR));
            LOG.info("PythonRunnerServlet initialized. Work dir: " + WORK_DIR);
        } catch (IOException e) {
            throw new ServletException("Cannot create work directory: " + WORK_DIR, e);
        }
    }

    /* ================================================================
       OPTIONS — handle CORS pre-flight
       ================================================================ */
    @Override
    protected void doOptions(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {
        addCorsHeaders(resp);
        resp.setStatus(HttpServletResponse.SC_OK);
    }

    /* ================================================================
       POST — receive Python code, execute, return output
       ================================================================ */
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {

        addCorsHeaders(resp);
        resp.setContentType("text/plain; charset=UTF-8");

        /* ── 1. Read request body (Python source code) ── */
        String pythonCode;
        try {
            pythonCode = readRequestBody(req);
        } catch (IOException e) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            resp.getWriter().write("ERROR: Could not read request body.\n" + e.getMessage());
            return;
        }

        if (pythonCode == null || pythonCode.isBlank()) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            resp.getWriter().write("ERROR: Empty code received. Nothing to execute.");
            return;
        }

        /* ── 2. Write code to script.py inside WORK_DIR ── */
        Path scriptPath = Paths.get(WORK_DIR, SCRIPT_NAME);
        try {
            Files.writeString(scriptPath, pythonCode, StandardCharsets.UTF_8);
        } catch (IOException e) {
            resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            resp.getWriter().write("ERROR: Failed to write script file.\n" + e.getMessage());
            return;
        }

        /* ── 3. Execute with ProcessBuilder ── */
        String result = executeScript(scriptPath);

        /* ── 4. Return output ── */
        resp.setStatus(HttpServletResponse.SC_OK);
        resp.getWriter().write(result);
    }

    /* ================================================================
       executeScript — runs script.py and returns combined output
       ================================================================ */
    private String executeScript(Path scriptPath) {

        ProcessBuilder pb = new ProcessBuilder(PYTHON_CMD, scriptPath.toAbsolutePath().toString());

        /* Set working directory to the script's parent (safe) */
        pb.directory(scriptPath.getParent().toFile());

        /* Merge stderr into stdout so we capture everything in one stream */
        pb.redirectErrorStream(true);

        Process process = null;
        StringBuilder output = new StringBuilder();

        try {
            process = pb.start();

        } catch (IOException e) {
            String msg = e.getMessage() == null ? "" : e.getMessage().toLowerCase();
            if (msg.contains("cannot run program") || msg.contains("no such file")) {
                return "ERROR: Python interpreter not found.\n" +
                       "Make sure Python is installed and the '" + PYTHON_CMD + "' command is on PATH.\n" +
                       "On Windows you can check by running:  python --version\n" +
                       "Alternatively, set the full path in PythonRunnerServlet.PYTHON_CMD.\n\n" +
                       "Original error: " + e.getMessage();
            }
            return "ERROR: Failed to start process.\n" + e.getMessage();
        }

        /* ── Read process output with timeout ── */
        final Process finalProcess = process;
        ExecutorService executor = Executors.newSingleThreadExecutor();

        Future<String> future = executor.submit(() -> {
            StringBuilder sb = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(finalProcess.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }
            return sb.toString();
        });

        try {
            /* Wait for process to finish within timeout */
            boolean finished = process.waitFor(TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                LOG.warning("Python script exceeded timeout (" + TIMEOUT_SECONDS + "s) and was terminated.");
                return "⏱ Execution timed out after " + TIMEOUT_SECONDS + " seconds.\n" +
                       "The process was forcibly terminated.\n" +
                       "Hint: Check for infinite loops or long-running computations.";
            }

            /* Collect the captured output */
            String captured = future.get(1, TimeUnit.SECONDS);
            output.append(captured);

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                output.append("\n[Process exited with code: ").append(exitCode).append("]");
            }

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
            return "ERROR: Execution interrupted.";

        } catch (ExecutionException | TimeoutException e) {
            process.destroyForcibly();
            return "ERROR: Could not capture output.\n" + e.getMessage();

        } finally {
            executor.shutdownNow();
        }

        String result = output.toString();
        return result.isEmpty() ? "(script produced no output)" : result;
    }

    /* ================================================================
       HELPERS
       ================================================================ */

    /** Read the raw POST body as a UTF-8 string. */
    private String readRequestBody(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(req.getInputStream(), StandardCharsets.UTF_8))) {
            char[] buf = new char[4096];
            int read;
            while ((read = reader.read(buf)) != -1) {
                sb.append(buf, 0, read);
            }
        }
        return sb.toString();
    }

    /**
     * Add CORS headers so the browser on Laptop A can call Laptop B's Tomcat.
     * In production, restrict the origin to your specific domain.
     */
    private void addCorsHeaders(HttpServletResponse resp) {
        resp.setHeader("Access-Control-Allow-Origin",  "*");
        resp.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        resp.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
}
