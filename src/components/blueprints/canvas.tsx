"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NodeKind = "trigger" | "ai" | "http" | "branch" | "transform" | "output";

interface BlueprintNode {
  id: string;
  type: NodeKind;
  label: string;
  x: number;
  y: number;
  config?: Record<string, string>;
}

interface BlueprintEdge {
  from: string;
  to: string;
}

export interface BlueprintSpec {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

const NODE_W = 180;
const NODE_H = 60;

const NODE_COLORS: Record<NodeKind, { bg: string; ring: string; label: string }> = {
  trigger: { bg: "#1f2a44", ring: "#fb923c", label: "触发器" },
  ai: { bg: "#1c2236", ring: "#22d3ee", label: "AI 步骤" },
  http: { bg: "#1c2236", ring: "#a3e635", label: "HTTP 调用" },
  branch: { bg: "#1c2236", ring: "#facc15", label: "条件分支" },
  transform: { bg: "#1c2236", ring: "#e879f9", label: "数据转换" },
  output: { bg: "#1f2a44", ring: "#34d399", label: "输出 / 通知" },
};

export function BlueprintCanvas({
  blueprintId,
  initialSpec,
  initialName,
}: {
  blueprintId: number;
  initialSpec: BlueprintSpec;
  initialName: string;
}) {
  const router = useRouter();
  const [nodes, setNodes] = useState<BlueprintNode[]>(initialSpec.nodes || []);
  const [edges, setEdges] = useState<BlueprintEdge[]>(initialSpec.edges || []);
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selected) ?? null, [nodes, selected]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, spec: { nodes, edges } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [blueprintId, name, nodes, edges, router]);

  const addNode = useCallback((type: NodeKind) => {
    const id = `n${Date.now()}`;
    const color = NODE_COLORS[type];
    const next: BlueprintNode = {
      id,
      type,
      label: color.label,
      x: 120 + Math.random() * 200,
      y: 120 + Math.random() * 200,
    };
    setNodes((arr) => [...arr, next]);
    setSelected(id);
  }, []);

  const onMouseDownNode = (e: React.MouseEvent, n: BlueprintNode) => {
    if (connecting) {
      // Complete a connection
      if (connecting !== n.id) {
        setEdges((arr) => (arr.some((ed) => ed.from === connecting && ed.to === n.id) ? arr : [...arr, { from: connecting, to: n.id }]));
      }
      setConnecting(null);
      return;
    }
    setSelected(n.id);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { id: n.id, offX: e.clientX - rect.left - n.x, offY: e.clientY - rect.top - n.y };
  };

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragState.current) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const id = dragState.current.id;
      const x = e.clientX - rect.left - dragState.current.offX;
      const y = e.clientY - rect.top - dragState.current.offY;
      setNodes((arr) => arr.map((nn) => (nn.id === id ? { ...nn, x: Math.max(0, x), y: Math.max(0, y) } : nn)));
    }
    function onUp() {
      dragState.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onDeleteSelected = useCallback(() => {
    if (!selected) return;
    setNodes((arr) => arr.filter((n) => n.id !== selected));
    setEdges((arr) => arr.filter((e) => e.from !== selected && e.to !== selected));
    setSelected(null);
  }, [selected]);

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_280px]">
      {/* Palette */}
      <aside className="rounded-lg border border-forge-line bg-forge-panel/60 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-forge-muted">节点库</div>
        <div className="flex flex-col gap-2">
          {(Object.keys(NODE_COLORS) as NodeKind[]).map((k) => (
            <button
              key={k}
              onClick={() => addNode(k)}
              className="flex items-center gap-2 rounded-md border border-forge-line bg-forge px-3 py-2 text-left text-xs text-ink-100 hover:bg-forge-line/60"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: NODE_COLORS[k].ring }} />
              {NODE_COLORS[k].label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-[10px] leading-relaxed text-forge-muted">
          点节点：选中。<br />
          拖动节点：调整位置。<br />
          连接：先点起始节点的「连」按钮，再点目标节点。
        </div>
      </aside>

      {/* Canvas */}
      <div className="rounded-lg border border-forge-line bg-forge-panel/40">
        <div className="flex items-center justify-between border-b border-forge-line/60 px-3 py-2">
          <input
            className="w-72 rounded-md border border-forge-line bg-forge px-2 py-1 text-sm text-ink-50 outline-none focus:border-accent-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="蓝图名称"
          />
          <div className="flex items-center gap-2">
            {savedAt ? <span className="text-xs text-emerald-400">已保存 {savedAt}</span> : null}
            <button
              onClick={onSave}
              disabled={saving}
              className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-forge hover:bg-accent-400 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
        <svg
          ref={canvasRef}
          className="block h-[560px] w-full"
          onClick={() => {
            setSelected(null);
            setConnecting(null);
          }}
        >
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#1c2236" strokeWidth="1" />
            </pattern>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="#7e8aa8" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          {edges.map((e, i) => {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_W;
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            return (
              <path
                key={i}
                d={`M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                stroke="#7e8aa8"
                strokeWidth={1.5}
                fill="none"
                markerEnd="url(#arrowhead)"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setEdges((arr) => arr.filter((_, idx) => idx !== i));
                }}
                style={{ cursor: "pointer" }}
              />
            );
          })}
          {nodes.map((n) => {
            const c = NODE_COLORS[n.type];
            const isSelected = selected === n.id;
            const isConnectingFrom = connecting === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onMouseDownNode(e, n);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: "grab" }}
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={8}
                  fill={c.bg}
                  stroke={isSelected ? "#fb923c" : isConnectingFrom ? "#22d3ee" : c.ring}
                  strokeWidth={isSelected || isConnectingFrom ? 2 : 1.5}
                />
                <text x={12} y={22} fontSize={11} fill="#9aa7bb">
                  {c.label}
                </text>
                <text x={12} y={42} fontSize={13} fontWeight={600} fill="#f5f7fa">
                  {n.label.slice(0, 22)}
                </text>
                <circle cx={NODE_W - 14} cy={NODE_H / 2} r={6} fill="#0c1325" stroke={c.ring} strokeWidth={1.5} />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Inspector */}
      <aside className="rounded-lg border border-forge-line bg-forge-panel/60 p-3">
        {selectedNode ? (
          <div className="flex flex-col gap-3">
            <div className="text-xs uppercase tracking-wider text-forge-muted">节点设置</div>
            <label className="text-xs text-ink-200">
              名称
              <input
                value={selectedNode.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setNodes((arr) => arr.map((n) => (n.id === selectedNode.id ? { ...n, label: v } : n)));
                }}
                className="mt-1 w-full rounded-md border border-forge-line bg-forge px-2 py-1 text-sm text-ink-50 outline-none focus:border-accent-500"
              />
            </label>
            <label className="text-xs text-ink-200">
              类型
              <select
                value={selectedNode.type}
                onChange={(e) => {
                  const v = e.target.value as NodeKind;
                  setNodes((arr) => arr.map((n) => (n.id === selectedNode.id ? { ...n, type: v, label: NODE_COLORS[v].label } : n)));
                }}
                className="mt-1 w-full rounded-md border border-forge-line bg-forge px-2 py-1 text-sm text-ink-50 outline-none focus:border-accent-500"
              >
                {(Object.keys(NODE_COLORS) as NodeKind[]).map((k) => (
                  <option key={k} value={k}>{NODE_COLORS[k].label}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setConnecting(selectedNode.id)}
              className="rounded-md border border-forge-line bg-forge px-2 py-1 text-xs hover:bg-forge-line/60"
            >
              {connecting === selectedNode.id ? "连接中…点目标节点" : "→ 连接到下一节点"}
            </button>
            <button
              onClick={onDeleteSelected}
              className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
            >
              删除节点
            </button>
            <div className="mt-3 rounded-md border border-forge-line/60 bg-forge p-2 text-[10px] text-forge-muted">
              提示：连接错了可以点击连线删除。
            </div>
          </div>
        ) : (
          <div className="text-xs text-forge-muted">
            选中一个节点查看 / 编辑详情。或从左侧节点库添加新节点。
          </div>
        )}
        <div className="mt-6">
          <div className="mb-1 text-xs uppercase tracking-wider text-forge-muted">规格预览</div>
          <pre className="max-h-40 overflow-auto rounded-md border border-forge-line/60 bg-forge p-2 text-[10px] text-ink-200">
{JSON.stringify({ nodes, edges }, null, 2)}
          </pre>
        </div>
      </aside>
    </div>
  );
}
