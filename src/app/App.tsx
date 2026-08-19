import { useState, useEffect, useRef, type ReactNode } from "react";
import { Github, Linkedin, Mail, FileText, ExternalLink, Menu, X, ArrowUpRight } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Project {
  name: string;
  tagline: string;
  stack: string[];
  problem: string;
  role: string;
  decisions: { label: string; reason: string }[];
  github: string;
  demo?: string;
  featured?: boolean;
  deepDive?: string;
}

// ── Data ─────────────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  {
    name: "Flash Sale Engine",
    tagline: "High-concurrency e-commerce inventory system built for Black Friday-scale traffic",
    stack: ["Spring Boot", "Redis", "RabbitMQ", "Docker", "MySQL"],
    featured: true,
    problem:
      "Flash sales create brutal inventory contention: thousands of users hammer the same SKU simultaneously, leading to overselling, race conditions, and backend meltdown under load. A naive database-level decrement collapses immediately.",
    role:
      "Sole backend developer — designed the system architecture end-to-end, implemented the inventory reservation pipeline, built the async order queue, wrote load tests, and containerized the full stack.",
    decisions: [
      {
        label: "Redis for inventory counters",
        reason:
          "INCRBY/DECRBY on a Redis key is atomic and sub-millisecond. Offloading stock reservation to Redis eliminates DB write contention under spike traffic and lets the JVM threads return quickly.",
      },
      {
        label: "RabbitMQ for order queue",
        reason:
          "Decouples the hot reservation path from slower order persistence. Failed or slow DB writes don't block the checkout flow — they're retried asynchronously, keeping p99 latency low.",
      },
      {
        label: "Lua scripts for atomic check-and-decrement",
        reason:
          "A single Redis Lua script reads, validates, and decrements stock in one round-trip, preventing the TOCTOU race between checking availability and deducting it.",
      },
    ],
    deepDive: `The core challenge in a flash sale is inventory contention: thousands of requests arrive within seconds for a fixed-stock item. A traditional approach — read stock from MySQL, decrement if positive, write back — fails immediately under concurrent load due to race conditions and lock contention.

The engine solves this in three layers. First, inventory is pre-loaded into Redis before the sale opens. Stock reservation is handled by an atomic Lua script that performs a check-and-decrement in a single round-trip, making it both fast (~0.3ms) and race-free. No two requests can simultaneously observe the same positive stock count.

Second, successful reservations produce a lightweight message to a RabbitMQ exchange rather than synchronously writing an order to MySQL. This decouples the hot checkout path from slower persistence operations — the user gets an immediate confirmation while the order is written durably in the background.

Third, a consumer service reads from the queue, writes the finalized order to MySQL, and handles retries on failure. If the consumer is slow or restarts, messages queue up rather than being lost. Idempotency keys prevent double-processing on retry.

The result: the checkout critical path is a Redis Lua call plus a queue publish — typically under 5ms end-to-end, with horizontal scalability bounded only by Redis throughput.`,
    github: "https://github.com/MoX-creater/Flash-sale---concurrency", 
  },
  {
  name: "Typing Speed Web App",
  tagline: "Real-time multiplayer typing platform with live WPM tracking, AI-adaptive passages, and AI performance summaries",
  stack: ["React", "Node.js", "Express", "Firebase/Firestore", "Google Gemini API", "Socket.io"],
  problem:
    "Needed a responsive typing platform supporting real-time multiplayer races without input lag, alongside AI-personalized passage generation and performance feedback based on per-user typing error data.",
  role:
    "Architected and built the full stack — RESTful APIs for session, scoring, and user data management; real-time multiplayer race rooms via Socket.io; and AI-powered features (adaptive passage generation, performance summaries) using Google Gemini.",
  decisions: [
    {
      label: "Optimized rendering pipeline",
      reason:
        "Tuned React state updates and rendering to minimize input lag during continuous typing, keeping response latency under 150ms in local testing.",
    },
    {
      label: "Real-time multiplayer architecture",
      reason:
        "Built Socket.io-based race rooms (create/join/leave) with client-side result handling matching the solo-test pattern, validated on a single server instance without requiring Redis/RabbitMQ scaling.",
    },
    {
      label: "AI-personalized passage generation",
      reason:
        "Captured per-user typing error telemetry (error maps, WPM over time, accuracy by character class) and fed it to Gemini to generate adaptive-difficulty passages, plus AI-generated post-race and post-test performance summaries.",
    },
    {
      label: "Production hardening for AI endpoints",
      reason:
        "Added passage caching/reuse, rate limiting, and edge-case handling for new users with no typing profile yet, before merging the feature branch to main.",
    },
  ],
  github: "https://github.com/MoX-creater/Typing-Speed-Website",
},
  {
    name: "P2P File Sharing App",
    tagline: "Peer-to-peer file transfer using direct browser-to-browser connections",
    stack: ["React.js", "WebRTC", "Node.js", "Express.js", "WebSockets"],
    problem:
      "Needed a file transfer system that avoids routing large files through a central server, while still handling NAT traversal and unpredictable network conditions between peers.",
    role:
      "Built the full system — WebRTC-based peer connections, a WebSocket signaling server, and NAT traversal handling.",
    decisions: [
      {
        label: "WebSocket signaling server",
        reason:
          "Enabled peer discovery and connection setup, establishing peer connections within 1–3 seconds in local testing.",
      },
      {
        label: "ICE candidates and STUN servers",
        reason:
          "Used to handle NAT traversal and network variability, achieving transfer speeds up to 2–8 MB/s in favorable local conditions.",
      },
    ],
    github: "https://github.com/MoX-creater/DropLink-P2P-file-sharing", 
  },
];

