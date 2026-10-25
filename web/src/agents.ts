/**
 * Accent colour for an agent: build = blue, plan = orange, everything else gets
 * a stable purple/violet hue derived from the agent name.
 */
export type AgentAccent = { accent: string; soft: string; border: string };

export function agentAccent(agent?: string | null): AgentAccent {
  const name = (agent || "build").toLowerCase();
  if (name === "build") {
    return {
      accent: "#3b82f6",
      soft: "rgba(59, 130, 246, 0.10)",
      border: "rgba(59, 130, 246, 0.45)",
    };
  }
  if (name === "plan") {
    return {
      accent: "#f59e0b",
      soft: "rgba(245, 158, 11, 0.10)",
      border: "rgba(245, 158, 11, 0.45)",
    };
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  const hue = 250 + (hash % 60);
  return {
    accent: `hsl(${hue} 70% 64%)`,
    soft: `hsla(${hue}, 70%, 60%, 0.10)`,
    border: `hsla(${hue}, 70%, 60%, 0.45)`,
  };
}
