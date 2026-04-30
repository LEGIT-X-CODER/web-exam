package com.receiver;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.logging.Logger;

@WebServlet("/save")
public class CodeReceiverServlet extends HttpServlet {

    private static final Logger LOG = Logger.getLogger(CodeReceiverServlet.class.getName());
    private static final String WORK_DIR = "C:/temp/code_runner/";
    private static final String SCRIPT_NAME = "script.py";

    @Override
    public void init() throws ServletException {
        try {
            Files.createDirectories(Paths.get(WORK_DIR));
        } catch (IOException e) {
            throw new ServletException("Cannot create work directory", e);
        }
    }

    @Override
    protected void doOptions(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        addCorsHeaders(resp);
        resp.setStatus(HttpServletResponse.SC_OK);
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        addCorsHeaders(resp);
        resp.setContentType("text/plain; charset=UTF-8");

        String code = readRequestBody(req);
        if (code == null || code.isBlank()) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            resp.getWriter().write("ERROR: Empty code.");
            return;
        }

        try {
            Files.writeString(Paths.get(WORK_DIR, SCRIPT_NAME), code, StandardCharsets.UTF_8);
            resp.getWriter().write("SUCCESS: script.py saved.");
        } catch (IOException e) {
            resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            resp.getWriter().write("ERROR: " + e.getMessage());
        }
    }

    private String readRequestBody(HttpServletRequest req) throws IOException {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = req.getReader()) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    private void addCorsHeaders(HttpServletResponse resp) {
        resp.setHeader("Access-Control-Allow-Origin", "*");
        resp.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        resp.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
}
