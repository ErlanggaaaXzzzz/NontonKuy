const BATCH_SIZE = 40;
const CONCURRENCY = 3;

const videoFileInput = document.getElementById('videoFile');
const videoUrlInput = document.getElementById('videoUrl');
const subFileInput = document.getElementById('subFile');
const sourceLangSelect = document.getElementById('sourceLang');
const translateBtn = document.getElementById('translateBtn');
const downloadVttBtn = document.getElementById('downloadVtt');
const downloadSrtBtn = document.getElementById('downloadSrt');
const statusEl = document.getElementById('status');
const player = document.getElementById('player');

let translatedCues = [];
let currentTrackUrl = null;
let currentVideoObjectUrl = null;

function setStatus(text) {
    statusEl.textContent = text;
}

function normalizeTime(value) {
    return value.trim().replace(',', '.');
}

function parseSubtitle(raw) {
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const blocks = text.split(/\n{2,}/);
    const cues = [];
    blocks.forEach((block) => {
        const lines = block.split('\n').filter((line) => line.length > 0);
        const timeIndex = lines.findIndex((line) => line.includes('-->'));
        if (timeIndex === -1) return;
        const [startRaw, endRaw] = lines[timeIndex].split('-->');
        const cueText = lines.slice(timeIndex + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
        if (!cueText) return;
        const start = normalizeTime(startRaw);
        const end = normalizeTime(endRaw.trim().split(/\s+/)[0]);
        cues.push({ start: withHours(start), end: withHours(end), text: cueText });
    });
    return cues;
}

function withHours(time) {
    return time.split(':').length === 2 ? `00:${time}` : time;
}

function buildVtt(cues) {
    const body = cues.map((cue) => `${cue.start} --> ${cue.end}\n${cue.text}`).join('\n\n');
    return `WEBVTT\n\n${body}\n`;
}

function buildSrt(cues) {
    return cues.map((cue, index) => `${index + 1}\n${cue.start.replace('.', ',')} --> ${cue.end.replace('.', ',')}\n${cue.text}`).join('\n\n') + '\n';
}

async function translateBatch(texts, source) {
    const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, source })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || 'Terjemahan gagal');
    return result.data;
}

async function translateAll(cues, source, onProgress) {
    const batches = [];
    for (let i = 0; i < cues.length; i += BATCH_SIZE) {
        batches.push(cues.slice(i, i + BATCH_SIZE));
    }
    const results = new Array(batches.length);
    let nextIndex = 0;
    let finished = 0;

    async function worker() {
        while (nextIndex < batches.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await translateBatch(batches[index].map((cue) => cue.text), source);
            finished += 1;
            onProgress(finished, batches.length);
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    return cues.map((cue, i) => ({ ...cue, text: results[Math.floor(i / BATCH_SIZE)][i % BATCH_SIZE] || cue.text }));
}

function attachVideo() {
    if (currentVideoObjectUrl) {
        URL.revokeObjectURL(currentVideoObjectUrl);
        currentVideoObjectUrl = null;
    }
    const file = videoFileInput.files[0];
    const link = videoUrlInput.value.trim();
    if (file) {
        currentVideoObjectUrl = URL.createObjectURL(file);
        player.src = currentVideoObjectUrl;
    } else if (/^https?:\/\//i.test(link)) {
        player.src = link;
    }
}

function attachTrack(cues) {
    player.querySelectorAll('track').forEach((track) => track.remove());
    if (currentTrackUrl) URL.revokeObjectURL(currentTrackUrl);
    currentTrackUrl = URL.createObjectURL(new Blob([buildVtt(cues)], { type: 'text/vtt' }));
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'Indonesia';
    track.srclang = 'id';
    track.src = currentTrackUrl;
    track.default = true;
    player.appendChild(track);
    player.addEventListener('loadedmetadata', () => {
        if (player.textTracks[0]) player.textTracks[0].mode = 'showing';
    }, { once: true });
    if (player.textTracks[0]) player.textTracks[0].mode = 'showing';
}

function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

videoFileInput.addEventListener('change', attachVideo);
videoUrlInput.addEventListener('change', attachVideo);

translateBtn.addEventListener('click', async () => {
    const subFile = subFileInput.files[0];
    if (!subFile) {
        setStatus('Pilih file subtitle dulu.');
        return;
    }
    translateBtn.disabled = true;
    downloadVttBtn.disabled = true;
    downloadSrtBtn.disabled = true;
    try {
        const cues = parseSubtitle(await subFile.text());
        if (cues.length === 0) throw new Error('Subtitle kosong atau formatnya tidak dikenali');
        attachVideo();
        setStatus(`Menerjemahkan ${cues.length} baris...`);
        translatedCues = await translateAll(cues, sourceLangSelect.value, (done, total) => {
            setStatus(`Menerjemahkan... ${done}/${total}`);
        });
        attachTrack(translatedCues);
        downloadVttBtn.disabled = false;
        downloadSrtBtn.disabled = false;
        setStatus(`Selesai, ${translatedCues.length} baris sudah diterjemahkan.`);
    } catch (error) {
        setStatus('Gagal: ' + error.message);
    } finally {
        translateBtn.disabled = false;
    }
});

downloadVttBtn.addEventListener('click', () => download('subtitle-indonesia.vtt', buildVtt(translatedCues), 'text/vtt'));
downloadSrtBtn.addEventListener('click', () => download('subtitle-indonesia.srt', buildSrt(translatedCues), 'application/x-subrip'));
