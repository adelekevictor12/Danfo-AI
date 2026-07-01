"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { FlipWords } from "./flipword";

interface Msg {
  role: "user" | "assistant";
  content: string;
  verified?: boolean;
}

const GREETINGS = ["E kaabo.", "Nnọọ.", "Barka.", "Welcome."];

const SAMPLES = [
  "Mo fẹ lọ si Oshodi lati CMS",
  "Kedu ka m ga-esi gaa Ikeja site na Yaba?",
  "Ina son zuwa Lekki daga Obalende",
  "How much from Ikorodu to TBS?",
];

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [kbSource, setKbSource] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setKbSource(data.kbSource || "");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply, verified: data.verified },
      ]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Wahala dey o — " + (e.message || "couldn't reach 0G Compute."),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  
  return (
    <main className="wrap">
      <header className="top flex items-center gap-4 !justify-between">
        <Image src="/danfoai_logo.png" alt="0G logo" width={75} height={55} />
        <div className="chainbadge" title="Powered by 0G decentralized AI">
          on&nbsp;0G
        </div>
      </header>

      <section className="chat" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty">
            <p className="emptylead">
              <FlipWords words={GREETINGS} duration={2500} className="text-[#111] font-bold" />
              {" "}Where you dey go today?
            </p>
            <div className="samples">
              {SAMPLES.map((s) => (
                <button key={s} className="sample" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="content">{m.content}</div>
            {m.role === "assistant" && (
              <div className={`verify ${m.verified ? "ok" : "warn"}`}>
                {m.verified ? "✓ verified on 0G Compute" : "unverified response"}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="bubble assistant">
            <div className="content typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </section>

      <footer className="composer">
        
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Type your destination: where you dey go?"
          aria-label="Your destination"
        />
        <button className="go" onClick={() => send(input)} disabled={loading}>
          Go
        </button>
      </footer>

      {kbSource && (
        <div className="provenance">
          route data: {kbSource} · corrections recorded on 0G Chain
        </div>
      )}

      <style jsx>{`
        .wrap {
          max-width: 720px;
          margin: 0 auto;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          background: #fffdf5;
        }
        .top {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          border-bottom: 3px solid #111;
          background: #ffd400;
        }
        .brandmark {
          display: flex;
          flex-direction: column;
          gap: 3px;
          width: 34px;
        }
        .stripe {
          height: 5px;
          border-radius: 2px;
          background: #111;
        }
        .stripe:nth-child(2) { background: #0050b3; width: 70%; }
        .stripe:nth-child(3) { width: 85%; }
        .brandtext { flex: 1; }
        .brandtext h1 {
          margin: 0;
          font-size: 26px;
          letter-spacing: -0.02em;
          font-weight: 800;
          color: #111;
        }
        .brandtext p {
          margin: 2px 0 0;
          font-size: 12.5px;
          color: #5b4a00;
        }
        .chainbadge {
          font-size: 12px;
          font-weight: 700;
          background: #111;
          color: #ffd400;
          padding: 6px 10px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .chat {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .empty { margin: auto 0; text-align: center; }
        .emptylead {
          font-size: 18px;
          font-weight: 700;
          color: #111;
          margin-bottom: 16px;
        }
        .samples {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-width: 420px;
          margin: 0 auto;
        }
        .sample {
          text-align: left;
          padding: 12px 14px;
          border: 2px solid #111;
          border-radius: 12px;
          background: #fff;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.05s, background 0.15s;
        }
        .sample:hover { background: #fff7cc; transform: translateY(-1px); }
        .bubble { max-width: 82%; }
        .bubble.user {
          align-self: flex-end;
          background: #0050b3;
          color: #fff;
          padding: 12px 15px;
          border-radius: 16px 16px 4px 16px;
        }
        .bubble.assistant {
          align-self: flex-start;
          background: #fff;
          border: 2px solid #111;
          padding: 12px 15px;
          border-radius: 16px 16px 16px 4px;
        }
        .content { white-space: pre-wrap; line-height: 1.5; font-size: 15px; }
        .verify {
          margin-top: 7px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .verify.ok { color: #0a7a2f; }
        .verify.warn { color: #9a6b00; }
        .typing { display: flex; gap: 4px; }
        .typing span {
          width: 7px; height: 7px; border-radius: 50%;
          background: #111; opacity: 0.4;
          animation: blink 1.2s infinite;
        }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink { 0%,100%{opacity:0.2} 50%{opacity:0.9} }
        .composer {
          display: flex;
          gap: 8px;
          padding: 14px 16px;
          border-top: 3px solid #111;
          background: #fffdf5;
        }
        .composer input {
          flex: 1;
          padding: 13px 15px;
          border: 2px solid #111;
          border-radius: 12px;
          font-size: 15px;
          outline: none;
        }
        .composer input:focus { box-shadow: 0 0 0 3px #ffd40080; }
        .mic, .go {
          border: 2px solid #111;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          font-size: 14px;
          padding: 0 14px;
        }
        .mic { background: #fff; }
        .mic.live { background: #d92626; color: #fff; border-color: #d92626; }
        .go { background: #ffd400; }
        .go:disabled { opacity: 0.5; cursor: default; }
        .provenance {
          font-size: 11px;
          color: #7a6a30;
          text-align: center;
          padding: 6px 0 10px;
        }
        @media (prefers-reduced-motion: reduce) {
          .typing span { animation: none; }
          .sample { transition: none; }
        }
      `}</style>
    </main>
  );
}
