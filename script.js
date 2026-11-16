const bg = document.getElementById("bg");
const video = document.getElementById("previewVideo");
const sel = document.getElementById("selection");
const stage = document.getElementById("stageWrapper");
const fileStatus = document.getElementById("fileStatus");
let videoUrl = null;
let interaction = null;
let selectedFileName = "";
let resolutionEditedDuringLoad = false;
let loadingVideoMetadata = false;

function setValueSource(id, state, message) {
    const label = document.getElementById(id);
    label.setAttribute("data-state", state);
    label.textContent = message;
}

// Výběr je uložen jako podíl celého snímku, nezávisle na velikosti náhledu.
const selection = { x: 0.1, y: 0.1, w: 0.2, h: 0.15 };
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function drawSelection() {
    for (const [property, value] of Object.entries({
        left: selection.x, top: selection.y, width: selection.w, height: selection.h
    })) sel.style[property] = `${value * 100}%`;
}

const resizer = document.createElement("div");
resizer.className = "resizer";
resizer.setAttribute("aria-label", "Změnit velikost výběru");
sel.appendChild(resizer);
drawSelection();

sel.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    interaction = { resize: event.target === resizer, startX: event.clientX,
        startY: event.clientY, ...selection };
    sel.setPointerCapture(event.pointerId);
});
sel.addEventListener("pointermove", event => {
    if (!interaction) return;
    const rect = stage.getBoundingClientRect();
    const dx = (event.clientX - interaction.startX) / rect.width;
    const dy = (event.clientY - interaction.startY) / rect.height;
    if (interaction.resize) {
        selection.w = clamp(interaction.w + dx, Math.min(20 / rect.width, 1 - selection.x), 1 - selection.x);
        selection.h = clamp(interaction.h + dy, Math.min(20 / rect.height, 1 - selection.y), 1 - selection.y);
    } else {
        selection.x = clamp(interaction.x + dx, 0, 1 - selection.w);
        selection.y = clamp(interaction.y + dy, 0, 1 - selection.h);
    }
    drawSelection();
    generateCommand();
});
sel.addEventListener("pointerup", () => { interaction = null; });
sel.addEventListener("pointercancel", () => { interaction = null; });

document.getElementById("videoFile").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrl = URL.createObjectURL(file);
    selectedFileName = file.name;
    loadingVideoMetadata = true;
    resolutionEditedDuringLoad = false;
    setValueSource("resolutionSource", "pending", "Zjišťuji rozlišení…");
    const match = file.name.match(/^(.*)(\.[^.]+)$/);
    const ext = match ? match[2].toLowerCase() : "";
    const extSelect = document.getElementById("videoExt");
    if (!Array.from(extSelect.options).some(option => option.value === ext)) {
        extSelect.add(new Option(ext || "bez přípony", ext));
    }
    extSelect.value = ext;
    const baseName = match ? match[1] : file.name;
    document.getElementById("videoName").value = baseName;
    document.getElementById("outputName").value = `${baseName}_blurred`;
    document.getElementById("outputExt").value = ext === ".mp4" ? ".mp4" : ".mkv";
    setValueSource("inputSource", "auto", "✓ Načteno z vybraného souboru");
    setValueSource("outputSource", "auto", "✓ Automaticky vytvořený název");
    bg.hidden = false;
    video.hidden = true;
    fileStatus.textContent = `Vybráno: ${file.name}. Zjišťuji rozlišení a načítám náhled…`;
    video.src = videoUrl;
    video.load();
    generateCommand();
});
video.addEventListener("loadedmetadata", () => {
    loadingVideoMetadata = false;
    if (!video.videoWidth || !video.videoHeight) {
        if (!resolutionEditedDuringLoad) setValueSource("resolutionSource", "pending", "Rozlišení se nepodařilo zjistit");
        fileStatus.textContent = `Vybráno: ${selectedFileName}. Rozlišení se nepodařilo zjistit; zadejte ho ručně.`;
        return;
    }
    if (!resolutionEditedDuringLoad) {
        document.getElementById("videoWidth").value = video.videoWidth;
        document.getElementById("videoHeight").value = video.videoHeight;
        setValueSource("resolutionSource", "auto", "✓ Zjištěno z videa");
    }
    bg.hidden = true;
    video.hidden = false;
    fileStatus.textContent = `Vybráno: ${selectedFileName} · Rozlišení: ${video.videoWidth} × ${video.videoHeight} px. Video zůstává v prohlížeči.`;
    generateCommand();
});
video.addEventListener("error", () => {
    loadingVideoMetadata = false;
    if (!resolutionEditedDuringLoad) setValueSource("resolutionSource", "pending", "Rozlišení se nepodařilo zjistit");
    bg.hidden = false;
    video.hidden = true;
    fileStatus.textContent = `Vybráno: ${selectedFileName}. Prohlížeč tento formát nebo kodek neumí načíst, proto nemůže zobrazit náhled ani zjistit rozlišení. Zadejte rozlišení ručně nebo zkuste podporované video. Soubor se nikam nenahrává.`;
});

