import React, { useEffect, useRef } from 'react';

interface Entity {
    entity: string;
    count: number;
    type: string;
}

export function BarChart({ data }: { data: Entity[] }) {
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

        const pad = { top: 16, right: 16, bottom: 40, left: 48 };
        const chartW = w - pad.left - pad.right;
        const chartH = h - pad.top - pad.bottom;

        const items = data.slice(0, 12);
        const maxVal = Math.max(...items.map(d => d.count));
        const barH = chartH / items.length - 4;

        ctx.clearRect(0, 0, w, h);

        const TYPE_COLORS: Record<string, string> = {
            person: '#00e5ff',
            org: '#9fe873',
            place: '#f5a623',
            concept: '#b86bff'
        };

        items.forEach((d, i) => {
            const y = pad.top + i * (barH + 4);
            const barW = (d.count / maxVal) * chartW;
            const color = TYPE_COLORS[d.type] || '#00e5ff';

            // Bar
            ctx.fillStyle = color + '33';
            ctx.fillRect(pad.left, y, barW, barH);
            ctx.fillStyle = color;
            ctx.fillRect(pad.left, y, 3, barH);

            // Label
            ctx.fillStyle = '#8888aa';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(d.entity.slice(0, 20), pad.left - 6, y + barH / 2 + 4);

            // Value
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.fillText(String(d.count), pad.left + barW + 4, y + barH / 2 + 4);
        });
    }, [data]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', display: 'block' }}
        />
    );
}
