/**
 * Music Player Application Logic
 * Standalone Audio Player ignoring DrumPad/Ducking complexities.
 */

class MusicPlayer {
    constructor() {
        this.audio = document.getElementById('audio-player');

        this.playlist = []; // Array of File objects
        this.originalPlaylist = []; // For restoring from shuffle
        this.currentIndex = -1;

        this.isPlaying = false;
        this.isShuffle = false;
        this.loopMode = 0; // 0: off, 1: list, 2: track

        this.setupAudioListeners();
    }

    setupAudioListeners() {
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            document.dispatchEvent(new Event('player-state-changed'));
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            document.dispatchEvent(new Event('player-state-changed'));
        });

        this.audio.addEventListener('timeupdate', () => {
            if (this.audio.currentTime > 0) {
                localStorage.setItem('mp_currentTime', this.audio.currentTime);
            }
            document.dispatchEvent(new Event('player-time-update'));
        });

        this.audio.addEventListener('loadedmetadata', () => {
            document.dispatchEvent(new Event('player-duration-change'));
        });

        this.audio.addEventListener('ended', () => {
            this.handleTrackEnded();
        });
    }

    addFiles(filesArray) {
        if (filesArray.length === 0) return;

        const startWasEmpty = this.playlist.length === 0;

        // Add new files
        this.playlist = this.playlist.concat(filesArray);
        this.originalPlaylist = [...this.playlist];
        ToolboxDB.save('musicplayer', 'playlist', this.originalPlaylist);

        document.dispatchEvent(new Event('playlist-updated'));

        if (startWasEmpty) {
            this.playTrack(0);
        }
    }

    removeTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.playlist.splice(index, 1);

        // Also remove from originalPlaylist so shuffle doesn't bring it back
        // In a real app we'd map this, but for simplicity we'll just rebuild original
        if (this.isShuffle) {
            // Rebuilding it exactly might be tricky if we want to restore order,
            // but we can just filter it out.
            const removedFile = this.playlist[index];
            this.originalPlaylist = this.originalPlaylist.filter(f => f !== removedFile);
        } else {
            this.originalPlaylist.splice(index, 1);
        }

        // Handle playing state
        if (this.playlist.length === 0) {
            this.clearPlaylist();
            return;
        }

        if (index === this.currentIndex) {
            // Track deleted was playing. Play same index (which is now the next track)
            // or 0 if it was the last track.
            const nextIdx = index >= this.playlist.length ? 0 : index;
            this.playTrack(nextIdx);
        } else if (index < this.currentIndex) {
            // Deleting a track BEFORE the current one shifts the index down
            this.currentIndex--;
        }

        ToolboxDB.save('musicplayer', 'playlist', this.originalPlaylist);
        document.dispatchEvent(new Event('playlist-updated'));
    }

    clearPlaylist() {
        this.stop();
        this.playlist = [];
        this.originalPlaylist = [];
        this.currentIndex = -1;
        ToolboxDB.save('musicplayer', 'playlist', []);
        document.dispatchEvent(new Event('playlist-updated'));
    }

    playTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentIndex = index;
        const file = this.playlist[index];
        localStorage.setItem('mp_currentIndex', index);
        localStorage.setItem('mp_currentFilename', file.name);

        // Revoke old blob
        if (this.audio.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.audio.src);
        }

        this.audio.src = URL.createObjectURL(file);
        this.audio.loop = (this.loopMode === 2); // Native HTML5 audio loop for single track
        this.audio.play().catch(e => console.error(e));

        document.dispatchEvent(new Event('track-changed'));
    }

    togglePlayPause() {
        if (this.currentIndex === -1 && this.playlist.length > 0) {
            this.playTrack(0);
            return;
        }

        if (this.isPlaying) {
            this.audio.pause();
        } else {
            this.audio.play().catch(e => console.error(e));
        }
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        document.dispatchEvent(new Event('player-state-changed'));
    }

    next() {
        if (this.playlist.length === 0) return;
        let nextIdx = this.currentIndex + 1;
        if (nextIdx >= this.playlist.length) {
            // Reached end. If loop mode is list (1), wrap around. Otherwise stop.
            if (this.loopMode === 1) {
                nextIdx = 0;
            } else {
                this.stop();
                return;
            }
        }
        this.playTrack(nextIdx);
    }

    previous() {
        if (this.playlist.length === 0) return;
        // If playing for more than 3 seconds, previous just restarts track
        if (this.audio.currentTime > 3) {
            this.audio.currentTime = 0;
            return;
        }

        let prevIdx = this.currentIndex - 1;
        if (prevIdx < 0) {
            prevIdx = (this.loopMode === 1) ? this.playlist.length - 1 : 0;
        }
        this.playTrack(prevIdx);
    }

    handleTrackEnded() {
        // If single song looping is enabled via HTML element
        if (this.audio.loop) return;

        // Play next track naturally
        this.next();
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        localStorage.setItem('mp_isShuffle', this.isShuffle);

        if (this.isShuffle) {
            // Save current playing item to find it back
            const currentItem = this.playlist[this.currentIndex];

            // Fisher-Yates Shuffle
            const array = [...this.playlist];
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            this.playlist = array;

            // Find new index of current playing item
            if (currentItem) {
                this.currentIndex = this.playlist.indexOf(currentItem);
            }
        } else {
            // Restore original order
            const currentItem = this.playlist[this.currentIndex];
            this.playlist = [...this.originalPlaylist];
            if (currentItem) {
                this.currentIndex = this.playlist.indexOf(currentItem);
            }
        }

        document.dispatchEvent(new Event('playlist-updated'));
        document.dispatchEvent(new Event('player-state-changed')); // Sync loops/shuffle UI
    }

    toggleLoop() {
        this.loopMode = (this.loopMode + 1) % 3;
        this.audio.loop = (this.loopMode === 2);
        localStorage.setItem('mp_loopMode', this.loopMode);
        document.dispatchEvent(new Event('player-state-changed'));
    }

    setVolume(pct) {
        this.audio.volume = pct / 100.0;
        localStorage.setItem('mp_volume', pct);
    }

    seek(pct) {
        if (!this.audio.duration) return;
        this.audio.currentTime = this.audio.duration * (pct / 100.0);
    }
}


