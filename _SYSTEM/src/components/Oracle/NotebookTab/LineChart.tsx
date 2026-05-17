import React, { useEffect, useRef } from 'react';

interface TemporalPoint {
    date: string;
    eventTitle: string;
    count: number;
}

export function LineChart({ data }: { data: TemporalPoint[] }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !data.length) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        const pad = { top: 24, right: 24, bottom: 56, left: 24 };
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;
        const n = data.length;

        ctx.clearRect(0, 0, w, h);

        if (n < 2) return;

        const points = data.map((d, i) => ({
            x: pad.left + (i / (n - 1)) * chartW,
            y: pad.top + (1 - d.count / Math.max(...data.map(p => p.count))) * chartH,
            d
        }));

        // Gradient fill
        const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
        grad.addColorStop(0, 'rgba(0,229,255,0.25)');
        grad.addColorStop(1, 'rgba(0,229,255,0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[n - 1].x, pad.top + chartH);
        ctx.lineTo(points[0].x, pad.top + chartH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Dots + labels
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00e5ff';
            ctx.fill();

            ctx.save();
            ctx.translate(p.x, pad.top + chartH + 8);
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = '#8888aa';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText(p.d.date.slice(0, 10), 0, 0);
            ctx.restore();
        });
    }, [data]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
        />
    );
}
