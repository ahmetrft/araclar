/**
 * DrumPad Audio Engine & UI Controller
 * Implements SFX pads, Background Radio, and Ducking logic via Web Audio API.
 */

class AudioEngine {
    constructor() {
        // We use the AudioContext to handle SFX routing and Ducking logic.
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();

        // Volumes
        this.sfxBaseVolume = 1.0;
        this.bgBaseVolume = 0.6;
        this.duckedVolume = 0.1;

        // Fades
        this.duckingFadeSeconds = 0.5;
        this.fonFadeSeconds = 3.0;

        // Gain Nodes setup
        // SFX Path: Source -> sfxGain -> Destination
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxBaseVolume;
        this.sfxGain.connect(this.ctx.destination);

        // BG Path: HTMLAudioElement -> bgSource -> bgGain -> Destination
        this.bgGain = this.ctx.createGain();
        this.bgGain.gain.value = this.bgBaseVolume;
        this.bgGain.connect(this.ctx.destination);

        // Audio Element for the radio
        this.bgAudioElement = document.getElementById('bg-audio-element');
        this.bgAudioElement.crossOrigin = "anonymous";
        // Route audio element into Web Audio API graph
        this.bgSourceNode = this.ctx.createMediaElementSource(this.bgAudioElement);
        this.bgSourceNode.connect(this.bgGain);

        // State variables
        this.radioEnabled = false;
        this.bgPlaylist = []; // Array of File objects
        this.bgIndex = 0;

        // Single SFX constraint: 
        // Emulating desktop behavior: only 1 SFX plays at a time (stops previous).
        this.currentSfxBufferSource = null;

        // Loop the Fon track automatically
        this.bgAudioElement.loop = true;
    }

    // ----------------------------------------------------
    // Volume & Ducking Control
    // ----------------------------------------------------

    setSfxVolume(vol) {
        this.sfxBaseVolume = Math.max(0, Math.min(1, vol));
        this.sfxGain.gain.setValueAtTime(this.sfxBaseVolume, this.ctx.currentTime);
    }

    setBgVolume(vol) {
        this.bgBaseVolume = Math.max(0, Math.min(1, vol));
        // Only override if not currently ducked
        if (this._isDucking) return;

        // Use exponential approach or linear. linearRamp allows for direct smoothing.
        this.bgGain.gain.linearRampToValueAtTime(
            this.bgBaseVolume,
            this.ctx.currentTime + this.duckingFadeSeconds
        );
    }

    setDuckLevel(vol) {
        this.duckedVolume = Math.max(0, Math.min(1, vol));
    }

    setFadeSeconds(sec) {
        this.duckingFadeSeconds = Math.max(0, parseFloat(sec));
    }

    setFonFadeSeconds(sec) {
        this.fonFadeSeconds = Math.max(0, parseFloat(sec));
    }

    duckBackground() {
        if (!this.radioEnabled || this.bgAudioElement.paused) return;
        this._isDucking = true;

        // Cancel any scheduled future changes
        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgGain.gain.setValueAtTime(this.bgGain.gain.value, this.ctx.currentTime);

        // Ramp down smoothly over duckFade
        const duckDuration = Math.max(0.01, this.duckingFadeSeconds);
        this.bgGain.gain.linearRampToValueAtTime(
            this.duckedVolume,
            this.ctx.currentTime + duckDuration
        );
    }

    unduckBackground() {
        if (!this.radioEnabled) return;
        this._isDucking = false;

        // Turn volume back up to baseline
        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgGain.gain.setValueAtTime(this.bgGain.gain.value, this.ctx.currentTime);

        const unduckDuration = Math.max(0.01, this.duckingFadeSeconds);
        this.bgGain.gain.linearRampToValueAtTime(
            this.bgBaseVolume,
            this.ctx.currentTime + unduckDuration
        );
    }

    // ----------------------------------------------------
    // Pads / SFX Control
    // ----------------------------------------------------

    /**
     * Decode file data to an AudioBuffer
     */
    async loadAudioBuffer(file) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    /**
     * Play an in-memory AudioBuffer
     */
    playPad(audioBuffer) {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume(); // Autoplay policy workarounds
        }

