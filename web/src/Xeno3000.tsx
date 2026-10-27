import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppActions, AppTabs } from "./AppChrome";

type Skin = "cyan" | "amber" | "xeno" | "crimson";

const SKINS: { id: Skin; label: string }[] = [
  { id: "cyan", label: "CRYO-CYAN (AIMAN)" },
  { id: "amber", label: "K-JÖFOL AMBER" },
  { id: "xeno", label: "XENO BIO-GREEN" },
  { id: "crimson", label: "CRIMSON POD" },
];

function readSkin(): Skin {
  try {
    const saved = localStorage.getItem("oc_xeno3000_skin");
    if (saved === "amber" || saved === "xeno" || saved === "crimson") return saved;
  } catch {}
  return "cyan";
}

function Visualizer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let phase = 0;
    const heights = new Array(16).fill(4);
    const peaks = new Array(16).fill(6);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      phase += 0.14;
      const styles = getComputedStyle(document.body);
      const main = styles.getPropertyValue("--plasma-primary").trim() || "#38e8ff";
      const top = styles.getPropertyValue("--orb-core").trim() || "#b8ffff";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 16; i++) {
        const target = Math.max(
          3,
          Math.min(
            canvas.height - 2,
            (Math.sin(phase + i * 0.55) * 0.5 + 0.5) * (canvas.height - 7) + Math.random() * 7,
          ),
        );
        heights[i] += (target - heights[i]) * 0.34;
        peaks[i] = Math.max(2, heights[i] > peaks[i] ? heights[i] : peaks[i] - 0.3);
        const x = i * 6 + 2;
        ctx.fillStyle = main;
        ctx.fillRect(x, canvas.height - heights[i], 4, heights[i]);
        ctx.fillStyle = top;
        ctx.fillRect(x, canvas.height - peaks[i] - 2, 4, 1.5);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={96} height={24} />;
}

function Microbar() {
  const [skin, setSkin] = useState<Skin>(readSkin);
  const [paper, setPaper] = useState(true);
  const [sfx, setSfx] = useState(true);

  useEffect(() => {
    document.body.dataset.skin = skin;
    if (paper) document.body.dataset.lcd = "paper";
    else delete document.body.dataset.lcd;
    try {
      localStorage.setItem("oc_xeno3000_skin", skin);
    } catch {}
  }, [skin, paper]);

  function clickSound() {
    if (!sfx) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const audio = new Ctx();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(920, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(240, audio.currentTime + 0.045);
      gain.gain.setValueAtTime(0.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.055);
    } catch {}
  }

  return (
    <div className="xeno3000-microbar">
      <div className="xeno3000-micro-left">
        <span className="xeno3000-ping" />
        <b>ENLIGHTENMENT DR16 // XENO-SKIN ENGINE v2.99</b>
        <span className="xeno3000-dim">|</span>
        <span>WM_CLASS: "Aiman_K-Jofol_BioPod"</span>
      </div>
      <div className="xeno3000-micro-right">
        <span className="xeno3000-dim">HULL CORE SKIN:</span>
        {SKINS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`xeno3000-skin-pill${skin === item.id ? " active" : ""}`}
            onClick={() => {
              clickSound();
              setSkin(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
        <span className="xeno3000-dim">|</span>
        <button
          type="button"
          className="xeno3000-skin-pill"
          onClick={() => {
            clickSound();
            setPaper((value) => !value);
          }}
        >
          LCD: {paper ? "K-JÖFOL OLIVE" : "DARK CRT"}
        </button>
        <button
          type="button"
          className="xeno3000-skin-pill"
          onClick={() => {
            setSfx((value) => !value);
            if (!sfx) clickSound();
          }}
        >
          SFX: {sfx ? "ON" : "MUTED"}
        </button>
      </div>
    </div>
  );
}

function PodTop() {
  return (
    <div className="xeno3000-pod-top">
      <span className="hex-rivet" />
      <span className="heatsink-ribs" />
      <span>POD-01 // MATRIX</span>
      <span className="heatsink-ribs short" />
      <span className="hex-rivet" />
    </div>
  );
}

function PodBottom() {
  return (
    <div className="xeno3000-pod-bottom">
      <span className="hex-rivet" />
      <span className="speaker-grille" />
      <span>KJ-99X</span>
      <span className="hex-rivet" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="xeno3000-footer">
      <span className="hex-rivet" />
      <b>HULL INTEGRITY: 100%</b>
      <span className="xeno3000-dim">//</span>
      <span>LCD DISPLAY MODE: CLASSIC K-JOFOL MONOCHROME DOT-MATRIX</span>
      <span className="xeno3000-spacer" />
      <span>WINAMP DSP PLUG-IN: <b>XENO-ENHANCER v3.1</b></span>
      <span className="heatsink-ribs short" />
      <span className="hex-rivet" />
    </footer>
  );
}

export default function Xeno3000({
  titlebar,
  sidebar,
  main,
  overlays,
}: {
  titlebar?: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  overlays?: ReactNode;
}) {
  return (
    <div className="app xeno3000-shell" id="xeno3000-root">
      {titlebar}
      <Microbar />
      <div className="alien-hull-chassis">
        <header className="top-bridge-hull xeno3000-bridge">
          <div className="xeno3000-brand-pod">
            <div className="xeno3000-brand-copy">
              <span>XENO-AGENT</span>
              <b>AIMAN</b>
            </div>
            <div className="plasma-orb-housing">
              <div className="plasma-orb xeno3000-brand-orb" />
            </div>
          </div>
          <div className="kjofol-lcd-screen xeno3000-visualizer">
            <div className="xeno3000-visualizer-copy">
              <b>04:37</b>
              <span>160kbps</span>
              <i>SPECTRUM // 44kHz</i>
            </div>
            <Visualizer />
          </div>
          <nav className="xeno3000-nav">
            <AppTabs />
          </nav>
          <div className="xeno3000-status-pod">
            <AppActions />
          </div>
        </header>
        <div className="plasma-conduit" />
        <div className="xeno3000-workspace">
          <aside className="left-biopod">
            <PodTop />
            {sidebar}
            <PodBottom />
          </aside>
          <main className="main-command-cavity">{main}</main>
        </div>
        <Footer />
      </div>
      {overlays}
    </div>
  );
}