// -----------------------------------------------------------------------------
// UI Bindings
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    const player = new MusicPlayer();

    // Elements
    const inputFolder = document.getElementById('input-folder');
    const playlistContainer = document.getElementById('playlist-container');

    const uiTitle = document.getElementById('current-title');
    const uiArtist = document.getElementById('current-artist');
    const uiArt = document.getElementById('album-art');

    const btnPlay = document.getElementById('btn-play-pause');
    const btnStop = document.getElementById('btn-stop');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const btnShuffle = document.getElementById('btn-shuffle');
    const btnLoop = document.getElementById('btn-loop');

    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const seekBar = document.getElementById('seek-bar');
    const volumeSlider = document.getElementById('volume-slider');

    const titleWrapper = document.getElementById('title-wrapper');

    // Utility
    const formatTime = (sec) => {
        if (isNaN(sec)) return "0:00";
        const min = Math.floor(sec / 60);
        const rem = Math.floor(sec % 60);
        return `${min}:${rem.toString().padStart(2, '0')}`;
    };

    const cleanTitle = (filename) => filename.replace(/\.[^/.]+$/, "");

    // -------------------------
    // Event Hooks
    // -------------------------

    // Marquee for Now Playing Title
    if (titleWrapper) {
        titleWrapper.addEventListener('mouseenter', () => {
            if (uiTitle.scrollWidth > titleWrapper.clientWidth) {
                const diff = uiTitle.scrollWidth - titleWrapper.clientWidth;
                uiTitle.style.transition = `transform ${Math.max(2000, diff * 30)}ms linear`;
                uiTitle.style.transform = `translateX(-${diff}px)`;
            }
        });
        titleWrapper.addEventListener('mouseleave', () => {
            uiTitle.style.transition = 'transform 0.3s ease-out';
            uiTitle.style.transform = 'translateX(0)';
        });
    }

    // Add Folder
    document.getElementById('btn-add-folder').addEventListener('click', () => {
        inputFolder.click();
    });

    inputFolder.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
        files.sort((a, b) => a.name.localeCompare(b.name));
        player.addFiles(files);
        // Reset input
        inputFolder.value = '';
    });

    // Subscriptions
    document.addEventListener('playlist-updated', () => {
        playlistContainer.innerHTML = '';

        if (player.playlist.length === 0) {
            playlistContainer.innerHTML = '<li class="playlist-empty">Your playlist is currently empty.</li>';
            return;
        }

        player.playlist.forEach((file, idx) => {
            const li = document.createElement('li');
            li.className = 'playlist-item';
            li.draggable = true;
            if (idx === player.currentIndex) li.classList.add('active');

            li.innerHTML = `
                <span class="track-number">${idx + 1}</span>
                <div class="track-name-wrapper">
                    <span class="track-name">${cleanTitle(file.name)}</span>
                </div>
                <button class="btn-delete-track" title="Remove Track" data-idx="${idx}">✕</button>
            `;

            // Hover marquee logic
            li.addEventListener('mouseenter', () => {
                const nameEl = li.querySelector('.track-name');
                const wrapper = li.querySelector('.track-name-wrapper');
                if (nameEl.scrollWidth > wrapper.clientWidth) {
                    const diff = nameEl.scrollWidth - wrapper.clientWidth;
                    nameEl.style.transition = `transform ${Math.max(2000, diff * 30)}ms linear`;
                    nameEl.style.transform = `translateX(-${diff}px)`;
                }
            });

            li.addEventListener('mouseleave', () => {
                const nameEl = li.querySelector('.track-name');
                nameEl.style.transition = 'transform 0.3s ease-out';
                nameEl.style.transform = 'translateX(0)';
            });

            // Click to play
            li.addEventListener('click', (e) => {
                // Ignore clicks on the delete button
                if (e.target.classList.contains('btn-delete-track')) return;
                player.playTrack(idx);
            });

            // Delete functionality
            const deleteBtn = li.querySelector('.btn-delete-track');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                player.removeTrack(idx);
            });

            // Drag and Drop Logic
            li.addEventListener('dragstart', (e) => {
                li.classList.add('dragging');
                e.dataTransfer.setData('text/plain', idx);
                e.dataTransfer.effectAllowed = 'move';
            });

            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
            });

            li.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                li.style.borderColor = 'var(--accent-primary)';
            });

            li.addEventListener('dragleave', () => {
                li.style.borderColor = '';
            });

            li.addEventListener('drop', (e) => {
                e.preventDefault();
                li.style.borderColor = '';

                const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const targetIdx = idx;

                if (draggedIdx === targetIdx || isNaN(draggedIdx)) return;

                // Reorder playlist array
                const draggedItem = player.playlist.splice(draggedIdx, 1)[0];
                player.playlist.splice(targetIdx, 0, draggedItem);

                // Keep track of current index
                if (player.currentIndex === draggedIdx) {
                    player.currentIndex = targetIdx;
                } else if (draggedIdx < player.currentIndex && targetIdx >= player.currentIndex) {
                    player.currentIndex--;
                } else if (draggedIdx > player.currentIndex && targetIdx <= player.currentIndex) {
                    player.currentIndex++;
                }

                // Sync original list if not shuffling
                if (!player.isShuffle) {
                    player.originalPlaylist = [...player.playlist];
                    ToolboxDB.save('musicplayer', 'playlist', player.originalPlaylist);
                }

                document.dispatchEvent(new Event('playlist-updated'));
            });

            playlistContainer.appendChild(li);
        });
    });

    document.addEventListener('track-changed', () => {
        const file = player.playlist[player.currentIndex];

        // Note: For ID3 tags we would need a library like jsmediatags.
        // As we are sticking to vanilla JS, we extrapolate from filename.
        // Assuming format "Artist - Title.mp3"
        let titleName = cleanTitle(file.name);
        let artistName = "Bilinmeyen Sanatçı";
        if (titleName.includes(" - ")) {
            const parts = titleName.split(" - ");
            artistName = parts[0];
            titleName = parts[1];
        }

        uiTitle.innerText = titleName;
        uiTitle.title = titleName; // for tooltip
        uiArtist.innerText = artistName;

        // Force UI refresh of active item in list
        document.dispatchEvent(new Event('playlist-updated'));
    });

    document.addEventListener('player-state-changed', () => {
        if (player.isPlaying) {
            btnPlay.classList.add('playing');
            btnPlay.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            if (uiArt) uiArt.classList.add('spinning');
        } else {
            btnPlay.classList.remove('playing');
            btnPlay.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            if (uiArt) uiArt.classList.remove('spinning');
        }

        btnShuffle.classList.toggle('active', player.isShuffle);

        btnLoop.classList.toggle('active', player.loopMode > 0);
        if (player.loopMode === 2) {
            // Single track loop
            btnLoop.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path><text x="12" y="16" fill="currentColor" stroke="none" font-size="10" text-anchor="middle" font-weight="bold">1</text></svg>';
        } else {
            // List loop or off
            btnLoop.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>';
        }
    });

    let isSeeking = false;

    document.addEventListener('player-time-update', () => {
        if (isSeeking) return;
        const cur = player.audio.currentTime;
        const tot = player.audio.duration;
        timeCurrent.innerText = formatTime(cur);

        if (tot > 0) {
            seekBar.value = (cur / tot) * 100;
        }
    });

    document.addEventListener('player-duration-change', () => {
        timeTotal.innerText = formatTime(player.audio.duration);
    });

    // -------------------------
    // UI Controls
    // -------------------------

    btnPlay.addEventListener('click', () => player.togglePlayPause());
    btnStop.addEventListener('click', () => player.stop());
    btnNext.addEventListener('click', () => player.next());
    btnPrev.addEventListener('click', () => player.previous());

    btnShuffle.addEventListener('click', () => player.toggleShuffle());
    btnLoop.addEventListener('click', () => player.toggleLoop());

    // Seeking
    seekBar.addEventListener('mousedown', () => isSeeking = true);
    seekBar.addEventListener('touchstart', () => isSeeking = true);

    seekBar.addEventListener('change', (e) => {
        isSeeking = false;
        player.seek(e.target.value);
    });

    // Volume
    volumeSlider.addEventListener('input', (e) => {
        player.setVolume(e.target.value);
    });

    document.getElementById('btn-reset-all').addEventListener('click', async () => {
        if (!confirm("Tüm liste ve ayarlar varsayılana sıfırlanacak. Emin misiniz?")) return;

        await ToolboxDB.save('musicplayer', 'playlist', []);

        localStorage.removeItem('mp_isShuffle');
        localStorage.removeItem('mp_loopMode');
        localStorage.removeItem('mp_volume');
        localStorage.removeItem('mp_currentIndex');
        localStorage.removeItem('mp_currentTime');

        location.reload();
    });

    // --------------------------------------------------
    // State Hydration
    // --------------------------------------------------
    const hydrateState = async () => {
        let vol = localStorage.getItem('mp_volume');
        if (vol !== null) {
            volumeSlider.value = vol;
            player.setVolume(vol);
        } else {
            player.setVolume(volumeSlider.value);
        }

        let loop = localStorage.getItem('mp_loopMode');
        if (loop !== null) {
            player.loopMode = parseInt(loop, 10);
            player.audio.loop = (player.loopMode === 2);
        }

        // Restore playlist
        const savedPlaylist = await ToolboxDB.load('musicplayer', 'playlist');
        if (savedPlaylist && savedPlaylist.length > 0) {
            player.originalPlaylist = [...savedPlaylist];
            player.playlist = [...savedPlaylist];

            let shuf = localStorage.getItem('mp_isShuffle');
            if (shuf === 'true') {
                player.isShuffle = false; // toggleShuffle expects it to be opposite
                player.toggleShuffle();
            }

            document.dispatchEvent(new Event('playlist-updated'));

            // Restore last played index & time
            let savedFilename = localStorage.getItem('mp_currentFilename');
            let savedIdx = localStorage.getItem('mp_currentIndex');
            let targetIdx = -1;

            if (savedFilename) {
                targetIdx = player.playlist.findIndex(f => f.name === savedFilename);
            }
            if (targetIdx === -1 && savedIdx !== null) {
                targetIdx = parseInt(savedIdx, 10);
            }

            if (targetIdx >= 0 && targetIdx < player.playlist.length) {
                player.currentIndex = targetIdx;

                const file = player.playlist[player.currentIndex];
                player.audio.src = URL.createObjectURL(file);

                let savedTime = localStorage.getItem('mp_currentTime');
                if (savedTime !== null) {
                    player.audio.addEventListener('loadedmetadata', function onMeta() {
                        player.audio.currentTime = parseFloat(savedTime);
                        player.audio.removeEventListener('loadedmetadata', onMeta);
                    });
                }

                document.dispatchEvent(new Event('track-changed'));
            }
        }

        // Force UI update
        document.dispatchEvent(new Event('player-state-changed'));
    };

    hydrateState();
});
