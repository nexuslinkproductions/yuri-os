import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import type React from 'react';
import { useMemo, useState } from 'react';

const routeOrder = [
  { path: '/', label: 'Home', phase: 'I', cipher: 'Prima Materia' },
  { path: '/work', label: 'Work', phase: 'II', cipher: 'Archive' },
  { path: '/services', label: 'Services', phase: 'III', cipher: 'Operations' },
  { path: '/about', label: 'About', phase: 'IV', cipher: 'Anamnesis' },
  { path: '/contact', label: 'Contact', phase: 'V', cipher: 'The Working' },
];

const routeShapes: Record<string, { title: string; angle: number; nodes: number[] }> = {
  '/': { title: 'Frames That Define', angle: 0, nodes: [0, 2, 4] },
  '/work': { title: 'Portfolio Field', angle: 36, nodes: [1, 3, 5] },
  '/services': { title: 'Five Disciplines', angle: 72, nodes: [0, 1, 2, 3, 4] },
  '/about': { title: 'Career Arc', angle: 108, nodes: [2, 4, 6] },
  '/contact': { title: 'Project Gate', angle: 144, nodes: [1, 4, 7] },
};

const routeGuides: Record<string, { caption: string; path: string; minor: string }> = {
  '/': {
    caption: 'Axis / Claim / Memory',
    path: 'M234 646 C372 330 512 226 720 252 C928 278 1068 382 1210 158',
    minor: 'M206 288 C376 198 468 184 622 236 C792 294 942 252 1128 92',
  },
  '/work': {
    caption: 'Archive / Proof / Signal',
    path: 'M176 510 C348 424 430 286 594 308 C776 332 834 548 1038 536 C1126 530 1192 480 1266 386',
    minor: 'M266 696 C470 584 596 594 720 640 C850 688 992 674 1198 560',
  },
  '/services': {
    caption: 'Five Stations / One System',
    path: 'M186 370 L420 232 L610 424 L720 198 L836 424 L1020 232 L1252 370',
    minor: 'M248 606 C416 500 552 500 720 606 C888 500 1024 500 1192 606',
  },
  '/about': {
    caption: 'Origin / Arc / Network',
    path: 'M210 692 C336 522 486 618 560 424 C640 212 806 296 894 420 C996 564 1128 470 1260 248',
    minor: 'M260 256 C414 338 518 344 632 284 C800 196 930 290 1104 226',
  },
  '/contact': {
    caption: 'Brief / Threshold / Working',
    path: 'M180 610 C324 476 430 508 548 384 C650 276 744 276 850 384 C972 512 1090 476 1262 610',
    minor: 'M360 196 L720 566 L1080 196',
  },
};

const systemNodes = [
  { id: 'origin', label: 'Origin', x: 284, y: 206 },
  { id: 'brand', label: 'Brand', x: 462, y: 142 },
  { id: 'frame', label: 'Frame', x: 628, y: 248 },
  { id: 'campaign', label: 'Campaign', x: 842, y: 164 },
  { id: 'motion', label: 'Motion', x: 1048, y: 276 },
  { id: 'social', label: 'Social', x: 1156, y: 472 },
  { id: 'proof', label: 'Proof', x: 982, y: 674 },
  { id: 'network', label: 'Network', x: 744, y: 628 },
  { id: 'craft', label: 'Craft', x: 536, y: 724 },
  { id: 'brief', label: 'Brief', x: 312, y: 612 },
  { id: 'delivery', label: 'Deliver', x: 472, y: 448 },
  { id: 'nexus', label: 'Nexus', x: 720, y: 420 },
];

const routeEdges: Record<string, Array<[string, string]>> = {
  '/': [
    ['origin', 'brand'],
    ['brand', 'frame'],
    ['frame', 'nexus'],
    ['nexus', 'campaign'],
    ['campaign', 'motion'],
    ['nexus', 'delivery'],
    ['delivery', 'proof'],
  ],
  '/work': [
    ['proof', 'network'],
    ['network', 'craft'],
    ['craft', 'delivery'],
    ['delivery', 'nexus'],
    ['nexus', 'frame'],
    ['frame', 'campaign'],
    ['campaign', 'proof'],
  ],
  '/services': [
    ['brief', 'brand'],
    ['brand', 'campaign'],
    ['campaign', 'motion'],
    ['motion', 'social'],
    ['social', 'delivery'],
    ['delivery', 'craft'],
    ['craft', 'brief'],
    ['nexus', 'brand'],
    ['nexus', 'motion'],
  ],
  '/about': [
    ['origin', 'craft'],
    ['craft', 'network'],
    ['network', 'proof'],
    ['proof', 'campaign'],
    ['campaign', 'brand'],
    ['brand', 'origin'],
    ['network', 'nexus'],
  ],
  '/contact': [
    ['brief', 'nexus'],
    ['nexus', 'brand'],
    ['brand', 'campaign'],
    ['campaign', 'delivery'],
    ['delivery', 'social'],
    ['social', 'proof'],
    ['proof', 'brief'],
  ],
};

