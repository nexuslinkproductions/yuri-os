#!/usr/bin/env node
// Shell execution service — runs OUTSIDE pm2 to avoid posix_spawn EBADF
// Communicate via HTTP on port 3098 with the nudimmud-backend
'use strict';
const http = require('http');
const { spawn } = require('child_process');
const ROOT = process.env.NUDIMMUD_ROOT || '/Users/marcelspatz/YURI-OS-MUSUBI';
const PORT = parseInt(process.env.SHELL_SERVICE_PORT || '3098', 10);
const API_KEY = process.env.SHELL_SERVICE_KEY || 'nudimmud-master-key-2026-04-23';
const SHELL_ENV = { ...process.env, PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' };

const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/run') {
        res.writeHead(404).end('not found');
        return;
    }
    if (req.headers['x-api-key'] !== API_KEY) {
        res.writeHead(401).end('unauthorized');
        return;
    }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
        let command;
        try { command = JSON.parse(body).command; } catch { res.writeHead(400).end('bad json'); return; }
        if (typeof command !== 'string' || !command.trim()) {
            res.writeHead(400).end('command required');
            return;
        }
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });
        const send = obj => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch {} };
        let child;
        try {
            child = spawn('/bin/sh', ['-c', command], {
                cwd: ROOT, env: SHELL_ENV, stdio: ['ignore', 'pipe', 'pipe'],
            });
        } catch (e) {
            send({ type: 'stderr', data: e.message });
            send({ type: 'exit', code: 1 });
            res.end();
            return;
        }
        child.stdout.on('data', d => send({ type: 'stdout', data: d.toString() }));
        child.stderr.on('data', d => send({ type: 'stderr', data: d.toString() }));
        let done = false;
        child.on('error', e => { done = true; send({ type: 'stderr', data: e.message }); res.end(); });
        child.on('close', code => { done = true; send({ type: 'exit', code }); res.end(); });
        res.on('close', () => { if (!done) { try { child.kill(); } catch {} } });
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`nudimmud-shell-service listening on 127.0.0.1:${PORT}`);
});