// Jednoduché uvozovky chrání i mezery a speciální znaky v názvech v POSIX shellu.
function shellQuote(value) {
    return "'" + value.replace(/'/g, "'\\''") + "'";
}
function fileName(inputId, extId) {
    const name = document.getElementById(inputId).value.trim();
    const ext = document.getElementById(extId).value;
    return (name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext);
}

// CSS používá gaussovské rozostření; přepočet přibližuje jeden průchod boxblur.
function updateBlurPreview() {
    const videoW = Number(document.getElementById("videoWidth").value);
    const videoH = Number(document.getElementById("videoHeight").value);
    const requested = Number(document.getElementById("blurRadius").value);
    if (!(videoW >= 2 && videoH >= 2 && Number.isFinite(requested))) {
        sel.style.setProperty("--preview-blur", "0px");
        return;
    }
    const x = Math.min(Math.floor(selection.x * videoW / 2) * 2, Math.floor((videoW - 2) / 2) * 2);
    const y = Math.min(Math.floor(selection.y * videoH / 2) * 2, Math.floor((videoH - 2) / 2) * 2);
    const right = Math.min(Math.ceil((selection.x + selection.w) * videoW / 2) * 2, Math.floor(videoW / 2) * 2);
    const bottom = Math.min(Math.ceil((selection.y + selection.h) * videoH / 2) * 2, Math.floor(videoH / 2) * 2);
    const minDimension = Math.min(Math.max(2, right - x), Math.max(2, bottom - y));
    const limit = Math.max(0, Math.floor((Math.floor(minDimension / 2) - 1) / 2));
    const radius = clamp(Math.floor(requested), 0, limit);
    const scale = stage.getBoundingClientRect().width / videoW;
    sel.style.setProperty("--preview-blur", `${radius * scale / Math.sqrt(3)}px`);
}

function generateCommand() {
    const videoW = Number(document.getElementById("videoWidth").value);
    const videoH = Number(document.getElementById("videoHeight").value);
    const output = document.getElementById("output");
    const videoName = fileName("videoName", "videoExt");
    const outputName = fileName("outputName", "outputExt");
    if (!Number.isInteger(videoW) || !Number.isInteger(videoH) || videoW < 2 || videoH < 2) {
        output.value = "Zadejte platné rozlišení alespoň 2 × 2 pixely.";
        return;
    }
    stage.style.aspectRatio = `${videoW} / ${videoH}`;
    stage.style.width = `min(100%, ${500 * videoW / videoH}px)`;
    updateBlurPreview();

    // FFmpeg dosadí rozměry skutečně dekódovaného snímku, ne rozměry displeje
    // ani rozměry náhledu, které mohou zohledňovat poměr stran pixelů.
    const fraction = value => Number(clamp(value, 0, 1).toFixed(10));
    const start = (size, value) => `min(floor(${size}*${fraction(value)}/2)*2\\,floor((${size}-2)/2)*2)`;
    const extent = (size, origin, length) =>
        `max(2\\,min(ceil(${size}*${fraction(origin + length)}/2)*2\\,floor(${size}/2)*2)-${start(size, origin)})`;
    const x = start("iw", selection.x);
    const y = start("ih", selection.y);
    const w = extent("iw", selection.x, selection.w);
    const h = extent("ih", selection.y, selection.h);
    const overlayX = start("main_w", selection.x);
    const overlayY = start("main_h", selection.y);
    const requestedRadius = Number(document.getElementById("blurRadius").value);
    const radius = Number.isFinite(requestedRadius) ? Math.max(0, Math.floor(requestedRadius)) : 0;
    const mode = document.getElementById("bitrateMode").value;
    document.getElementById("manualBitrate").hidden = mode !== "manual";
    setValueSource("bitrateSource", mode === "manual" ? "manual" : "pending", mode === "manual"
        ? "BPS zadáváš ručně."
        : "BPS se zjistí až při spuštění příkazu v terminálu.");
    const rawBitrate = document.getElementById("targetBitrate").value.trim();
    if (mode === "manual" && (!/^[0-9]+$/.test(rawBitrate) || Number(rawBitrate) < 2 || !Number.isSafeInteger(Number(rawBitrate)))) {
        output.value = "Zadejte platný datový tok vstupního videa v bps (alespoň 2).";
        return;
    }
    const filter = `[0:v]crop=w=${w}:h=${h}:x=${x}:y=${y},boxblur=luma_radius=min(${radius}\\,floor((min(cw\\,ch)-1)/2)):luma_power=1[blur];[0:v][blur]overlay=x=${overlayX}:y=${overlayY},format=yuv420p[vout]`;
    const encoder = `ffmpeg -i ${shellQuote(videoName)} -filter_complex ${shellQuote(filter)} -map '[vout]' -map '0:a?' -c:v hevc_videotoolbox -b:v`;
    if (mode === "manual") {
        output.value = `${encoder} ${Math.floor(Number(rawBitrate) * 0.8)} -c:a copy ${shellQuote(outputName)}`;
        return;
    }
    // BPS v tagu má přednost; pokud chybí, zkusíme bit_rate video stopy.
    const probe = entry => `ffprobe -v error -select_streams v:0 -show_entries ${entry} -of default=noprint_wrappers=1:nokey=1 ${shellQuote(videoName)}`;
    const calculate = `awk '/^[0-9]+$/ && $0 >= 2 { printf "%.0f", int($0 * 0.8); exit }'`;
    output.value = `bps=$(${probe("stream_tags=BPS")} | ${calculate})\n` +
        `if [ -z "$bps" ]; then bps=$(${probe("stream=bit_rate")} | ${calculate}); fi\n` +
        `if [ -n "$bps" ]; then\n  ${encoder} "$bps" -c:a copy ${shellQuote(outputName)}\n` +
        `else\n  printf '%s\\n' 'Datový tok videa se nepodařilo zjistit. Zvolte ruční zadání bps.' >&2\n  false\nfi`;

}

for (const [id, source] of [["videoName", "inputSource"], ["videoExt", "inputSource"],
    ["outputName", "outputSource"], ["outputExt", "outputSource"],
    ["videoWidth", "resolutionSource"], ["videoHeight", "resolutionSource"]]) {
    document.getElementById(id).addEventListener("input", () => {
        if (source === "resolutionSource" && loadingVideoMetadata) resolutionEditedDuringLoad = true;
        setValueSource(source, "manual", "Upraveno ručně");
    });
}

["bitrateMode", "targetBitrate", "videoName", "outputName", "videoExt", "outputExt", "videoWidth", "videoHeight", "blurRadius"]
    .forEach(id => document.getElementById(id).addEventListener("input", generateCommand));

document.getElementById("copyBtn").addEventListener("click", async function () {
    const value = document.getElementById("output").value;
    if (!value.startsWith("ffmpeg ") && !value.startsWith("bps=$(")) return;
    try {
        await navigator.clipboard.writeText(value);
        this.innerText = "Zkopírováno!";
        setTimeout(() => { this.innerText = "Zkopírovat příkaz"; }, 2000);
    } catch {
        this.innerText = "Kopírování selhalo";
        setTimeout(() => { this.innerText = "Zkopírovat příkaz"; }, 2000);
    }
});
if (typeof ResizeObserver !== "undefined") new ResizeObserver(updateBlurPreview).observe(stage);
else window.addEventListener("resize", updateBlurPreview);
generateCommand();
