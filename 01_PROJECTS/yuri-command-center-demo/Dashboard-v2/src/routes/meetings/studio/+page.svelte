<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { supabase, hasClient } from "$lib/db";
  import GlassCard from "$components/GlassCard.svelte";
  import { toast } from "$components/GlassToast.svelte";

  // ── Types ──────────────────────────────────────────────────────────
  type TranscriptSegment = { text: string; ts: number; speaker?: string; };
  type MeetingRecord = {
    id: string; title: string; started_at: string; ended_at?: string;
    transcript: TranscriptSegment[]; summary?: string; action_items?: string[];
    created_at: string;
  };

  // ── Config ─────────────────────────────────────────────────────────
  const WHISPER_URL      = "http://localhost:9876";
  const WHISPER_FALLBACK = "/api/functions/whisper-transcribe";
  const CHUNK_MS         = 4_000; // 4s chunks — fast feedback
  const SPEAKERS    = ["Claudio","Client","Team"];
  const WAVEFORM_BARS = 64;

  // ── Clients (for Obsidian push picker) ─────────────────────────────
  const CLIENTS = [
    "SHI","MFB","BOV","ISO","KAP","RIBO","CHI","BBA","GANZ","SLT",
    "UPG","PDRT","BABA","NOBA","ALP","ALPEA","CASA","GRYD","OREA",
    "P2S","GLG","CARN","MACL","C2M",
  ];

  // ── State ──────────────────────────────────────────────────────────
  let recState = $state<"idle"|"recording"|"paused"|"stopped">("idle");
  let whisperOnline = $state<boolean|null>(null);
  let transcript = $state<TranscriptSegment[]>([]);
  let elapsed    = $state(0);
  let meetings   = $state<MeetingRecord[]>([]);
  let meetingsLoadErr = $state<string | null>(null);
  let activeMeeting = $state<MeetingRecord | null>(null);
  let analyzing  = $state(false);
  let autoAnalyzing = $state(false); // auto-triggered on stop
  let analysisResult = $state<{summary:string;actions:string[];proposals:{title:string;priority:string;due:string}[];sentiment?:string;next_steps?:string}|null>(null);
  let createdProposalIdx = $state<Set<number>>(new Set());
  let creatingProposalIdx = $state<number | null>(null);
  let bulkCreatingTickets = $state(false);
  let bulkConfirmOpen = $state(false);
  let meetingTitle = $state("Meeting " + new Date().toLocaleDateString("de-CH"));
  let speakerMap  = $state<Record<string,string>>({});
  let isTranscribing = $state(false);
  let waveCanvas: HTMLCanvasElement | null = null;
  let selectedArchive = $state<MeetingRecord | null>(null);
  let titleEditing = $state(false);

  // Obsidian push state
  let obsidianPushOpen = $state(false);
  let obsidianClient = $state("");
  let obsidianClientName = $state("");
  let obsidianPushing = $state(false);
  let obsidianDone = $state(false);
  let savedAudioUrl = $state<string | null>(null);
  let savedMeetingId = $state<string | null>(null);
  let uploadProgress = $state<"idle"|"uploading"|"done"|"error">("idle");

  type Attendee = { name: string; enrolled: boolean; sampleBlob?: Blob; speakerLabel?: string; };
  let attendees = $state<Attendee[]>([
    { name: "Claudio", enrolled: false },
    { name: "Client",  enrolled: false },
  ]);
  let enrollingIdx = $state<number | null>(null);
  let enrollRecorder: MediaRecorder | null = null;
  let enrollChunks: Blob[] = [];
  let enrollCountdown = $state(0);
  let selectedLang = $state<"auto"|"de"|"en">("auto");
  let newAttendeeName = $state("");

  // ── Audio internals ───────────────────────────────────────────────
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let dataArray: Uint8Array<ArrayBuffer> | null  = null;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let allChunks: Blob[] = []; // full-session audio accumulation for Storage upload
  let currentMimeType = "";
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let chunkTimer:   ReturnType<typeof setInterval> | null = null;
  let rafId: number | null = null;
  let transcriptEl: HTMLElement | null = null;

  // ── Waveform draw loop — canvas only, zero Svelte state updates ──
  function drawWaveform() {
    if (!analyser || !dataArray || !waveCanvas) { rafId = requestAnimationFrame(drawWaveform); return; }
    analyser.getByteFrequencyData(dataArray);
    const ctx = waveCanvas.getContext("2d");
    if (!ctx) return;
    const W = waveCanvas.width, H = waveCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const step = Math.floor(dataArray.length / WAVEFORM_BARS);
    const barW = Math.max(2, Math.floor(W / WAVEFORM_BARS) - 2);
    const color = recState === "recording" ? "#3FB5F2" : recState === "paused" ? "#ff9f0a" : "#64748b";
    for (let i = 0; i < WAVEFORM_BARS; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += dataArray[i * step + j];
      const val = sum / step / 255;
      const barH = Math.max(3, val * H * 0.88);
      const x = i * (barW + 2);
      const y = (H - barH) / 2;
      ctx.globalAlpha = recState === "recording" ? 0.45 + 0.55 * val : 0.2;
      ctx.fillStyle = color;
      ctx.beginPath();
      // @ts-ignore — roundRect available in all modern browsers
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(drawWaveform);
  }

  // ── Whisper status check ──────────────────────────────────────────
  onMount(() => {
    checkWhisper();
    loadMeetings();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (elapsedTimer) clearInterval(elapsedTimer);
      if (chunkTimer)   clearInterval(chunkTimer);
      mediaStream?.getTracks().forEach(t=>t.stop());
    };
  });

  async function checkWhisper() {
    try {
      const r = await fetch(`${WHISPER_URL}/health`, { signal: AbortSignal.timeout(1500) });
      whisperOnline = r.ok;
    } catch {
      // Local Whisper offline — check if fallback (OpenAI via VPS) is available
      try {
        const r2 = await fetch(WHISPER_FALLBACK, { method: "POST", signal: AbortSignal.timeout(3000), body: new FormData() });
        // 400 = function is alive but needs audio — that's fine, means it's reachable
        whisperOnline = r2.status !== 503;
      } catch {
        whisperOnline = false;
      }
    }
  }

  async function loadMeetings() {
    if (!hasClient()) return;
    try {
      meetingsLoadErr = null;
      const { data, error } = await supabase()
        .from("meetings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      meetings = (data || []) as MeetingRecord[];
    } catch (e: any) {
      meetingsLoadErr = e?.message || "Failed to load meeting archive";
    }
  }

  // ── Recording control ─────────────────────────────────────────────
  async function startRecording() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Web Audio analyser for waveform
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      const src = audioCtx.createMediaStreamSource(mediaStream);
      src.connect(analyser);
      drawWaveform();

      // Create meeting record
      activeMeeting = {
        id: crypto.randomUUID(),
        title: meetingTitle,
        started_at: new Date().toISOString(),
        transcript: [],
        created_at: new Date().toISOString(),
      };

      transcript = [];
      analysisResult = null;
      obsidianDone = false;
      obsidianPushOpen = false;
      savedAudioUrl = null;
      uploadProgress = "idle";
      allChunks = [];
      currentMimeType = getMediaType();
      recState = "recording";
      elapsed = 0;

      elapsedTimer = setInterval(() => elapsed++, 1000);

      // Start first chunk immediately, then cycle every CHUNK_MS
      startChunk();
      chunkTimer = setInterval(() => {
        if (recState === "recording") {
          const prev = mediaRecorder;
          startChunk();    // new recorder starts first
          prev?.stop();    // old recorder stops → fires onstop → transcribeChunk(localChunks)
        }
      }, CHUNK_MS);

      whisperOnline = true;
    } catch (err: any) {
      toast(`Mic access denied: ${err.message}`, "error");
    }
  }

  function startChunk() {
    if (!mediaStream) return;
    const localChunks: Blob[] = [];
    const mimeType = currentMimeType || getMediaType();
    const mr = new MediaRecorder(mediaStream, { mimeType });
    mr.ondataavailable = e => {
      if (e.data.size > 0) {
        localChunks.push(e.data);
        allChunks.push(e.data); // accumulate for full-session upload
      }
    };
    mr.onstop = () => transcribeChunk(localChunks);
    mr.start();
    mediaRecorder = mr;
    chunks = localChunks;
  }

  function getMediaType(): string {
    const types = ["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/mp4"];
    return types.find(t => MediaRecorder.isTypeSupported(t)) || "";
  }

  function pauseRecording() {
    if (mediaRecorder?.state === "recording") mediaRecorder.pause();
    recState = "paused";
  }
  function resumeRecording() {
    mediaRecorder?.resume();
    recState = "recording";
  }

  async function stopRecording() {
    recState = "stopped";
    if (chunkTimer)   { clearInterval(chunkTimer);   chunkTimer = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const finalElapsed = elapsed;
    mediaRecorder?.stop(); // fires onstop → transcribeChunk for last chunk
    mediaStream?.getTracks().forEach(t=>t.stop());
    if (activeMeeting) {
      activeMeeting.ended_at = new Date().toISOString();
      activeMeeting.transcript = [...transcript];
    }
    // Wait for last chunk to transcribe, then auto-finalize
    autoFinalizeWhenReady(finalElapsed);
  }

  async function autoFinalizeWhenReady(durationSeconds: number) {
    // Poll until last chunk finishes transcribing (max 15s wait)
    let waited = 0;
    while (isTranscribing && waited < 15000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    // Give onstop a moment to fire
    await new Promise(r => setTimeout(r, 600));
    await autoFinalize(durationSeconds);
  }

  async function autoFinalize(durationSeconds: number) {
    if (transcript.length === 0) return;
    const meetingId = activeMeeting?.id || crypto.randomUUID();
    savedMeetingId = meetingId;

    // 1. Upload audio to Supabase Storage
    if (allChunks.length > 0 && hasClient()) {
      uploadProgress = "uploading";
      try {
        const audioBlob = new Blob(allChunks, { type: currentMimeType || "audio/webm" });
        const { data: uploadData, error: uploadErr } = await supabase()
          .storage
          .from("meetings")
          .upload(`${meetingId}.webm`, audioBlob, { contentType: currentMimeType || "audio/webm", upsert: true });
        if (!uploadErr) {
          const { data: urlData } = supabase().storage.from("meetings").getPublicUrl(`${meetingId}.webm`);
          savedAudioUrl = urlData?.publicUrl || null;
          uploadProgress = "done";
        } else {
          uploadProgress = "error";
        }
      } catch {
        uploadProgress = "error";
      }
    }

    // 2. Auto-analyze with Claude
    autoAnalyzing = true;
    try {
      const fullText = transcript.map(s => s.text).join(" ");
      const res = await fetch("/api/functions/analyze-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullText,
          title: meetingTitle,
          duration_seconds: durationSeconds,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        analysisResult = json;
        // Patch meeting with summary before saving
        if (activeMeeting) {
          activeMeeting.summary = json.summary;
          activeMeeting.action_items = json.actions;
        }
      }
    } catch {
      // Analysis failed silently — user can still push manually
    }
    autoAnalyzing = false;

    // 3. Save full meeting to Supabase
    if (activeMeeting) {
      activeMeeting.transcript = [...transcript];
      await saveMeeting({ ...activeMeeting, id: meetingId } as any);
    }

    // 4. Open Obsidian push panel
    obsidianPushOpen = true;
  }

  async function transcribeChunk(localChunks: Blob[]) {
    if (!whisperOnline || localChunks.length === 0) return;
    const blob = new Blob(localChunks, { type: localChunks[0].type || "audio/webm" });
    isTranscribing = true;
    try {
      let text = "";

      // Try local Whisper first
      try {
        const form = new FormData();
        form.append("file", blob, "chunk.webm");
        form.append("temperature", "0.0");
        form.append("response_format", "json");
        if (selectedLang !== "auto") form.append("language", selectedLang);
        const res = await fetch(`${WHISPER_URL}/inference`, {
          method: "POST", body: form, signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json = await res.json();
          text = (json.text || "").trim();
        }
      } catch {
        // Local offline — fall through to cloud fallback
      }

      // OpenAI Whisper fallback (works when local is offline / on mobile)
      if (!text) {
        try {
          const form2 = new FormData();
          form2.append("audio", blob, "chunk.webm");
          if (selectedLang !== "auto") form2.append("lang", selectedLang);
          const res2 = await fetch(WHISPER_FALLBACK, { method: "POST", body: form2 });
          if (res2.ok) {
            const json2 = await res2.json();
            text = (json2.text || "").trim();
          }
        } catch { /* fallback also failed */ }
      }

      if (!text) return;

      const seg: TranscriptSegment = { text, ts: elapsed };
      transcript = [...transcript, seg];

      // Auto-scroll
      setTimeout(() => {
        if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }, 50);
    } catch {
      // Whisper unavailable during chunk — silently skip
    } finally {
      isTranscribing = false;
    }
  }

  // ── Push to Obsidian ──────────────────────────────────────────────
  async function pushToObsidian() {
    if (!analysisResult && transcript.length === 0) { toast("No content to push","error"); return; }
    obsidianPushing = true;
    try {
      const fullText = transcript.map(s => s.text).join(" ");
      const res = await fetch("/api/functions/push-meeting-to-obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_id: savedMeetingId,
          title: meetingTitle,
          client_code: obsidianClient || undefined,
          client_name: obsidianClientName || obsidianClient || undefined,
          transcript: fullText,
          summary: analysisResult?.summary || "",
          actions: analysisResult?.actions || [],
          proposals: analysisResult?.proposals || [],
          audio_url: savedAudioUrl || undefined,
          duration_seconds: elapsed,
        }),
      });
      if (res.ok) {
        obsidianDone = true;
        obsidianPushOpen = false;
        toast("✓ Saved to Obsidian — EXEO will notify you via Telegram");
      } else {
        toast("Obsidian push failed — check logs","error");
      }
    } catch (e: any) {
      toast(`Push failed: ${e.message}`, "error");
    }
    obsidianPushing = false;
  }

  // ── AI Analysis ───────────────────────────────────────────────────
  async function analyzeTranscript() {
    if (transcript.length === 0) { toast("No transcript yet","error"); return; }
    analyzing = true;
    try {
      const full = transcript.map(s => s.text).join(" ");
      const res = await fetch("/api/functions/analyze-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: full, title: meetingTitle }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      analysisResult = json;
    } catch (err: any) {
      toast(`Analysis failed: ${err.message}`, "error");
    }
    analyzing = false;
  }

  // ── Persist ───────────────────────────────────────────────────────
  async function saveMeeting(m: MeetingRecord) {
    if (!hasClient()) return;
    const { error } = await supabase().from("meetings").upsert({
      id: m.id, title: m.title,
      started_at: m.started_at, ended_at: m.ended_at,
      transcript: m.transcript, summary: m.summary,
      action_items: m.action_items,
    });
    if (!error) await loadMeetings();
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function fmtElapsed(s: number) {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }
  function fmtTs(s: number) {
    const m = Math.floor(s/60), sec = s%60;
    return `[${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}]`;
  }
  function prioColor(p: string) {
    return p==="urgent"?"#ef4444":p==="high"?"#f97316":p==="medium"?"#eab308":"#10b981";
  }

  function dueDays(due: string): number {
    if (!due) return 14;
    // due may be ISO date or relative like "in 5 days"
    try {
      const d = new Date(due);
      if (!isNaN(d.getTime())) {
        const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
        return Math.max(1, Math.min(60, diff));
      }
    } catch { /* fall through */ }
    return 14;
  }

  async function createTicketFromProposal(idx: number) {
    if (!analysisResult) return;
    const p = analysisResult.proposals[idx];
    if (!p || createdProposalIdx.has(idx)) return;
    creatingProposalIdx = idx;
    try {
      const project = obsidianClient && obsidianClient !== "MFB" ? "C2M" : (obsidianClient === "MFB" ? "MFB" : "C2M");
      const titlePrefix = obsidianClient ? `${obsidianClient} — ` : "";
      const res = await fetch("/api/functions/mcp-server", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "create_ticket",
          input: {
            project,
            title: (titlePrefix + p.title).slice(0, 200),
            description: `Auto-proposed from meeting "${meetingTitle}" on ${new Date().toLocaleDateString("de-CH")}.\n\nMeeting summary:\n${analysisResult.summary || ""}`,
            priority: p.priority || "medium",
            assignee: "CTI",
            due_days: dueDays(p.due),
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ref = data?.result?.ref || data?.ref;
      const next = new Set(createdProposalIdx);
      next.add(idx);
      createdProposalIdx = next;
      toast(ref ? `✓ ${ref} created` : "✓ Ticket created", "ok");
    } catch (e: any) {
      toast(`Failed: ${e.message || e}`, "error");
    } finally {
      creatingProposalIdx = null;
    }
  }

  async function createAllTickets() {
    if (!analysisResult || analysisResult.proposals.length === 0) return;
    bulkConfirmOpen = false;
    bulkCreatingTickets = true;
    let created = 0;
    let failed = 0;
    for (let i = 0; i < analysisResult.proposals.length; i++) {
      if (createdProposalIdx.has(i)) continue;
      try {
        await createTicketFromProposal(i);
        if (createdProposalIdx.has(i)) created++; else failed++;
      } catch {
        failed++;
      }
    }
    bulkCreatingTickets = false;
    if (created > 0) toast(`Created ${created} ticket${created === 1 ? "" : "s"}${failed > 0 ? ` · ${failed} failed` : ""}`, failed > 0 ? "warn" : "ok", 3500);
    else if (failed > 0) toast(`All ${failed} ticket${failed === 1 ? "" : "s"} failed — check console`, "error", 3500);
  }

  const fullTranscript = $derived(transcript.map(s=>s.text).join(" "));

  function addAttendee() {
    const n = newAttendeeName.trim();
    if (!n || attendees.find(a=>a.name===n)) return;
    attendees = [...attendees, { name: n, enrolled: false }];
    newAttendeeName = "";
  }
  function removeAttendee(i: number) {
    attendees = attendees.filter((_,j)=>j!==i);
  }

  async function enrollAttendee(idx: number) {
    if (!mediaStream && recState === "idle") {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch { toast("Mic needed for enrollment","error"); return; }
    }
    if (!mediaStream) { toast("Start recording first","error"); return; }
    enrollingIdx = idx;
    enrollChunks = [];
    enrollCountdown = 2;
    enrollRecorder = new MediaRecorder(mediaStream, { mimeType: getMediaType() });
    enrollRecorder.ondataavailable = e => { if(e.data.size>0) enrollChunks.push(e.data); };
    enrollRecorder.onstop = () => {
      const blob = new Blob(enrollChunks, { type: enrollChunks[0]?.type||"audio/webm" });
      attendees = attendees.map((a,i)=>i===idx?{...a,enrolled:true,sampleBlob:blob}:a);
      enrollingIdx = null;
      toast(`${attendees[idx]?.name} voice enrolled ✓`);
    };
    enrollRecorder.start();
    const iv = setInterval(() => {
      enrollCountdown--;
      if (enrollCountdown <= 0) { clearInterval(iv); enrollRecorder?.stop(); }
    }, 1000);
  }

  function langLabel(l: string) {
    return l==="auto"?"Auto-detect":l==="de"?"Deutsch / Schweizerdeutsch":"English";
  }
</script>

<header class="page-head">
  <div class="head-left">
    <span class="caption muted">05 · MEETING STUDIO</span>
    <h1 class="h1 font-display">Meeting Studio</h1>
  </div>
  <div class="head-right">
    <div class="whisper-status {whisperOnline===true?'online':whisperOnline===false?'offline':'checking'}">
      <div class="ws-dot"></div>
      <span class="ws-label font-mono">
        {whisperOnline===true?"Whisper Online":whisperOnline===false?"Whisper Offline":"Checking…"}
      </span>
      {#if whisperOnline===false}
        <button class="ws-retry" onclick={checkWhisper}>Retry</button>
      {/if}
    </div>
  </div>
</header>

<div class="studio-layout">
  <!-- ── MAIN COLUMN ── -->
  <div class="main-col">

    <!-- Studio card -->
    <GlassCard idx={0} padding={0}>
      <div class="studio-card">

        <!-- Title bar -->
        <div class="title-bar">
          {#if titleEditing}
            <input
              class="title-input"
              bind:value={meetingTitle}
              onblur={()=>(titleEditing=false)}
              onkeydown={(e)=>e.key==="Enter"&&(titleEditing=false)}
              autofocus
            />
          {:else}
            <h2 class="meeting-title" onclick={()=>titleEditing=true} title="Click to edit">{meetingTitle}</h2>
          {/if}
          {#if recState!=="idle"}
            <span class="rec-elapsed font-mono">{fmtElapsed(elapsed)}</span>
          {/if}
        </div>

        <!-- Waveform visualizer — canvas, zero re-renders -->
        <div class="waveform-wrap" class:active={recState==="recording"}>
          <canvas bind:this={waveCanvas} class="wave-canvas" width="600" height="80"></canvas>
          {#if isTranscribing}
            <div class="transcribing-badge">
              <span class="tb-dot"></span><span class="tb-label font-mono">Processing…</span>
            </div>
          {/if}
          {#if recState==="idle"}
            <div class="waveform-overlay">
              <span class="wo-text">Ready to record</span>
            </div>
          {:else if recState==="paused"}
            <div class="waveform-overlay">
              <span class="wo-text">Paused</span>
            </div>
          {/if}
        </div>

        <!-- Controls -->
        <div class="controls">
          {#if recState === "idle"}
            <button class="ctrl-btn primary" onclick={startRecording}>
              <span class="ctrl-icon">⏺</span> Start Recording
            </button>
          {:else if recState === "recording"}
            <button class="ctrl-btn amber" onclick={pauseRecording}>
              <span class="ctrl-icon">⏸</span> Pause
            </button>
            <button class="ctrl-btn danger" onclick={stopRecording}>
              <span class="ctrl-icon">⏹</span> Stop
            </button>
          {:else if recState === "paused"}
            <button class="ctrl-btn primary" onclick={resumeRecording}>
              <span class="ctrl-icon">▶</span> Resume
            </button>
            <button class="ctrl-btn danger" onclick={stopRecording}>
              <span class="ctrl-icon">⏹</span> Stop
            </button>
          {:else}
            <button class="ctrl-btn primary" onclick={()=>{recState="idle";transcript=[];elapsed=0;analysisResult=null;obsidianPushOpen=false;obsidianDone=false;savedAudioUrl=null;uploadProgress="idle";}}>
              <span class="ctrl-icon">⏺</span> New Recording
            </button>
            {#if transcript.length > 0 && !autoAnalyzing && !analysisResult}
              <button class="ctrl-btn violet" onclick={analyzeTranscript} disabled={analyzing}>
                {analyzing?"Analyzing…":"✦ Re-Analyze"}
              </button>
            {/if}
            {#if !obsidianDone}
              <button class="ctrl-btn obsidian" onclick={()=>obsidianPushOpen=!obsidianPushOpen} disabled={autoAnalyzing}>
                <span class="ctrl-icon">⌗</span>
                {obsidianPushOpen ? "Hide" : "Push to Obsidian"}
              </button>
            {:else}
              <span class="pushed-badge">✓ Saved to Obsidian</span>
            {/if}
          {/if}
        </div>

        <!-- Auto-finalize status banner -->
        {#if autoAnalyzing || (recState === "stopped" && uploadProgress === "uploading")}
          <div class="auto-status">
            <div class="as-row">
              <span class="as-spinner"></span>
              <span class="as-label font-mono">
                {uploadProgress === "uploading" ? "Uploading audio…" : "Analyzing with Claude…"}
              </span>
            </div>
            <div class="as-steps">
              <span class="as-step" class:done={uploadProgress === "done" || uploadProgress === "error"}>
                {uploadProgress === "uploading" ? "⏳" : uploadProgress === "done" ? "✓" : uploadProgress === "error" ? "⚠" : "○"} Audio backup
              </span>
              <span class="as-step" class:done={!!analysisResult} class:active={autoAnalyzing}>
                {analysisResult ? "✓" : autoAnalyzing ? "⏳" : "○"} AI summary
              </span>
              <span class="as-step">○ Obsidian push</span>
            </div>
          </div>
        {/if}

        <!-- Obsidian push panel -->
        {#if obsidianPushOpen && recState === "stopped"}
          <div class="obsidian-panel">
            <div class="op-header">
              <span class="sec-label">Push to Obsidian Vault</span>
              {#if savedAudioUrl}
                <span class="op-audio-badge">🎵 Audio saved</span>
              {:else if uploadProgress === "error"}
                <span class="op-audio-badge op-err">⚠ Audio upload failed</span>
              {/if}
            </div>

            <div class="op-client-row">
              <span class="op-label">Link to client</span>
              <div class="op-client-chips">
                <button class="op-chip {obsidianClient===''?'active':''}" onclick={()=>obsidianClient=""}>None</button>
                {#each CLIENTS as c}
                  <button class="op-chip {obsidianClient===c?'active':''}" onclick={()=>obsidianClient=c}>{c}</button>
                {/each}
              </div>
            </div>

            {#if obsidianClient}
              <div class="op-name-row">
                <input
                  class="op-name-input"
                  placeholder="Client display name (optional)"
                  bind:value={obsidianClientName}
                />
              </div>
            {/if}

            <button class="op-push-btn" onclick={pushToObsidian} disabled={obsidianPushing}>
              {obsidianPushing ? "Pushing…" : "⌗ Save to Obsidian + Notify via Telegram"}
            </button>
          </div>
        {/if}

        <!-- Speaker map -->
        {#if recState !== "idle" && recState !== "stopped"}
          <div class="speaker-section">
            <span class="sec-label">Speakers</span>
            <div class="speaker-chips">
              {#each SPEAKERS as s, i}
                <div class="speaker-chip" style="--sc:hsl({i*120},60%,55%)">
                  <div class="sc-dot"></div>
                  <span class="sc-name">{s}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Language + Attendees -->
        <div class="setup-section">
          <div class="setup-row">
            <div class="setup-group">
              <span class="sec-label">Language</span>
              <div class="lang-chips">
                {#each (["auto","de","en"] as const) as l}
                  <button class="lang-chip {selectedLang===l?'active':''}" onclick={()=>selectedLang=l}>
                    {langLabel(l)}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <div class="setup-group">
            <span class="sec-label">Attendees <span class="sec-sub">(record 2s voice sample per person)</span></span>
            <div class="attendee-list">
              {#each attendees as a, i}
                <div class="attendee-row">
                  <div class="att-info">
                    <span class="att-enrolled-dot" class:enrolled={a.enrolled}></span>
                    <span class="att-name">{a.name}</span>
                    {#if a.speakerLabel}<span class="att-label font-mono">{a.speakerLabel}</span>{/if}
                  </div>
                  <div class="att-actions">
                    {#if enrollingIdx === i}
                      <span class="att-counting font-mono">{enrollCountdown}s…</span>
                    {:else}
                      <button class="att-btn {a.enrolled?'enrolled':''}" onclick={()=>enrollAttendee(i)}>
                        {a.enrolled?"✓ Re-record":"🎤 2s sample"}
                      </button>
                    {/if}
                    <button class="att-remove" onclick={()=>removeAttendee(i)} aria-label="Remove">✕</button>
                  </div>
                </div>
              {/each}
              <div class="add-attendee">
                <input class="att-input" placeholder="Add attendee…" bind:value={newAttendeeName}
                  onkeydown={(e)=>e.key==="Enter"&&addAttendee()}/>
                <button class="att-add-btn" onclick={addAttendee}>+</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>

    <!-- Live transcript -->
    {#if transcript.length > 0 || recState !== "idle"}
      <GlassCard idx={1}>
        <div class="transcript-head">
          <h2 class="h2 font-display">Live Transcript</h2>
          <div class="transcript-actions">
            <span class="caption muted">{transcript.length} segments</span>
            {#if transcript.length > 0}
              <button class="small-btn" onclick={()=>navigator.clipboard.writeText(fullTranscript)}>Copy</button>
            {/if}
          </div>
        </div>
        <div class="transcript-body" bind:this={transcriptEl}>
          {#if transcript.length === 0}
            <div class="transcript-empty">
              <div class="te-pulse"></div>
              <span class="te-label font-mono">Listening for speech…</span>
            </div>
          {:else}
            {#each transcript as seg, i (i)}
              <div class="seg" class:latest={i===transcript.length-1}>
                <span class="seg-ts font-mono">{fmtTs(seg.ts)}</span>
                <p class="seg-text">{seg.text}</p>
              </div>
            {/each}
          {/if}
        </div>
      </GlassCard>
    {/if}

    <!-- AI Analysis result -->
    {#if analysisResult}
      <GlassCard idx={2} glow>
        <div class="analysis-head">
          <h2 class="h2 font-display">✦ AI Analysis</h2>
        </div>

        <div class="analysis-section">
          <h3 class="as-title">Summary</h3>
          <p class="as-body">{analysisResult.summary}</p>
        </div>

        {#if analysisResult.actions.length > 0}
          <div class="analysis-section">
            <h3 class="as-title">Action Items</h3>
            <ul class="action-list">
              {#each analysisResult.actions as a}
                <li class="action-item">
                  <span class="ai-dot"></span>
                  {a}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if analysisResult.proposals.length > 0}
          <div class="analysis-section">
            <div class="proposals-head">
              <h3 class="as-title">Ticket Proposals · {analysisResult.proposals.length}</h3>
              {#if createdProposalIdx.size < analysisResult.proposals.length}
                <button class="bulk-create-btn" onclick={() => bulkConfirmOpen = true} disabled={bulkCreatingTickets}>
                  {bulkCreatingTickets ? "Creating…" : `✦ Create all on Plane (${analysisResult.proposals.length - createdProposalIdx.size})`}
                </button>
              {:else}
                <span class="all-created-tag">✓ All {analysisResult.proposals.length} created</span>
              {/if}
            </div>
            <div class="proposal-list">
              {#each analysisResult.proposals as p, i}
                {@const created = createdProposalIdx.has(i)}
                {@const creating = creatingProposalIdx === i}
                <div class="proposal-card" class:created>
                  <div class="pc-left">
                    <span class="pc-prio" style="color:{prioColor(p.priority)}">{p.priority}</span>
                    <p class="pc-title">{p.title}</p>
                    {#if p.due}<span class="pc-due font-mono">Due: {p.due}</span>{/if}
                  </div>
                  {#if created}
                    <span class="pc-done-tag">✓ Created</span>
                  {:else}
                    <button class="pc-create" onclick={() => createTicketFromProposal(i)} disabled={creating || bulkCreatingTickets}>
                      {creating ? "Creating…" : "+ Create"}
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </GlassCard>
    {/if}
  </div>

  <!-- ── SIDEBAR ── -->
  <aside class="sidebar-col">
    <!-- Whisper server info -->
    <GlassCard idx={3}>
      <h3 class="h2 font-display" style="margin-bottom:10px;">Whisper Server</h3>
      <div class="ws-info">
        <div class="ws-row">
          <span class="ws-k">Endpoint</span>
          <code class="ws-v">{WHISPER_URL}</code>
        </div>
        <div class="ws-row">
          <span class="ws-k">Chunk size</span>
          <code class="ws-v">{CHUNK_MS/1000}s</code>
        </div>
        <div class="ws-row">
          <span class="ws-k">Binary</span>
          <code class="ws-v">whisper-server</code>
        </div>
        <div class="ws-row">
          <span class="ws-k">Model</span>
          <code class="ws-v">base (auto)</code>
        </div>
      </div>
      {#if whisperOnline === false}
        <div class="ws-cmd">
          <span class="sec-label">Start server command</span>
          <pre class="ws-pre">whisper-server \
  --port 9876 \
  --model base.en</pre>
        </div>
      {/if}
    </GlassCard>

    <!-- Meeting archive -->
    <GlassCard idx={4}>
      <h3 class="h2 font-display" style="margin-bottom:12px;">Archive</h3>
      {#if meetingsLoadErr}
        <p class="caption" style="color:var(--re);">Failed to load archive: {meetingsLoadErr}</p>
      {:else if meetings.length === 0}
        <p class="caption muted">No saved meetings yet</p>
      {:else}
        <div class="archive-list">
          {#each meetings as m}
            <button class="archive-row {selectedArchive?.id===m.id?'active':''}"
              onclick={()=>selectedArchive=selectedArchive?.id===m.id?null:m}>
              <div class="ar-left">
                <span class="ar-title">{m.title}</span>
                <span class="ar-date font-mono">{new Date(m.created_at).toLocaleDateString("de-CH")}</span>
              </div>
              <span class="ar-segs">{m.transcript?.length||0} seg</span>
            </button>
          {/each}
        </div>
      {/if}
    </GlassCard>

    <!-- Selected archive detail -->
    {#if selectedArchive}
      <GlassCard idx={5}>
        <h3 class="h2 font-display" style="margin-bottom:10px;">{selectedArchive.title}</h3>
        {#if selectedArchive.summary}
          <p class="caption" style="margin-bottom:10px;">{selectedArchive.summary}</p>
        {/if}
        <div class="archive-transcript">
          {#each (selectedArchive.transcript||[]).slice(0,10) as seg}
            <p class="arc-seg"><span class="font-mono" style="color:var(--t4)">{fmtTs(seg.ts)}</span> {seg.text}</p>
          {/each}
          {#if (selectedArchive.transcript?.length||0) > 10}
            <p class="caption muted">+ {selectedArchive.transcript.length-10} more…</p>
          {/if}
        </div>
      </GlassCard>
    {/if}
  </aside>
</div>

{#if bulkConfirmOpen && analysisResult}
  <div
    class="bc-backdrop"
    onclick={(e) => { if (e.target === e.currentTarget) bulkConfirmOpen = false; }}
    onkeydown={(e) => e.key === "Escape" && (bulkConfirmOpen = false)}
    role="presentation"
  >
    <div class="bc-modal glass glass--thick">
      <header class="row between items-center bc-head">
        <span class="bc-pill">CREATE TICKETS</span>
        <button class="close-btn" onclick={() => bulkConfirmOpen = false} aria-label="Close">×</button>
      </header>
      <h3 class="bc-title">Create {analysisResult.proposals.length - createdProposalIdx.size} ticket{(analysisResult.proposals.length - createdProposalIdx.size) === 1 ? "" : "s"} on Plane?</h3>
      <p class="caption dim">Project: <strong style="color:var(--tx)">{obsidianClient === "MFB" ? "MFB" : "C2M"}</strong> · Assignee: <strong style="color:var(--tx)">CTI</strong>{obsidianClient ? ` · Client prefix: ${obsidianClient}` : ""}</p>
      <ul class="bc-list">
        {#each analysisResult.proposals as p, i}
          {#if !createdProposalIdx.has(i)}
            <li>
              <span class="pc-prio" style="color:{prioColor(p.priority)}">{p.priority}</span>
              <span class="bc-title-text">{obsidianClient ? obsidianClient + " — " : ""}{p.title}</span>
              {#if p.due}<span class="pc-due font-mono">{p.due}</span>{/if}
            </li>
          {/if}
        {/each}
      </ul>
      <footer class="row gap-2 justify-end bc-foot">
        <button class="ghost-btn" onclick={() => bulkConfirmOpen = false}>Cancel</button>
        <button class="bulk-create-btn" onclick={createAllTickets}>✦ Create all</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .page-head  { display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:12px; }
  .head-right { display:flex; align-items:center; gap:12px; }
  .muted      { color:var(--t4); }

  .studio-layout {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) { .studio-layout { grid-template-columns: 1fr; } }

  .main-col, .sidebar-col { display:flex; flex-direction:column; gap:16px; }

  /* Whisper status pill */
  .whisper-status {
    display:flex; align-items:center; gap:7px;
    padding:7px 14px; border-radius:999px;
    border:1px solid var(--b1);
    background:var(--s1);
  }
  .whisper-status.online  { border-color:rgba(52,199,89,0.3); }
  .whisper-status.offline { border-color:rgba(255,69,58,0.3); }
  .ws-dot {
    width:8px; height:8px; border-radius:50%;
    background:var(--t4);
  }
  .online  .ws-dot { background:var(--gr); box-shadow:0 0 6px var(--gr); animation:ws-pulse 2s ease-in-out infinite; }
  .offline .ws-dot { background:var(--re); }
  @keyframes ws-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  .ws-label { font-size:11.5px; color:var(--t2); }
  .ws-retry { all:unset; cursor:pointer; font-size:11px; color:var(--a); text-decoration:underline; }

  /* Studio card */
  .studio-card { display:flex; flex-direction:column; gap:0; }

  .title-bar {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:20px 24px 16px;
    border-bottom:1px solid var(--b1);
  }
  .meeting-title {
    margin:0; font-family:"Space Grotesk",sans-serif; font-size:17px; font-weight:600;
    cursor:text; color:var(--tx);
    border-bottom:1px dashed transparent;
    transition:border-color 0.14s;
  }
  .meeting-title:hover { border-color:var(--b2); }
  .title-input {
    all:unset; font-family:"Space Grotesk",sans-serif; font-size:17px; font-weight:600;
    color:var(--tx); flex:1;
    border-bottom:1px solid var(--a); padding-bottom:2px;
  }
  .rec-elapsed { font-size:20px; color:var(--re); font-weight:700; letter-spacing:0.04em; }

  /* Waveform */
  .waveform-wrap {
    position:relative; padding:28px 24px;
    background:
      radial-gradient(ellipse 80% 60% at 50% 50%, rgba(63,181,242,0.04) 0%, transparent 70%),
      var(--s1);
    border-bottom:1px solid var(--b1);
    overflow:hidden;
    min-height:120px; display:flex; align-items:center; justify-content:center;
  }
  .wave-canvas {
    width: 100%; height: 80px;
    display: block;
  }
  .transcribing-badge {
    position: absolute; bottom: 10px; right: 14px;
    display: flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 999px;
    background: rgba(63,181,242,0.12); border: 1px solid rgba(63,181,242,0.25);
  }
  .tb-dot {
    width: 6px; height: 6px; border-radius: 50%; background: var(--a);
    animation: tb-pulse 0.8s ease-in-out infinite;
  }
  @keyframes tb-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
  .tb-label { font-size: 10px; color: var(--a); }

  .waveform-overlay {
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    background:var(--overlay); backdrop-filter:blur(1px);
  }
  .wo-text { font-size:13px; color:var(--t3); letter-spacing:0.08em; }

  /* Controls */
  .controls {
    display:flex; gap:10px; padding:18px 24px;
    border-bottom:1px solid var(--b1);
    flex-wrap:wrap;
  }
  .ctrl-btn {
    all:unset; cursor:pointer;
    display:flex; align-items:center; gap:8px;
    padding:11px 22px; border-radius:var(--r-md);
    font-family:"Space Grotesk",sans-serif; font-size:14px; font-weight:600;
    transition:all 0.16s var(--ease-spring);
  }
  .ctrl-btn:hover:not(:disabled) { transform:translateY(-1px); }
  .ctrl-btn:active:not(:disabled) { transform:scale(0.97); }
  .ctrl-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .ctrl-icon { font-size:15px; }
  .ctrl-btn.primary { background:var(--a); color:#fff; box-shadow:0 0 20px var(--a-25); }
  .ctrl-btn.primary:hover:not(:disabled) { box-shadow:0 0 32px var(--a-40); }
  .ctrl-btn.danger  { background:var(--re-18); color:var(--re); border:1px solid var(--re-28); }
  .ctrl-btn.amber   { background:var(--ye-18); color:var(--ye); border:1px solid var(--ye-28); }
  .ctrl-btn.violet  { background:var(--a2-18); color:var(--a2); border:1px solid var(--a2-25); }

  /* Speaker section */
  .speaker-section { padding:14px 24px; display:flex; align-items:center; gap:12px; }
  .sec-label { font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--t4); }
  .speaker-chips { display:flex; gap:8px; }
  .speaker-chip {
    display:flex; align-items:center; gap:6px;
    padding:4px 12px; border-radius:999px;
    background:var(--s1); border:1px solid var(--b1);
  }
  .sc-dot { width:7px; height:7px; border-radius:50%; background:var(--sc); }
  .sc-name { font-size:11.5px; color:var(--t2); }

  /* Transcript */
  .transcript-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
  .transcript-actions { display:flex; align-items:center; gap:10px; }
  .small-btn {
    all:unset; cursor:pointer;
    padding:4px 10px; border-radius:var(--r-sm);
    font-size:11px; color:var(--t3); border:1px solid var(--b1);
    transition:all 0.14s;
  }
  .small-btn:hover { background:var(--s1); color:var(--tx); }
  .transcript-body { max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:8px; }
  .transcript-body::-webkit-scrollbar { width:4px; }
  .transcript-body::-webkit-scrollbar-thumb { background:var(--b2); border-radius:2px; }

  .transcript-empty { display:flex; align-items:center; gap:12px; padding:24px 0; color:var(--t3); }
  .te-pulse {
    width:10px; height:10px; border-radius:50%;
    background:var(--a); animation:te-pulse 1.4s ease-in-out infinite;
  }
  @keyframes te-pulse { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.5);opacity:0.3} }
  .te-label { font-size:13px; }

  .seg { display:flex; gap:10px; padding:7px 0; border-bottom:1px solid var(--b1); }
  .seg.latest { background:color-mix(in oklab,var(--a) 5%,transparent); border-radius:var(--r-sm); padding:7px 10px; margin:0 -10px; }
  .seg-ts { font-size:10px; color:var(--t4); flex-shrink:0; margin-top:2px; }
  .seg-text { margin:0; font-size:13.5px; color:var(--tx); line-height:1.55; }

  /* Analysis */
  .analysis-head { margin-bottom:16px; }
  .analysis-section { margin-bottom:18px; }
  .as-title { margin:0 0 8px; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--t4); }
  .as-body  { margin:0; font-size:14px; color:var(--t2); line-height:1.65; }
  .action-list { margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:8px; }
  .action-item { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; background:var(--s1); border-radius:var(--r-sm); font-size:13px; color:var(--t2); }
  .ai-dot { width:6px; height:6px; border-radius:50%; background:var(--a); flex-shrink:0; margin-top:5px; }
  .proposal-list { display:flex; flex-direction:column; gap:8px; }
  .proposal-card { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; background:var(--s1); border:1px solid var(--b1); border-radius:var(--r-sm); }
  .pc-left { display:flex; flex-direction:column; gap:3px; }
  .pc-prio { font-size:9.5px; text-transform:capitalize; font-weight:600; }
  .pc-title { margin:0; font-size:13px; color:var(--tx); }
  .pc-due  { font-size:10px; color:var(--t4); }
  .pc-create {
    all:unset; cursor:pointer; padding:6px 14px; border-radius:var(--r-sm);
    font-size:12px; color:var(--a); border:1px solid var(--a-12);
    white-space:nowrap; transition:all 0.14s;
  }
  .pc-create:hover:not(:disabled) { background:var(--a-12); }
  .pc-create:disabled { opacity: 0.5; cursor: not-allowed; }
  .pc-done-tag {
    font-size: 11px; color: var(--gr); padding: 4px 10px;
    border: 1px solid rgba(52,199,89,0.3); border-radius: var(--r-sm);
    background: rgba(52,199,89,0.08); white-space: nowrap;
  }
  .proposal-card.created { opacity: 0.7; border-color: rgba(52,199,89,0.2); }

  .proposals-head {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 10px; gap: 12px; flex-wrap: wrap;
  }
  .bulk-create-btn {
    all: unset; cursor: pointer;
    padding: 8px 16px;
    border-radius: var(--r-md);
    font-family: "Space Grotesk", sans-serif;
    font-size: 12.5px; font-weight: 600;
    color: #06080e;
    background: var(--grad-brand);
    box-shadow: 0 0 16px var(--a-25);
    transition: filter var(--dur-fast);
  }
  .bulk-create-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .bulk-create-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .all-created-tag {
    font-size: 11.5px; color: var(--gr); padding: 5px 12px;
    border: 1px solid rgba(52,199,89,0.3); border-radius: 999px;
    background: rgba(52,199,89,0.08);
  }

  /* Bulk confirm modal */
  .bc-backdrop {
    position: fixed; inset: 0;
    background: var(--overlay); backdrop-filter: blur(10px);
    z-index: 90;
    display: grid; place-items: center;
    padding: 20px;
    animation: bc-fade 180ms var(--ease-out);
  }
  @keyframes bc-fade { from { opacity: 0 } to { opacity: 1 } }
  .bc-modal {
    width: min(560px, 100%);
    max-height: 80vh;
    overflow-y: auto;
    padding: 22px 24px;
    display: flex; flex-direction: column; gap: 12px;
    border: 1px solid var(--a-40);
    box-shadow: var(--sh-lg);
    animation: bc-in 240ms var(--ease-spring);
  }
  @keyframes bc-in {
    from { opacity: 0; transform: translateY(8px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .bc-head { padding-bottom: 8px; border-bottom: 1px solid var(--b1); }
  .bc-pill {
    font-size: 10px; letter-spacing: 0.14em;
    padding: 3px 10px; border-radius: 999px;
    background: rgba(63,181,242,0.14);
    border: 1px solid rgba(63,181,242,0.32);
    color: var(--tx); font-weight: 600;
  }
  .close-btn {
    all: unset; cursor: pointer;
    width: 28px; height: 28px;
    display: grid; place-items: center;
    border-radius: 50%;
    background: var(--s2);
    color: var(--t2); font-size: 18px;
  }
  .close-btn:hover { background: var(--s1); color: var(--tx); }
  .bc-title {
    margin: 0;
    font-family: "Space Grotesk", sans-serif;
    font-size: 16px;
    color: var(--tx);
  }
  .dim { color: var(--t4); }
  .bc-list {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 4px;
    max-height: 320px; overflow-y: auto;
  }
  .bc-list li {
    display: grid;
    grid-template-columns: 70px 1fr auto;
    gap: 10px; align-items: center;
    padding: 8px 10px;
    background: var(--s1); border: 1px solid var(--b1);
    border-radius: var(--r-sm);
    font-size: 12px;
  }
  .bc-title-text { color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bc-foot { padding-top: 10px; border-top: 1px solid var(--b1); }
  .ghost-btn {
    all: unset; cursor: pointer;
    padding: 7px 14px; border-radius: var(--r-md);
    font-size: 12.5px; color: var(--t2);
    background: var(--s1); border: 1px solid var(--b1);
  }
  .ghost-btn:hover { background: var(--s2); color: var(--tx); }

  /* Sidebar info */
  .ws-info { display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
  .ws-row  { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .ws-k    { font-size:11px; color:var(--t4); }
  .ws-v    { font-size:11px; color:var(--a); background:var(--s1); padding:2px 7px; border-radius:4px; }
  .ws-cmd  { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
  .ws-pre  { font-size:10.5px; white-space:pre; margin:0; }

  /* Archive */
  .archive-list { display:flex; flex-direction:column; gap:4px; }
  .archive-row {
    all:unset; cursor:pointer;
    display:flex; align-items:center; justify-content:space-between;
    padding:8px 10px; border-radius:var(--r-sm); gap:10px;
    border:1px solid transparent;
    transition:all 0.14s;
  }
  .archive-row:hover { background:var(--s1); }
  .archive-row.active { background:var(--a-08); border-color:var(--a-25); }
  .ar-left { display:flex; flex-direction:column; gap:2px; }
  .ar-title { font-size:12.5px; color:var(--tx); }
  .ar-date  { font-size:10px; color:var(--t4); }
  .ar-segs  { font-size:10px; color:var(--t3); flex-shrink:0; }

  .archive-transcript { display:flex; flex-direction:column; gap:6px; max-height:200px; overflow-y:auto; }
  .arc-seg { margin:0; font-size:11.5px; color:var(--t3); line-height:1.5; }

  .setup-section { padding: 14px 24px 18px; display: flex; flex-direction: column; gap: 16px; border-top: 1px solid var(--b1); }
  .setup-row { display: flex; gap: 24px; flex-wrap: wrap; }
  .setup-group { display: flex; flex-direction: column; gap: 8px; }
  .sec-sub { font-size: 9px; color: var(--t4); font-weight: 400; letter-spacing: 0.06em; text-transform: none; }
  .lang-chips { display: flex; gap: 6px; }
  .lang-chip {
    all: unset; cursor: pointer;
    padding: 5px 14px; border-radius: 999px;
    font-size: 12px; border: 1px solid var(--b2); color: var(--t3);
    transition: all 0.14s;
  }
  .lang-chip:hover { border-color: var(--b3); color: var(--t2); }
  .lang-chip.active { background: var(--a-12); border-color: var(--a-40); color: var(--a); }

  .attendee-list { display: flex; flex-direction: column; gap: 6px; }
  .attendee-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; background: var(--s1); border-radius: 8px; border: 1px solid var(--b1); }
  .att-info { display: flex; align-items: center; gap: 8px; }
  .att-enrolled-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--b3); transition: background 0.3s; flex-shrink: 0; }
  .att-enrolled-dot.enrolled { background: var(--gr); box-shadow: 0 0 6px var(--gr); }
  .att-name { font-size: 13px; color: var(--tx); }
  .att-label { font-size: 10px; color: var(--t3); }
  .att-actions { display: flex; align-items: center; gap: 6px; }
  .att-btn {
    all: unset; cursor: pointer; padding: 4px 12px; border-radius: 6px;
    font-size: 11px; border: 1px solid var(--b2); color: var(--t3);
    transition: all 0.14s; white-space: nowrap;
  }
  .att-btn:hover { background: var(--s2); color: var(--tx); }
  .att-btn.enrolled { border-color: var(--gr-28); color: var(--gr); }
  .att-counting { font-size: 11px; color: var(--a); min-width: 28px; text-align: center; }
  .att-remove {
    all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center;
    border-radius: 4px; font-size: 11px; color: var(--t4);
    transition: all 0.14s;
  }
  .att-remove:hover { background: var(--re-14); color: var(--re); }
  .add-attendee { display: flex; gap: 6px; margin-top: 2px; }
  .att-input {
    all: unset; flex: 1; padding: 7px 12px; border-radius: 8px;
    background: var(--s1); border: 1px solid var(--b2);
    font-size: 12.5px; color: var(--tx);
    transition: border-color 0.14s;
  }
  .att-input:focus { border-color: rgba(63,181,242,0.4); }
  .att-add-btn {
    all: unset; cursor: pointer; width: 34px; height: 34px;
    display: grid; place-items: center;
    border-radius: 8px; border: 1px solid rgba(63,181,242,0.25);
    color: var(--a); font-size: 18px;
    transition: all 0.14s;
  }
  .att-add-btn:hover { background: rgba(63,181,242,0.1); }

  /* Auto-status banner */
  .auto-status {
    padding: 14px 24px;
    border-top: 1px solid rgba(63,181,242,0.15);
    background: rgba(63,181,242,0.04);
    display: flex; flex-direction: column; gap: 10px;
  }
  .as-row { display: flex; align-items: center; gap: 10px; }
  .as-spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(63,181,242,0.2);
    border-top-color: var(--a);
    animation: spin 0.8s linear infinite; flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .as-label { font-size: 12px; color: rgba(63,181,242,0.8); }
  .as-steps { display: flex; gap: 16px; padding-left: 24px; }
  .as-step { font-size: 11px; color: var(--t4); transition: color 0.3s; }
  .as-step.done { color: var(--gr); }
  .as-step.active { color: var(--a); }

  /* Obsidian push panel */
  .obsidian-panel {
    margin: 0 16px 4px;
    padding: 16px;
    border-radius: 12px;
    border: 1px solid rgba(99,120,255,0.2);
    background: rgba(99,120,255,0.06);
    display: flex; flex-direction: column; gap: 14px;
    animation: fade-slide-in 0.25s ease;
  }
  @keyframes fade-slide-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
  .op-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .op-audio-badge {
    font-size: 10px; padding: 2px 8px; border-radius: 999px;
    background: var(--gr-14); color: var(--gr);
    border: 1px solid rgba(52,199,89,0.25);
  }
  .op-audio-badge.op-err { background: var(--re-14); color: var(--re); border-color: var(--re-28); }
  .op-client-row { display: flex; flex-direction: column; gap: 8px; }
  .op-label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--t4); }
  .op-client-chips {
    display: flex; flex-wrap: wrap; gap: 5px;
    max-height: 100px; overflow-y: auto;
  }
  .op-chip {
    all: unset; cursor: pointer;
    padding: 3px 10px; border-radius: 999px;
    font-size: 11px; border: 1px solid var(--b2);
    color: var(--t3); transition: all 0.14s;
    font-family: "JetBrains Mono", monospace; font-weight: 600;
  }
  .op-chip:hover { border-color: var(--b3); color: var(--t2); }
  .op-chip.active { background: var(--a2-18); border-color: var(--a2-25); color: var(--a2); }
  .op-name-row { margin-top: -4px; }
  .op-name-input {
    all: unset; width: 100%; padding: 7px 12px; border-radius: 8px;
    background: var(--s1); border: 1px solid var(--b2);
    font-size: 12.5px; color: var(--tx); box-sizing: border-box;
    transition: border-color 0.14s;
  }
  .op-name-input:focus { border-color: var(--a2-40, rgba(123,92,255,0.4)); }
  .op-push-btn {
    all: unset; cursor: pointer;
    padding: 11px 18px; border-radius: 10px;
    background: var(--a2-18); border: 1px solid var(--a2-25);
    color: color-mix(in oklab, var(--a2) 80%, white); font-size: 13px; font-weight: 600;
    font-family: "Space Grotesk", sans-serif;
    text-align: center; transition: all 0.16s;
  }
  .op-push-btn:hover:not(:disabled) { background: var(--a2-25); color: color-mix(in oklab, var(--a2) 60%, white); transform: translateY(-1px); }
  .op-push-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Stopped-state extras */
  .ctrl-btn.obsidian { background: var(--a2-12); color: color-mix(in oklab, var(--a2) 70%, white); border: 1px solid var(--a2-25); }
  .ctrl-btn.obsidian:hover:not(:disabled) { background: var(--a2-25); }
  .pushed-badge {
    padding: 10px 16px; font-size: 13px; color: var(--gr);
    border: 1px solid var(--gr-28); border-radius: var(--r-md);
    background: var(--gr-14); font-weight: 600;
    font-family: "Space Grotesk", sans-serif;
  }
</style>