const boardCells = Array.from({ length: 64 }, (_, index) => ({
  x: 240 + (index % 8) * 120,
  y: 112 + Math.floor(index / 8) * 84,
  odd: (index + Math.floor(index / 8)) % 2 === 0,
}));

function getRouteIndex(pathname: string) {
  const index = routeOrder.findIndex((route) => route.path === pathname);
  return index === -1 ? 0 : index;
}

function getNode(id: string) {
  return systemNodes.find((node) => node.id === id) ?? systemNodes[systemNodes.length - 1];
}

function edgePath(fromId: string, toId: string, lift: number) {
  const from = getNode(fromId);
  const to = getNode(toId);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - lift;
  return `M${from.x} ${from.y} Q${mx} ${my} ${to.x} ${to.y}`;
}

export default function HermeticVeil() {
  const location = useLocation();
  const { scrollYProgress } = useScroll();
  const routeIndex = getRouteIndex(location.pathname);
  const active = routeOrder[routeIndex];
  const shape = routeShapes[active.path];
  const guide = routeGuides[active.path];
  const edges = routeEdges[active.path];
  const [moveIndex, setMoveIndex] = useState(0);
  const rotate = useTransform(scrollYProgress, [0, 1], [shape.angle, shape.angle + 36]);
  const drift = useTransform(scrollYProgress, [0, 1], [0, -54]);
  const lineOpacity = useTransform(scrollYProgress, [0, 0.45, 1], [0.32, 0.18, 0.38]);
  const activeEdges = useMemo(() => edges.slice(0, Math.min(edges.length, moveIndex + 3)), [edges, moveIndex]);
  const activeNodeIds = useMemo(() => new Set(activeEdges.flat()), [activeEdges]);

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    setMoveIndex(Math.min(edges.length - 1, Math.max(0, Math.floor(value * edges.length))));
  });

  return (
    <>
      <motion.div className="hermetic-veil" aria-hidden="true" style={{ y: drift }}>
        <svg viewBox="0 0 1440 960" preserveAspectRatio="xMidYMid slice">
          <defs>
            <radialGradient id="hermeticPulse" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-crimson)" stopOpacity="0.2" />
              <stop offset="54%" stopColor="var(--color-crimson)" stopOpacity="0.045" />
              <stop offset="100%" stopColor="var(--color-crimson)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hermeticLine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-crimson)" stopOpacity="0" />
              <stop offset="48%" stopColor="var(--color-crimson)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--color-crimson)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <motion.g
            className="system-board"
            key={`board-${active.path}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.34 }}
            transition={{ duration: 0.5 }}
          >
            {boardCells.map((cell, index) => (
              <rect
                key={index}
                x={cell.x}
                y={cell.y}
                width="120"
                height="84"
                fill={cell.odd ? 'rgba(255,255,255,0.018)' : 'rgba(220,38,38,0.026)'}
                stroke="rgba(255,255,255,0.035)"
                strokeWidth="0.55"
              />
            ))}
          </motion.g>

          <motion.g
            style={{ rotate, opacity: lineOpacity, transformOrigin: '720px 420px' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          >
            <circle cx="720" cy="420" r="256" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />
            <circle cx="720" cy="420" r="188" fill="none" stroke="var(--color-crimson)" strokeWidth="0.62" opacity="0.72" />
            <circle cx="720" cy="420" r="92" fill="url(#hermeticPulse)" />
            <path d="M720 164 L942 548 L498 548 Z" fill="none" stroke="var(--color-crimson)" strokeWidth="0.72" />
            <path d="M548 248 H892 V592 H548 Z" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.66" />
            <path d="M720 164 V676 M430 420 H1010 M514 214 L926 626 M926 214 L514 626" stroke="url(#hermeticLine)" strokeWidth="0.58" />
            <path d="M606 420 C606 346 657 296 720 296 C783 296 834 346 834 420 C834 494 783 544 720 544 C657 544 606 494 606 420Z" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
            <path d="M720 266 C772 330 772 510 720 574 C668 510 668 330 720 266Z" fill="none" stroke="rgba(220,38,38,0.32)" strokeWidth="0.62" />
          </motion.g>

          <motion.g
            className="system-web"
            key={`web-${active.path}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45 }}
          >
            {edges.map(([from, to], index) => {
              const activeEdge = index <= moveIndex + 2;
              return (
                <motion.path
                  key={`${from}-${to}-${index}`}
                  d={edgePath(from, to, 26 + (index % 4) * 18)}
                  fill="none"
                  stroke={activeEdge ? 'var(--color-crimson)' : 'rgba(255,255,255,0.11)'}
                  strokeWidth={activeEdge ? 0.92 : 0.58}
                  strokeLinecap="round"
                  strokeDasharray={activeEdge ? '1 0' : '5 15'}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: activeEdge ? [0, 1, 1] : 1,
                    opacity: activeEdge ? [0.12, 0.54, 0.3] : 0.16,
                  }}
                  transition={{
                    duration: activeEdge ? 3.8 + index * 0.22 : 0.7,
                    repeat: activeEdge ? Infinity : 0,
                    ease: 'easeInOut',
                    delay: activeEdge ? index * 0.06 : 0,
                    times: activeEdge ? [0, 0.68, 1] : undefined,
                  }}
                />
              );
            })}

            {systemNodes.map((node, index) => {
              const activeNode = activeNodeIds.has(node.id);
              return (
                <motion.g
                  key={node.id}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: activeNode ? 1 : 0.42, scale: activeNode ? 1 : 0.92 }}
                  transition={{ duration: 0.36, delay: index * 0.018 }}
                  style={{ transformOrigin: `${node.x}px ${node.y}px` }}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={activeNode ? 8 : 5}
                    fill={activeNode ? 'var(--color-crimson)' : 'rgba(255,255,255,0.18)'}
                    opacity={activeNode ? 0.82 : 0.48}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={activeNode ? 22 : 14}
                    fill="none"
                    stroke={activeNode ? 'rgba(220,38,38,0.28)' : 'rgba(255,255,255,0.08)'}
                    strokeWidth="0.65"
                  />
                  <text x={node.x + 14} y={node.y - 12} className="system-node-label">
                    {node.label}
                  </text>
                </motion.g>
              );
            })}
          </motion.g>

          <motion.g
            key={active.path}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {shape.nodes.map((node, i) => {
              const angle = ((node / 8) * Math.PI * 2) - Math.PI / 2;
              const x = 720 + Math.cos(angle) * 188;
              const y = 420 + Math.sin(angle) * 188;
              return (
                <motion.circle
                  key={`${node}-${i}`}
                  cx={x}
                  cy={y}
                  r={i === 0 ? 5 : 3.5}
                  fill="var(--color-crimson)"
                  initial={{ opacity: 0.12 }}
                  animate={{ opacity: [0.2, 0.84, 0.32], r: [3.5, 6, 3.5] }}
                  transition={{ duration: 3.6 + i, repeat: Infinity, ease: 'easeInOut' }}
                />
              );
            })}
            <text x="720" y="724" textAnchor="middle" className="hermetic-svg-label">
              {shape.title}
            </text>
          </motion.g>

          <motion.g
            key={`guide-${active.path}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45 }}
          >
            <motion.path
              d={guide.path}
              fill="none"
              stroke="var(--color-crimson)"
              strokeWidth="1"
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.42, 0.18] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.72, 1] }}
            />
            <motion.path
              d={guide.minor}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="0.72"
              strokeDasharray="4 16"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: [0, 1, 1], opacity: [0, 0.32, 0.12] }}
              transition={{ duration: 6.4, repeat: Infinity, ease: 'easeInOut', delay: 0.4, times: [0, 0.7, 1] }}
            />
            <text x="720" y="824" textAnchor="middle" className="hermetic-svg-label">
              {guide.caption}
            </text>
          </motion.g>

          <g opacity="0.34">
            <path d="M92 160 H252 M92 204 H216 M92 248 H288 M1188 160 H1348 M1224 204 H1348 M1168 248 H1348" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
            <path d="M132 748 L260 620 M1180 620 L1308 748" stroke="var(--color-crimson)" strokeWidth="0.62" opacity="0.42" />
            <circle cx="260" cy="620" r="34" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.7" />
            <circle cx="1180" cy="620" r="34" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.7" />
          </g>
        </svg>
      </motion.div>

      <aside className="route-constellation" aria-label="Page sequence">
        <div className="route-constellation__phase">{active.phase}</div>
        <div className="route-constellation__line" aria-hidden="true" />
        {routeOrder.map((route, index) => (
          <Link
            key={route.path}
            to={route.path}
            data-magnetic
            className={`route-constellation__node ${index === routeIndex ? 'is-active' : ''}`}
            aria-current={index === routeIndex ? 'page' : undefined}
          >
            <span>{route.phase}</span>
            <strong>{route.label}</strong>
          </Link>
        ))}
        <div className="route-constellation__cipher">{active.cipher}</div>
      </aside>

      <div className="concept-flow" aria-hidden="true" style={{ '--flow-index': routeIndex } as React.CSSProperties}>
        <div className="concept-flow__beam" />
        {routeOrder.map((route, index) => (
          <div key={route.path} className={`concept-flow__station ${index === routeIndex ? 'is-active' : ''}`}>
            <span>{route.phase}</span>
            <strong>{route.label}</strong>
          </div>
        ))}
      </div>

      <div className="motion-glyph motion-glyph--left" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{guide.caption}</span>
      </div>
      <div className="motion-glyph motion-glyph--right" aria-hidden="true">
        <i />
        <i />
        <i />
        <span>Move {String(moveIndex + 1).padStart(2, '0')} / {String(edges.length).padStart(2, '0')}</span>
      </div>
    </>
  );
}