// Each entry is [category, primary tags, optional secondary tags]
const SKILLS: [string, string[], string[]?][] = [
  ["Languages",    ["Java", "JavaScript", "SQL"]],
  ["Backend",      ["Spring Boot", "Node.js", "Express", "REST APIs"]],
  ["Data & Infra", ["Redis", "RabbitMQ", "MongoDB", "MySQL", "Docker"]],
  ["Frontend",     ["React", "HTML/CSS"]],
  ["Tools",        ["Git", "GitHub", "Docker", "VS Code"]],
  ["Core Java",    ["OOP", "Collections Framework", "Exception Handling", "Multithreading", "Java 8 Streams"],
                   ["DSA", "Problem Solving", "Object-Oriented Design"]],
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener?.("change", updatePreference);

    return () => mediaQuery.removeEventListener?.("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function Tag({ label, visible = true, delay = 0 }: { label: string; visible?: boolean; delay?: number }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 text-xs font-mono tracking-wide rounded border border-border text-muted-foreground bg-secondary transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
      style={{ fontFamily: "'JetBrains Mono', monospace", transitionDelay: `${delay}ms` }}
    >
      {label}
    </span>
  );
}

function CountUp({ value, visible, prefix = "", suffix = "", className = "", duration = 800 }: { value: number; visible: boolean; prefix?: string; suffix?: string; className?: string; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!visible) {
      setDisplayValue(value);
      return;
    }

    let frame = 0;
    const start = 0;
    const end = value;
    const step = () => {
      const progress = Math.min(1, frame / 60);
      setDisplayValue(Math.round(start + (end - start) * (progress ** 0.8)));
      frame += 1;
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    const timer = window.setTimeout(() => {
      frame = 0;
      window.requestAnimationFrame(step);
    }, 80);

    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [value, visible, duration]);

  return <span className={className}>{prefix}{displayValue}{suffix}</span>;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-10">
      <span
        className="text-xs font-mono tracking-widest text-primary uppercase"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {children}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, index, prefersReducedMotion }: { project: Project; index: number; prefersReducedMotion: boolean }) {
  // Featured cards start expanded; secondary cards start collapsed
  const [detailsOpen, setDetailsOpen] = useState(!!project.featured);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [stackVisible, setStackVisible] = useState(false);
  const [detailsHeight, setDetailsHeight] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsVisible(true);
      setStackVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setStackVisible(true);
      return;
    }

    if (!isVisible) {
      setStackVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setStackVisible(true), 80 + index * 45);
    return () => window.clearTimeout(timer);
  }, [isVisible, prefersReducedMotion, index]);

  useEffect(() => {
    if (detailsRef.current) {
      setDetailsHeight(detailsOpen ? detailsRef.current.scrollHeight : 0);
    }
  }, [detailsOpen, project.decisions.length, project.problem, project.role]);

  return (
    <article
      ref={cardRef}
      className={`border border-border rounded-lg overflow-hidden transition-all duration-300 hover:border-primary/30 hover:-translate-y-0.5 hover:brightness-[1.02] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
      style={{ background: "var(--card)" }}
    >
      <div className="p-6 md:p-8">
        {/* ── Card header ── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono text-muted-foreground tabular-nums"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            {project.featured && (
              <span
                className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                featured
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {project.demo && (
              <a
                href={project.demo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Live demo"
              >
                <ExternalLink size={16} />
              </a>
            )}
            <a
              href={project.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="GitHub repository"
            >
              <Github size={16} />
            </a>
          </div>
        </div>

        {/* ── Always-visible: title, tagline, stack ── */}
        <h3
          className="text-xl font-semibold text-foreground mb-2"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          {project.name}
        </h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-4">{project.tagline}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {project.stack.map((t, i) => (
            <Tag key={t} label={t} visible={stackVisible} delay={i * 35} />
          ))}
        </div>

        {/* ── Collapsible body: Problem / Role / Decisions ── */}
        <div
          ref={detailsRef}
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-out"
          style={{ maxHeight: detailsOpen ? `${detailsHeight}px` : "0px", opacity: detailsOpen ? 1 : 0 }}
        >
          {detailsOpen && (
            <div className="mt-1">
              <div className="mb-5">
                <p className="text-xs font-mono text-muted-foreground mb-1.5 uppercase tracking-wider"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Problem
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed">{project.problem}</p>
              </div>

              <div className="mb-5">
                <p className="text-xs font-mono text-muted-foreground mb-1.5 uppercase tracking-wider"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Role
                </p>
                <p className="text-sm text-foreground/80 leading-relaxed">{project.role}</p>
              </div>

              <div className="mb-4">
                <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Technical decisions
                </p>
                <div className="space-y-3">
                  {project.decisions.map((d) => (
                    <div key={d.label} className="pl-3 border-l border-primary/40">
                      <p className="text-sm font-medium text-foreground mb-0.5">{d.label}</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{d.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Read more / collapse toggle (non-featured only) ── */}
        {!project.featured && (
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-mono text-primary hover:text-primary/80 transition-colors mt-1"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
            aria-expanded={detailsOpen}
          >
            <span>{detailsOpen ? "— collapse" : "→ read more"}</span>
          </button>
        )}

        {/* ── Deep dive toggle (featured only) ── */}
        {project.deepDive && (
          <button
            onClick={() => setDeepDiveOpen((v) => !v)}
            className="mt-4 flex items-center gap-2 text-xs font-mono text-primary hover:text-primary/80 transition-colors"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
            aria-expanded={deepDiveOpen}
          >
            <span>{deepDiveOpen ? "— collapse" : "→ architecture deep-dive"}</span>
          </button>
        )}
      </div>

      {/* ── Deep dive panel ── */}
      {project.deepDive && deepDiveOpen && (
        <div className="px-6 md:px-8 pb-6 md:pb-8 pt-0">
          <div className="border-t border-border pt-6">
            <p className="text-xs font-mono text-muted-foreground mb-4 uppercase tracking-wider"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Architecture overview
            </p>
            <div className="space-y-4">
              {project.deepDive.split("\n\n").map((para, i) => (
                <p key={i} className="text-sm text-foreground/75 leading-relaxed">{para}</p>
              ))}
            </div>

            <div className="mt-6 p-4 rounded-lg border border-border bg-background/50 overflow-x-auto">
              <p className="text-xs font-mono text-muted-foreground mb-3"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Request flow
              </p>
              <svg
                viewBox="0 0 760 180"
                className="w-full min-w-[620px]"
                aria-label="Flash sale engine request flow diagram"
              >
                <rect x="12" y="18" width="360" height="92" rx="8" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.22)" strokeWidth="1" />
                <text x="32" y="40" fill="var(--muted-foreground)" fontSize="8" fontFamily="'JetBrains Mono', monospace">hot path</text>

                <rect x="388" y="18" width="220" height="92" rx="8" fill="rgba(52,211,153,0.08)" stroke="rgba(52,211,153,0.2)" strokeWidth="1" />
                <text x="408" y="40" fill="var(--muted-foreground)" fontSize="8" fontFamily="'JetBrains Mono', monospace">background</text>

                {[
                  { x: 28, y: 56, label: "Client", sub: "HTTP POST" },
                  { x: 152, y: 56, label: "Spring Boot", sub: "Controller" },
                  { x: 276, y: 56, label: "Redis", sub: "Lua check-decr" },
                  { x: 400, y: 56, label: "RabbitMQ", sub: "Order queue" },
                  { x: 524, y: 56, label: "Consumer", sub: "reads queue" },
                  { x: 648, y: 56, label: "MySQL", sub: "durable write" },
                ].map(({ x, y, label, sub }) => (
                  <g key={label}>
                    <rect x={x} y={y} width={92} height={48} rx={4}
                      fill="var(--secondary)" stroke="var(--border)" strokeWidth={1} />
                    <text x={x + 46} y={y + 20} textAnchor="middle"
                      fill="var(--foreground)" fontSize={9}
                      fontFamily="'JetBrains Mono', monospace" fontWeight={500}>
                      {label}
                    </text>
                    <text x={x + 46} y={y + 35} textAnchor="middle"
                      fill="var(--muted-foreground)" fontSize={7.2}
                      fontFamily="'JetBrains Mono', monospace">
                      {sub}
                    </text>
                  </g>
                ))}

                {[120, 244, 368, 492, 616].map((x) => (
                  <g key={x}>
                    <line x1={x} y1={80} x2={x + 28} y2={80}
                      stroke="var(--primary)" strokeWidth={1} strokeOpacity={0.7} />
                    <polygon
                      points={`${x + 28},76 ${x + 28},84 ${x + 32},80`}
                      fill="var(--primary)" fillOpacity={0.7}
                    />
                  </g>
                ))}

                <text x={640} y={128} textAnchor="middle"
                  fill="var(--muted-foreground)" fontSize={7}
                  fontFamily="'JetBrains Mono', monospace">
                  async / retry
                </text>
                <line x1={616} y1={104} x2={648} y2={104}
                  stroke="var(--primary)" strokeWidth="1" strokeOpacity={0.6} />
                <polygon points="648,100 648,108 652,104" fill="var(--primary)" fillOpacity={0.6} />
              </svg>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// ── Terminal Window ───────────────────────────────────────────────────────────

type Span = { text: string; color: string };
type Line = Span[];

const MONO = "'JetBrains Mono', 'Fira Code', monospace";

// VS Code Dark+ palette for JS/Node.js
const C = {
  keyword:  "#C792EA", // const, async, await, return — purple
  method:   "#82AAFF", // function / method names — blue
  string:   "#C3E88D", // string literals — green
  comment:  "#546E7A", // // comments — slate
  plain:    "#D4D4D4", // default text — near-white
  param:    "#f07178", // parameter / variable names — coral
  brace:    "#89DDFF", // punctuation & brackets — cyan
  number:   "#F78C6C", // numeric literals — orange
  builtin:  "#FFCB6B", // req, res, router — amber
};

const CODE_LINES: Line[] = [
  [{ text: "// GET /api/orders/:id — fetch order by ID", color: C.comment }],
  [
    { text: "router.", color: C.builtin },
    { text: "get", color: C.method },
    { text: "(", color: C.brace },
    { text: '"/api/orders/:id"', color: C.string },
    { text: ", ", color: C.plain },
    { text: "async ", color: C.keyword },
    { text: "(", color: C.brace },
    { text: "req", color: C.builtin },
    { text: ", ", color: C.plain },
    { text: "res", color: C.builtin },
    { text: ") => {", color: C.brace },
  ],
  [
    { text: "  ", color: C.plain },
    { text: "const ", color: C.keyword },
    { text: "cached ", color: C.plain },
    { text: "= ", color: C.plain },
    { text: "await ", color: C.keyword },
    { text: "redis.", color: C.plain },
    { text: "get", color: C.method },
    { text: "(`order:", color: C.brace },
    { text: "${req.params.id}", color: C.param },
    { text: "`);", color: C.brace },
  ],
  [
    { text: "  if ", color: C.keyword },
    { text: "(cached) ", color: C.plain },
    { text: "return ", color: C.keyword },
    { text: "res", color: C.builtin },
    { text: ".", color: C.plain },
    { text: "json", color: C.method },
    { text: "(", color: C.brace },
    { text: "JSON.", color: C.plain },
    { text: "parse", color: C.method },
    { text: "(cached));", color: C.brace },
  ],
  [
    { text: "  ", color: C.plain },
    { text: "const ", color: C.keyword },
    { text: "order ", color: C.plain },
    { text: "= ", color: C.plain },
    { text: "await ", color: C.keyword },
    { text: "Order.", color: C.plain },
    { text: "findById", color: C.method },
    { text: "(req.params.id);", color: C.plain },
  ],
  [
    { text: "  if ", color: C.keyword },
    { text: "(!order)", color: C.plain },
    { text: " return ", color: C.keyword },
    { text: "res", color: C.builtin },
    { text: ".", color: C.plain },
    { text: "status", color: C.method },
    { text: "(", color: C.brace },
    { text: "404", color: C.number },
    { text: ")", color: C.brace },
  ],
  [
    { text: "      .", color: C.plain },
    { text: "json", color: C.method },
    { text: "({ ", color: C.brace },
    { text: "error: ", color: C.param },
    { text: '"Not found"', color: C.string },
    { text: " });", color: C.brace },
  ],
  [
    { text: "  const ", color: C.keyword },
    { text: "payload ", color: C.plain },
    { text: "= ", color: C.plain },
    { text: "JSON.", color: C.plain },
    { text: "stringify", color: C.method },
    { text: "(order);", color: C.brace },
  ],
  [
    { text: "  await ", color: C.keyword },
    { text: "redis.", color: C.plain },
    { text: "setEx", color: C.method },
    { text: "(`order:", color: C.brace },
    { text: "${order._id}", color: C.param },
    { text: "`, ", color: C.brace },
    { text: "300", color: C.number },
    { text: ", payload);", color: C.plain },
  ],
  [
    { text: "  ", color: C.plain },
    { text: "res", color: C.builtin },
    { text: ".", color: C.plain },
    { text: "json", color: C.method },
    { text: "(order);", color: C.brace },
  ],
  [{ text: "});", color: C.brace }],
];

