const bg = document.getElementById("bg");
const sel = document.getElementById("selection");
const stage = document.getElementById("stageWrapper");

let dragging = false, offsetX = 0, offsetY = 0;
let resizing = false;

// Inicialní pozice a velikost výběru
sel.style.left = "50px";
sel.style.top = "50px";
sel.style.width = "150px";
sel.style.height = "70px";

// Resizer bod
const resizer = document.createElement("div");
resizer.style.width = "12px";
resizer.style.height = "12px";
resizer.style.background = "var(--accent)";
resizer.style.position = "absolute";
resizer.style.right = "-6px";
resizer.style.bottom = "-6px";
resizer.style.cursor = "nwse-resize";
sel.appendChild(resizer);

// Drag & Drop logika
sel.onmousedown = e => { dragging = true; offsetX = e.offsetX; offsetY = e.offsetY; };
resizer.onmousedown = e => { resizing = true; e.stopPropagation(); };

document.onmousemove = e => {
    const rect = stage.getBoundingClientRect();
    if(dragging){
        let x = e.clientX - rect.left - offsetX;
        let y = e.clientY - rect.top - offsetY;
        sel.style.left = Math.max(0, Math.min(x, stage.clientWidth - sel.offsetWidth)) + "px";
        sel.style.top = Math.max(0, Math.min(y, stage.clientHeight - sel.offsetHeight)) + "px";
        generateCommand();
    }
    if(resizing){
        let w = e.clientX - sel.getBoundingClientRect().left;
        let h = e.clientY - sel.getBoundingClientRect().top;
        sel.style.width = Math.max(20, w) + "px"; // Minimální šířka 20px
        sel.style.height = Math.max(20, h) + "px"; // Minimální výška 20px
        generateCommand();
    }
};

document.onmouseup = () => { dragging = false; resizing = false; generateCommand(); };

// Výpočet bitratu s 20% slevou (0.80) pro HEVC
function formatBitrate(rawValue) {
    const bps = parseInt(rawValue, 10);
    if (isNaN(bps) || rawValue.toLowerCase().includes('k')) return rawValue; 
    
    const hevcBps = bps * 0.80; // 20% úspora
    return Math.round(hevcBps / 1000) + "k";
}

// Sanitizace vstupů pro terminál (ochrana proti uvozovkám)
function sanitizePath(str) {
    return str.replace(/"/g, '\\"');
}

// Bezpečné spojení názvu a koncovky (zabraňuje .mkv.mkv)
function getSafeFileName(inputId, extId) {
    let name = document.getElementById(inputId).value.trim();
    const ext = document.getElementById(extId).value;
    
    // Pokud uživatel omylem vložil i koncovku (smaže .mkv, .mp4, .mov, .avi, .webm na konci stringu)
    name = name.replace(/\.(mkv|mp4|mov|avi|webm)$/i, "");
    
    return sanitizePath(name + ext);
}

// Generování příkazu
function generateCommand(){
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    
    // Čekáme na načtení obrázku
    if (stageW === 0 || stageH === 0) return;

    const videoW = parseInt(document.getElementById("videoWidth").value) || 1920;
    const videoH = parseInt(document.getElementById("videoHeight").value) || 1080;

    let x = Math.round(parseFloat(sel.style.left)/stageW * videoW);
    let y = Math.round(parseFloat(sel.style.top)/stageH * videoH);
    let w = Math.round(parseFloat(sel.style.width)/stageW * videoW);
    let h = Math.round(parseFloat(sel.style.height)/stageH * videoH);

    // Všechna čísla musí být sudá (YUV 4:2:0 kompatibilita)
    x = x % 2 !== 0 ? x + 1 : x;
    y = y % 2 !== 0 ? y + 1 : y;
    w = w % 2 !== 0 ? w + 1 : w;
    h = h % 2 !== 0 ? h + 1 : h;

    const radius = parseInt(document.getElementById("blurRadius").value) || 13;
    // Použití naší nové funkce pro bezpečné složení názvu
    const videoName = getSafeFileName("videoName", "videoExt");
    const outputName = getSafeFileName("outputName", "outputExt");
    const bitrate = formatBitrate(document.getElementById("targetBitrate").value); 

    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream_tags=BPS -of default=noprint_wrappers=1:nokey=1 "${videoName}"`;
    document.getElementById("probeCommand").value = probeCmd;

    const cmd = `ffmpeg -i "${videoName}" -filter_complex "[0:v]crop=${w}:${h}:${x}:${y},boxblur=${radius}:1[blur];[0:v][blur]overlay=${x}:${y},format=yuv420p[vout]" -map "[vout]" -map 0:a -c:v hevc_videotoolbox -b:v ${bitrate} -c:a copy "${outputName}"`;
    
    document.getElementById("output").value = cmd;
}

// Listenery pro real-time aktualizaci (přidány videoExt a outputExt)
const inputs = ["targetBitrate", "videoName", "outputName", "videoExt", "outputExt", "videoWidth", "videoHeight", "blurRadius"];
inputs.forEach(id => document.getElementById(id).addEventListener('input', generateCommand));
inputs.forEach(id => document.getElementById(id).addEventListener('input', generateCommand));

// Kopírovací tlačítko
document.getElementById("copyBtn").addEventListener("click", function() {
    const output = document.getElementById("output");
    if(!output.value.startsWith("ffmpeg")) return; 
    
    navigator.clipboard.writeText(output.value); 
    const btn = this;
    btn.innerText = "Zkopírováno!";
    btn.style.background = "#fff";
    setTimeout(() => {
        btn.innerText = "Zkopírovat příkaz";
        btn.style.background = "var(--accent)";
    }, 2000);
});

// Zajištění vygenerování příkazu až po načtení obrázku, aby stage měla správné rozměry
bg.onload = generateCommand;
// Pojistka, pokud už je obrázek v cache
if (bg.complete) {
    generateCommand();
}