        // Apply Ducking
        this.duckBackground();

        // Emulating desktop behavior: stop currently playing SFX
        if (this.currentSfxBufferSource) {
            try {
                // If it's already ended, this is safe. 
                // We clear the onended callback first so it doesn't trigger unduck prematurely.
                this.currentSfxBufferSource.onended = null;
                this.currentSfxBufferSource.stop();
            } catch (e) {
                // Ignore DOM exception if already stopped
            }
        }

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.sfxGain);

        // Unduck when this SFX is completely done (and if it's still the active one)
        source.onended = () => {
            if (this.currentSfxBufferSource === source) {
                this.unduckBackground();
                this.currentSfxBufferSource = null;
            }
        };

        this.currentSfxBufferSource = source;
        source.start(0);
    }

    stopSfx() {
        if (this.currentSfxBufferSource) {
            this.currentSfxBufferSource.onended = null;
            try { this.currentSfxBufferSource.stop(); } catch (e) { }
            this.currentSfxBufferSource = null;
            this.unduckBackground(); // immediately clear ducking if stopped early
        }
    }

    // ----------------------------------------------------
    // Background / Fon Control
    // ----------------------------------------------------

    setBgFile(file) {
        this.bgFile = file;
    }

    playBg(startSilenced = false) {
        if (!this.bgFile) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        this.radioEnabled = true;

        // Clean up previous blob URL
        if (this.bgAudioElement.src && !this.bgAudioElement.src.startsWith('blob:') && this.bgAudioElement.src !== "") {
            // Means we already have an object URL set up
        } else if (!this.bgAudioElement.src || this.bgAudioElement.src === "" || this.bgFile !== this._lastBgFile) {
            if (this.bgAudioElement.src.startsWith('blob:')) {
                URL.revokeObjectURL(this.bgAudioElement.src);
            }
            const url = URL.createObjectURL(this.bgFile);
            this.bgAudioElement.src = url;
            this._lastBgFile = this.bgFile;
        }

        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);
        if (startSilenced) {
            this.bgGain.gain.setValueAtTime(0, this.ctx.currentTime);
        } else {
            this.bgGain.gain.setValueAtTime(this.bgBaseVolume, this.ctx.currentTime);
        }

        this.bgAudioElement.play().catch(err => {
            console.error("Autoplay prevented or unsupported file format", err);
        });

        document.dispatchEvent(new CustomEvent('bg-track-changed', {
            detail: { file: this.bgFile, isPlaying: true }
        }));
    }

    stopBg() {
        this.radioEnabled = false;
        this.bgAudioElement.pause();
        // Do NOT reset currentTime to allow resume functionality.
    }

    resetBg() {
        this.radioEnabled = false;
        this.bgAudioElement.pause();
        this.bgAudioElement.currentTime = 0;
        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.bgGain.gain.setValueAtTime(this.bgBaseVolume, this.ctx.currentTime);
    }

    manualFadeIn() {
        if (!this.bgFile || this._isDucking) return;

        let wasPaused = this.bgAudioElement.paused;

        // Provide seamless resume mechanism
        if (wasPaused) {
            this.playBg(true); // start silenced
        }

        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);

        // Start from current value or 0
        const currentVal = wasPaused ? 0 : this.bgGain.gain.value;
        this.bgGain.gain.setValueAtTime(currentVal, this.ctx.currentTime);

        const fadeDur = Math.max(0.01, this.fonFadeSeconds);
        this.bgGain.gain.linearRampToValueAtTime(
            this.bgBaseVolume,
            this.ctx.currentTime + fadeDur
        );
    }

    manualFadeOut() {
        if (!this.radioEnabled || this.bgAudioElement.paused || this._isDucking) return;
        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);

        const currentVal = this.bgGain.gain.value;
        this.bgGain.gain.setValueAtTime(currentVal, this.ctx.currentTime);

        const fadeDur = Math.max(0.01, this.fonFadeSeconds);
        this.bgGain.gain.linearRampToValueAtTime(
            0,
            this.ctx.currentTime + fadeDur
        );
        // Note: We leave it silently playing, we do NOT call .pause()
    }

    panicStop() {
        // Halt SFX
        if (this.currentSfxBufferSource) {
            this.currentSfxBufferSource.onended = null;
            try { this.currentSfxBufferSource.stop(); } catch (e) { }
            this.currentSfxBufferSource = null;
        }

        // Halt Background
        this.radioEnabled = false;
        this.bgAudioElement.pause();
        this.bgAudioElement.currentTime = 0;

        // Cancel all gain changes instantly
        this.bgGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.sfxGain.gain.cancelScheduledValues(this.ctx.currentTime);

        this.bgGain.gain.setValueAtTime(this.bgBaseVolume, this.ctx.currentTime);
        this._isDucking = false;
    }
}