function TerminalWindow({ prefersReducedMotion }: { prefersReducedMotion: boolean }) {
  const [typedPrompt1, setTypedPrompt1] = useState("");
  const [typedLine1, setTypedLine1] = useState("");
  const [typedPrompt2, setTypedPrompt2] = useState("");
  const [typedLine2, setTypedLine2] = useState("");

  useEffect(() => {
    if (prefersReducedMotion) {
      setTypedPrompt1("$ whoami");
      setTypedLine1("mohit — backend developer, in progress");
      setTypedPrompt2("$ npm run status");
      setTypedLine2("✓ available for Summer 2026 internships");
      return;
    }

    const prompt1 = "$ whoami";
    const line1 = "mohit — backend developer, in progress";
    const prompt2 = "$ npm run status";
    const line2 = "✓ available for Summer 2026 internships";

    let index = 0;
    const typePrompt1 = window.setInterval(() => {
      setTypedPrompt1(prompt1.slice(0, index + 1));
      index += 1;
      if (index >= prompt1.length) {
        window.clearInterval(typePrompt1);
        let lineIndex = 0;
        const typeLine1 = window.setInterval(() => {
          setTypedLine1(line1.slice(0, lineIndex + 1));
          lineIndex += 1;
          if (lineIndex >= line1.length) {
            window.clearInterval(typeLine1);
            let prompt2Index = 0;
            const typePrompt2 = window.setInterval(() => {
              setTypedPrompt2(prompt2.slice(0, prompt2Index + 1));
              prompt2Index += 1;
              if (prompt2Index >= prompt2.length) {
                window.clearInterval(typePrompt2);
                let line2Index = 0;
                const typeLine2 = window.setInterval(() => {
                  setTypedLine2(line2.slice(0, line2Index + 1));
                  line2Index += 1;
                  if (line2Index >= line2.length) window.clearInterval(typeLine2);
                }, 20);
              }
            }, 22);
          }
        }, 18);
      }
    }, 24);

    return () => {
      window.clearInterval(typePrompt1);
    };
  }, [prefersReducedMotion]);

  return (
    <div
      className="w-full max-w-lg rounded-xl overflow-hidden border border-[#8B5CF6]/40"
      style={{ background: "#1E1E1E", boxShadow: "0 0 0 1px rgba(139,92,246,0.15), 0 20px 60px rgba(139,92,246,0.12), 0 4px 20px rgba(0,0,0,0.6)" }}
      role="img"
      aria-label="Stylized macOS terminal showing a Node.js Express route with Redis caching"
    >
      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-white/10"
        style={{ background: "#2D2D2D" }}
      >
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#FF5F57" }} aria-hidden="true" />
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#FEBC2E" }} aria-hidden="true" />
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: "#28C840" }} aria-hidden="true" />
        <span
          className="ml-auto text-xs text-white/30 truncate"
          style={{ fontFamily: MONO }}
        >
          orders.route.js
        </span>
      </div>

      {/* Code body */}
      <div className="px-5 py-5 overflow-x-hidden">
        <pre
          className="text-xs leading-[1.75] select-text"
          style={{ fontFamily: MONO }}
        >
          {CODE_LINES.map((line, li) => (
            <div key={li} className="flex whitespace-pre">
              <span
                className="select-none mr-5 text-right flex-shrink-0"
                style={{ color: "#3d4147", minWidth: "1.25rem" }}
              >
                {li + 1}
              </span>
              <span>
                {line.map((span, si) => (
                  <span key={si} style={{ color: span.color }}>
                    {span.text}
                  </span>
                ))}
              </span>
            </div>
          ))}
          {/* Blinking cursor */}
          <div className="flex mt-0.5">
            <span
              className="select-none mr-5 text-right flex-shrink-0"
              style={{ color: "#3d4147", minWidth: "1.25rem" }}
            >
              {CODE_LINES.length + 1}
            </span>
            <span
              className="inline-block w-[7px] h-[13px] translate-y-[1px]"
              style={{ background: "#8B5CF6", animation: "termBlink 1.1s step-start infinite" }}
              aria-hidden="true"
            />
          </div>
        </pre>
      </div>

      {/* Integrated terminal pane */}
      <div className="border-t border-white/10 px-4 py-3" style={{ background: "#181818" }}>
        <div className="rounded-md border border-white/10 px-3 py-2" style={{ background: "#151515" }}>
          <div className="text-[11px] leading-6" style={{ fontFamily: MONO }}>
            <div className="flex gap-2">
              <span style={{ color: "#8B5CF6" }}>$</span>
              <span style={{ color: "#8B5CF6" }}>{typedPrompt1}</span>
            </div>
            <div className="ml-4" style={{ color: "#9CA3AF" }}>
              {typedLine1}
            </div>

            <div className="mt-1 flex gap-2">
              <span style={{ color: "#8B5CF6" }}>$</span>
              <span style={{ color: "#8B5CF6" }}>{typedPrompt2}</span>
            </div>
            <div className="ml-4" style={{ color: "#9CA3AF" }}>
              <span style={{ color: "#34D399" }}>✓</span> {typedLine2}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-5 py-2 border-t border-white/10 text-xs"
        style={{ background: "#252525", fontFamily: MONO, color: "#546E7A" }}
      >
        <span>Node.js · Express 4</span>
        <span style={{ color: "#8B5CF6" }}>Redis ●</span>
      </div>

      <style>{`@keyframes termBlink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

function Nav({ scrolled, prefersReducedMotion }: { scrolled: boolean; prefersReducedMotion: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("top");

  const links = [
    { href: "#projects", label: "Projects" },
    { href: "#skills", label: "Skills" },
    { href: "#about", label: "About" },
    { href: "#contact", label: "Contact" },
  ];

  useEffect(() => {
    if (prefersReducedMotion) {
      setActiveSection("top");
      return;
    }

    const sections = Array.from(document.querySelectorAll<HTMLElement>("section[id], footer[id]"));
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry) {
          setActiveSection(visibleEntry.target.id || "top");
        }
      },
      { rootMargin: "-35% 0px -45% 0px", threshold: [0.2, 0.4, 0.6] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "border-b border-border backdrop-blur-md" : ""}`}
      style={{ background: scrolled ? "rgba(11,11,15,0.92)" : "transparent" }}
      aria-label="Main navigation"
    >
      <div className="max-w-5xl mx-auto px-5 md:px-10 flex items-center justify-between h-14">
        <a
          href="#top"
          className="text-sm font-mono text-primary"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          aria-label="Back to top"
        >
          YN
        </a>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => {
            const sectionId = l.href.replace("#", "");
            const isActive = activeSection === sectionId;
            return (
              <a
                key={l.href}
                href={l.href}
                className={`relative text-sm transition-colors ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {l.label}
                <span className={`absolute left-0 -bottom-1 h-px bg-primary transition-all duration-300 ${isActive ? "w-full" : "w-0"}`} />
              </a>
            );
          })}
          <a
            href="/resume.pdf"
            download
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-all duration-200 hover:scale-[1.02] hover:brightness-[1.05]"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <FileText size={13} />
            Resume
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-muted-foreground hover:text-foreground"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="max-w-5xl mx-auto px-5 py-4 flex flex-col gap-4">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/resume.pdf"
              download
              className="text-sm text-primary"
              onClick={() => setMenuOpen(false)}
            >
              Download Resume
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [heroTaglineVisible, setHeroTaglineVisible] = useState(false);
  const [heroButtonsVisible, setHeroButtonsVisible] = useState(false);
  const [heroStatsVisible, setHeroStatsVisible] = useState(false);
  const [skillsVisible, setSkillsVisible] = useState(false);
  const [leetcodeVisible, setLeetCodeVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const skillsRef = useRef<HTMLDivElement | null>(null);
  const leetcodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setHeroVisible(true);
      setHeroTaglineVisible(true);
      setHeroButtonsVisible(true);
      setHeroStatsVisible(true);
      return;
    }

    const heroTimer = window.setTimeout(() => setHeroVisible(true), 0);
    const taglineTimer = window.setTimeout(() => setHeroTaglineVisible(true), 120);
    const buttonsTimer = window.setTimeout(() => setHeroButtonsVisible(true), 240);
    const statsTimer = window.setTimeout(() => setHeroStatsVisible(true), 320);

    return () => {
      window.clearTimeout(heroTimer);
      window.clearTimeout(taglineTimer);
      window.clearTimeout(buttonsTimer);
      window.clearTimeout(statsTimer);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setSkillsVisible(true);
      setLeetCodeVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting) {
          setSkillsVisible(true);
          setLeetCodeVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    if (skillsRef.current) observer.observe(skillsRef.current);
    if (leetcodeRef.current) observer.observe(leetcodeRef.current);
    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "auto";
    };
  }, []);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      id="top"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <Nav scrolled={scrolled} prefersReducedMotion={prefersReducedMotion} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="min-h-[calc(100vh-3.5rem)] max-w-6xl mx-auto px-5 md:px-10 pt-14 flex items-center"
        aria-labelledby="hero-heading"
      >
        <div className="w-full grid md:grid-cols-2 gap-10 lg:gap-16 items-center py-10 md:py-0">

          {/* ── Left column ── */}
          <div>
            <div className="mb-5 flex items-center gap-2">
              <span
                className="text-xs font-mono text-primary"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                &gt;_
              </span>
              <span
                className="text-xs font-mono text-muted-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                available for Summer 2026 internships
                <span className="inline-block w-[6px] h-[12px] translate-y-[1px] ml-1" style={{ background: "#8B5CF6", animation: "termBlink 1.1s step-start infinite" }} aria-hidden="true" />
              </span>
            </div>

            <h1
              id="hero-heading"
              className={`text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground leading-tight mb-4 transition-all duration-300 ${heroVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: "-0.025em" }}
            >
              Mohit
            </h1>
            <p
              className={`text-lg lg:text-xl text-muted-foreground font-light leading-snug mb-8 max-w-sm transition-all duration-300 ${heroTaglineVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
            >
              Backend-focused CS student building scalable, concurrent systems.
            </p>

            {/* CTA links */}
            <div className={`flex flex-wrap gap-3 items-center mb-10 transition-all duration-300 ${heroButtonsVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              <a
                href="/resume.pdf"
                download
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-all duration-200 hover:scale-[1.02] hover:brightness-[1.05]"
              >
                <FileText size={14} />
                Download Resume
              </a>
              <a
                href="mailto:mohitk3001@gmail.com?subject=Hello%20Mohit"
                onClick={(event) => {
                  event.preventDefault();
                  window.open(
                    "mailto:mohitk3001@gmail.com?subject=Hello%20Mohit",
                    "_self",
                    "noopener,noreferrer"
                  );
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded border border-border text-foreground text-sm hover:border-primary/40 hover:text-primary transition-all duration-200 hover:scale-[1.02] hover:brightness-[1.05]"
              >
                <Mail size={14} />
                Email me
              </a>
              <div className="flex items-center gap-3 ml-1">
                <a
                  href="https://github.com/MoX-creater"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded border border-border text-foreground/70 hover:text-primary hover:border-primary/50 transition-colors"
                  aria-label="GitHub profile"
                >
                  <Github size={20} />
                </a>
                <a
                  href="https://www.linkedin.com/in/mohit-mahanta-027778290/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-9 h-9 rounded border border-border text-foreground/70 hover:text-primary hover:border-primary/50 transition-colors"
                  aria-label="LinkedIn profile"
                >
                  <Linkedin size={20} />
                </a>
              </div>
            </div>

            {/* Quick stats */}
            <div className={`grid grid-cols-3 gap-0 border border-border rounded-lg overflow-hidden max-w-xs transition-all duration-300 ${heroStatsVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}>
              {[
                { value: 4, suffix: "th", label: "year" },
                { value: 2027, label: "graduating" },
                { value: 3, label: "projects" },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-3 text-center ${i < 2 ? "border-r border-border" : ""}`}
                  style={{ background: "var(--card)" }}
                >
                  <p
                    className="text-base font-semibold text-foreground"
                    style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
                  >
                    <CountUp value={stat.value} visible={heroStatsVisible} suffix={stat.suffix || ""} />
                  </p>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right column — macOS terminal ── */}
          <div className="flex justify-center md:justify-end">
            <TerminalWindow prefersReducedMotion={prefersReducedMotion} />
          </div>

        </div>
      </section>

      {/* ── Projects ──────────────────────────────────────────────────────── */}
      <section
        id="projects"
        className="max-w-5xl mx-auto px-5 md:px-10 pt-10 pb-28"
        aria-labelledby="projects-heading"
      >
        <SectionLabel>Projects</SectionLabel>
        <h2
          id="projects-heading"
          className="text-2xl md:text-3xl font-semibold mb-10"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Things I've built
        </h2>
        <div className="space-y-6">
          {PROJECTS.map((p, i) => (
            <ProjectCard key={p.name} project={p} index={i} prefersReducedMotion={prefersReducedMotion} />
          ))}
        </div>
      </section>

      {/* ── Skills ────────────────────────────────────────────────────────── */}
      <section
        id="skills"
        className="max-w-5xl mx-auto px-5 md:px-10 pb-28"
        aria-labelledby="skills-heading"
      >
        <SectionLabel>Skills</SectionLabel>
        <h2
          id="skills-heading"
          className="text-2xl md:text-3xl font-semibold mb-10"
          style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
        >
          Stack
        </h2>
        <div ref={skillsRef} className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: "1.5rem" }}>
          {SKILLS.map(([category, primary, secondary], index) => (
            <div
              key={category}
              className={`p-5 rounded-lg border border-border transition-all duration-300 ${skillsVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
              style={{ background: "var(--card)", transitionDelay: `${index * 60}ms` }}
            >
              <p
                className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {category}
              </p>
              <div className="flex flex-wrap gap-2">
                {primary.map((skill, skillIndex) => (
                  <Tag key={skill} label={skill} visible={skillsVisible} delay={skillIndex * 40} />
                ))}
              </div>
              {secondary && (
                <>
                  <div className="my-3 h-px bg-border" />
                  <div className="flex flex-wrap gap-2">
                    {secondary.map((skill, skillIndex) => (
                      <Tag key={skill} label={skill} visible={skillsVisible} delay={skillIndex * 40 + 120} />
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Competitive programming stats */}
        <div ref={leetcodeRef} className="mt-8 flex justify-center">
          <a
            href="https://leetcode.com/u/AnAkin_Musashi/"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex w-full max-w-xl items-center justify-between gap-5 p-4 rounded-lg border border-border transition-all duration-300 hover:border-primary/40 hover:scale-[1.01] ${leetcodeVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"}`}
            style={{ background: "var(--card)" }}
          >
            <div>
              <p className="text-sm font-medium text-foreground">LeetCode</p>
              <p
                className="text-xs font-mono text-muted-foreground mt-0.5"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Competitive programming profile
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[10px] font-mono text-primary">
                <CountUp value={1} visible={leetcodeVisible} />
              </span>
              <span className="text-sm font-medium text-primary">View my profile →</span>
            </div>
          </a>
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────────────── */}
      <section
        id="about"
        className="max-w-5xl mx-auto px-5 md:px-10 pb-28"
        aria-labelledby="about-heading"
      >
        <SectionLabel>About</SectionLabel>
        <div className="grid md:grid-cols-5 gap-8 items-start">
          <div className="md:col-span-3">
            <h2
              id="about-heading"
              className="text-2xl md:text-3xl font-semibold mb-6"
              style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
            >
              Background
            </h2>
            <div className="space-y-4 text-foreground/80 leading-relaxed text-sm">
              <p>
                I'm a fourth-year Computer Science undergraduate (graduating 2027) with a focus on backend and systems engineering.
              </p>
              <p>
                I got into this side of engineering almost by accident — I started out just wanting things to work, then got curious about why they broke under pressure instead. That curiosity is what pulled me toward the parts of a system most people don't think about until something goes wrong: the queue that backs up, the cache that goes stale, the lock that two requests fight over at the same time.
              </p>
              <p>
                I'm actively looking for backend or systems-focused internships for Summer 2026 — roles where I can work on real problems.
              </p>
            </div>
          </div>
          <div className="md:col-span-2 space-y-3">
            <div
              className="p-5 rounded-lg border border-border"
              style={{ background: "var(--card)" }}
            >
              <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Education
              </p>
              <p className="text-sm font-medium text-foreground mb-1">Bachelor of Engineering in Computer Science</p>
              <p className="text-sm text-muted-foreground">Chandigarh University</p>
              <p className="text-xs font-mono text-muted-foreground mt-2"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                2023 – 2027 · 4th Year
              </p>
            </div>
            <div
              className="p-5 rounded-lg border border-border"
              style={{ background: "var(--card)" }}
            >
              <p className="text-xs font-mono text-muted-foreground mb-3 uppercase tracking-wider"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Looking for
              </p>
              <div className="flex flex-wrap gap-2">
                {["SDE Intern", "Backend Intern", "Summer 2026"].map((t) => (
                  <Tag key={t} label={t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contact / Footer ──────────────────────────────────────────────── */}
      <footer
        id="contact"
        className="border-t border-border"
        aria-labelledby="contact-heading"
      >
        <div className="max-w-5xl mx-auto px-5 md:px-10 py-20">
          <SectionLabel>Contact</SectionLabel>
          <div className="md:flex md:items-end md:justify-between gap-8">
            <div>
              <h2
                id="contact-heading"
                className="text-2xl md:text-4xl font-semibold mb-4 max-w-md"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: "-0.02em" }}
              >
                Always down to build something new
              </h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-sm">
                Open to internship conversations, code reviews, and interesting engineering problems.
              </p>
              <a
                href="mailto:mohitk3001@gmail.com"
                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors text-lg font-medium"
                style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}
              >
                mohitk3001@gmail.com {}
                <ArrowUpRight size={18} />
              </a>
            </div>

            <div className="mt-10 md:mt-0 flex flex-col gap-3 md:items-end">
              <a
                href="https://github.com/MoX-creater"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github size={15} />
                GitHub
                <ExternalLink size={11} className="opacity-50" />
              </a>
              <a
                href="https://www.linkedin.com/in/mohit-mahanta-027778290/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Linkedin size={15} />
                LinkedIn
                <ExternalLink size={11} className="opacity-50" />
              </a>
              <a
                href="/resume.pdf"
                download
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <FileText size={15} />
                Resume PDF
                <ExternalLink size={11} className="opacity-50" />
              </a>
            </div>
          </div>

          <div className="mt-16 pt-6 border-t border-border flex items-center justify-between">
            <p
              className="text-xs font-mono text-muted-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              Mohit Mahanta · {new Date().getFullYear()}
            </p>
            <p
              className="text-xs font-mono text-muted-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              built with React + Vite
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