// --------------------------------------------------------------------------------------
// Application Controller (UI Bindings)
// --------------------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const engine = new AudioEngine();
    let loadedPads = []; // Array of objects: { file, audioBuffer, element }

    // -- App State Elements --
    const padGrid = document.getElementById('pad-grid');
    const emptyState = document.getElementById('empty-state');
    const btnEditMode = document.getElementById('btn-edit-mode');

    let isEditMode = false;

    // -- Modals --
    const modal = document.getElementById('notification-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const btnModalOk = document.getElementById('btn-modal-ok');

    const showModal = (title, message) => {
        modalTitle.innerText = title;
        modalMessage.innerText = message;
        modal.classList.add('visible');
    };

    btnModalOk.addEventListener('click', () => {
        modal.classList.remove('visible');
    });

    // --------------------------------------------------
    // Slider Bindings
    // --------------------------------------------------
    const bindSlider = (idSlider, idVal, isPercent, callback) => {
        const slider = document.getElementById(idSlider);
        const display = document.getElementById(idVal);
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            display.innerText = isPercent ? `${Math.round(val)}%` : `${val.toFixed(1)}s`;

            // Persist setting
            localStorage.setItem(`dp_${idSlider}`, val);

            // Invoke callback depending on type
            if (isPercent) {
                callback(val / 100.0);
            } else {
                callback(val);
            }
        });
    };

    bindSlider('slider-sfx-vol', 'val-sfx-vol', true, (v) => engine.setSfxVolume(v));
    bindSlider('slider-bg-vol', 'val-bg-vol', true, (v) => engine.setBgVolume(v));
    bindSlider('slider-duck', 'val-duck', true, (v) => engine.setDuckLevel(v));
    bindSlider('slider-fade', 'val-fade', false, (v) => engine.setFadeSeconds(v));
    bindSlider('slider-fon-fade', 'val-fon-fade', false, (v) => engine.setFonFadeSeconds(v));


    // --------------------------------------------------
    // Add Pads Logic
    // --------------------------------------------------
    const btnAddPads = document.getElementById('btn-add-files');
    const inputFiles = document.getElementById('input-files');

    btnAddPads.addEventListener('click', () => {
        // Need user interaction to resume audio context if suspended
        if (engine.ctx.state === 'suspended') engine.ctx.resume();
        inputFiles.click();
    });

    const truncateName = (str, max) => str.length > max ? str.substring(0, max) + '...' : str;

    const renderPads = () => {
        padGrid.innerHTML = '';
        if (loadedPads.length === 0) {
            padGrid.appendChild(emptyState);
            emptyState.style.display = 'block';
            ToolboxDB.save('drumpad', 'pads', []); // sync storage
            return;
        }

        ToolboxDB.save('drumpad', 'pads', loadedPads.map(p => p.file)); // sync storage
        emptyState.style.display = 'none';

        loadedPads.forEach((padObj, index) => {
            const btn = document.createElement('button');
            btn.className = 'drum-pad';
            btn.draggable = isEditMode;
            btn.dataset.index = index;

            const cleanName = padObj.file.name.replace(/\.[^/.]+$/, "");
            btn.innerText = truncateName(cleanName, 30);

            // Styling adjustment for edit mode visualization
            if (isEditMode) {
                btn.style.animation = 'pulseGlow 2s infinite alternate';
                btn.style.boxShadow = '0 0 8px rgba(139, 92, 246, 0.4)';
            }

            // Click handling
            btn.addEventListener('pointerdown', (ev) => {
                if (isEditMode) return; // Disallow playback during edit interactions, let default drag hook fire
                ev.preventDefault();

                padObj.pointerDownTimestamp = Date.now();

                document.querySelectorAll('.drum-pad').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                setTimeout(() => btn.classList.remove('active'), 150);

                engine.playPad(padObj.buffer);
            });

            // Drag handling
            btn.addEventListener('dragstart', (e) => {
                if (!isEditMode) {
                    e.preventDefault();
                    return;
                }
                btn.classList.add('dragging');
                e.dataTransfer.setData('text/plain', index);
                e.dataTransfer.effectAllowed = 'move';
            });

            btn.addEventListener('dragend', () => {
                btn.classList.remove('dragging');
            });

            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                btn.style.borderColor = 'var(--accent-primary)';
            });

            btn.addEventListener('dragleave', () => {
                btn.style.borderColor = '';
            });

            btn.addEventListener('drop', (e) => {
                e.preventDefault();
                btn.style.borderColor = '';

                const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const targetIdx = index;

                if (draggedIdx === targetIdx || isNaN(draggedIdx)) return;

                // Swap items
                const draggedItem = loadedPads.splice(draggedIdx, 1)[0];
                loadedPads.splice(targetIdx, 0, draggedItem);

                renderPads();
            });

            padGrid.appendChild(btn);
        });
    }

    btnEditMode.addEventListener('click', () => {
        isEditMode = !isEditMode;
        if (isEditMode) {
            btnEditMode.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Düzenlemeyi Bitir`;
            btnEditMode.style.borderColor = '#8b5cf6';
            btnEditMode.style.color = '#8b5cf6';
        } else {
            btnEditMode.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Padleri Düzenle`;
            btnEditMode.style.borderColor = '';
            btnEditMode.style.color = '';
        }
        renderPads(); // Force re-render of tiles to apply draggable attribute
    });

    inputFiles.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
        if (files.length === 0) return;

        for (const file of files) {
            try {
                const buffer = await engine.loadAudioBuffer(file);
                loadedPads.push({ file, buffer, pointerDownTimestamp: 0 });
            } catch (err) {
                console.error(`Failed to load ${file.name}`, err);
            }
        }

        renderPads();
        inputFiles.value = '';
    });

    const btnClearPads = document.getElementById('btn-clear-pads');
    btnClearPads.addEventListener('click', () => {
        loadedPads = [];
        renderPads();
    });

    document.getElementById('btn-stop-sfx').addEventListener('click', () => {
        engine.stopSfx();
    });

    // --------------------------------------------------
    // Fon File Logic & Manual Fades
    // --------------------------------------------------
    const btnBgFile = document.getElementById('btn-add-bg-file');
    const inputBgFile = document.getElementById('input-bg-file');
    const bgStatusText = document.getElementById('bg-status-text');

    btnBgFile.addEventListener('click', () => inputBgFile.click());

    inputBgFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        engine.setBgFile(file);
        ToolboxDB.save('drumpad', 'bgFile', file); // Sync DB

        const cleanName = file.name.replace(/\.[^/.]+$/, "");

        if (engine.radioEnabled) {
            engine.playBg();
        }

        showModal("Fon Parçası Seçildi", cleanName);
        bgStatusText.innerText = `Hazır: ${truncateName(cleanName, 20)}`;
    });

    document.addEventListener('bg-track-changed', (e) => {
        const name = e.detail.file.name.replace(/\.[^/.]+$/, "");
        bgStatusText.innerText = `Çalıyor: ${truncateName(name, 20)}`;
    });

    // Manual Fade bindings
    document.getElementById('btn-fade-in').addEventListener('click', () => {
        engine.manualFadeIn();
        updateBgToggleUI(true);
    });

    document.getElementById('btn-fade-out').addEventListener('click', () => {
        engine.manualFadeOut();
    });

    // --------------------------------------------------
    // Global Power / Panics
    // --------------------------------------------------
    const btnToggleBg = document.getElementById('btn-toggle-bg');

    const updateBgToggleUI = (isOn) => {
        btnToggleBg.dataset.state = isOn ? "on" : "off";
        btnToggleBg.innerHTML = `
            <span class="status-indicator"></span>
            <span>${isOn ? "AÇIK" : "DURAKLATILDI"}</span>
        `;
    };

    btnToggleBg.addEventListener('click', () => {
        if (!engine.radioEnabled) {
            if (!engine.bgFile) {
                showModal("Uyarı", "Önce bir fon parçası seçin.");
                return;
            }
            engine.playBg();
            updateBgToggleUI(true);
        } else {
            engine.stopBg();
            updateBgToggleUI(false);
            bgStatusText.innerText = `Duraklatıldı`;
        }
    });

    document.getElementById('btn-reset-bg').addEventListener('click', () => {
        engine.resetBg();
        updateBgToggleUI(false);
        btnToggleBg.innerHTML = `
            <span class="status-indicator"></span>
            <span>KAPALI</span>
        `;
        bgStatusText.innerText = "Başa Sarıldı";
    });

    const btnPanic = document.getElementById('btn-panic');
    btnPanic.addEventListener('click', () => {
        engine.panicStop();
        updateBgToggleUI(false);
        bgStatusText.innerText = "Acil Durum Kesintisi";

        // Visual blink effect for the panic
        document.body.style.background = "#450a0a"; // dark red
        setTimeout(() => {
            document.body.style.background = "radial-gradient(circle at 50% 10%, #1e293b 0%, #020617 100%)";
        }, 300);
    });

    document.getElementById('btn-reset-all').addEventListener('click', async () => {
        if (!confirm("Tüm ayarlar ve padler varsayılana sıfırlanacak. Emin misiniz?")) return;

        await ToolboxDB.save('drumpad', 'pads', []);
        await ToolboxDB.save('drumpad', 'bgFile', null);

        const keys = ['slider-sfx-vol', 'slider-bg-vol', 'slider-duck', 'slider-fade', 'slider-fon-fade'];
        keys.forEach(k => localStorage.removeItem(`dp_${k}`));

        location.reload();
    });

    // --------------------------------------------------
    // State Hydration
    // --------------------------------------------------
    const hydrateState = async () => {
        // Sliders
        const restoreSlider = (id, isPercent, defaultVal, callback) => {
            let val = localStorage.getItem(`dp_${id}`);
            if (val !== null) {
                val = parseFloat(val);
                document.getElementById(id).value = val;
                document.getElementById(id.replace('slider-', 'val-')).innerText = isPercent ? `${Math.round(val)}%` : `${val.toFixed(1)}s`;
                callback(isPercent ? val / 100.0 : val);
            }
        };

        restoreSlider('slider-sfx-vol', true, 100, v => engine.setSfxVolume(v));
        restoreSlider('slider-bg-vol', true, 60, v => engine.setBgVolume(v));
        restoreSlider('slider-duck', true, 10, v => engine.setDuckLevel(v));
        restoreSlider('slider-fade', false, 0.5, v => engine.setFadeSeconds(v));
        restoreSlider('slider-fon-fade', false, 3.0, v => engine.setFonFadeSeconds(v));

        // IndexedDB Pads
        const savedPads = await ToolboxDB.load('drumpad', 'pads');
        if (savedPads && savedPads.length > 0) {
            for (const file of savedPads) {
                try {
                    const buffer = await engine.loadAudioBuffer(file);
                    loadedPads.push({ file, buffer, pointerDownTimestamp: 0 });
                } catch (e) {
                    console.error("Failed to restore pad from DB", e);
                }
            }
            renderPads();
        }

        // IndexedDB BgFile
        const savedBg = await ToolboxDB.load('drumpad', 'bgFile');
        if (savedBg) {
            engine.setBgFile(savedBg);
            const cleanName = savedBg.name.replace(/\.[^/.]+$/, "");
            bgStatusText.innerText = `Hazır: ${truncateName(cleanName, 20)}`;
        }
    };

    hydrateState();
});
