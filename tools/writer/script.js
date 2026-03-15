/**
 * Writer App Logic
 * Manages stories, characters, and messages using localStorage/IndexedDB.
 */

class WriterApp {
    constructor() {
        this.DB_STORE = 'writer_data';

        // State
        this.state = {
            stories: [],      // arrays of { id, title, updatedAt }
            characters: {},   // mapped by storyId: [{ id, name, color }]
            messages: {},     // mapped by storyId: [{ id, charId, text, timestamp }]

            activeStoryId: null,
            activeCharacterId: null
        };

        // UI Elements
        this.UI = {
            // Modals
            storyModal: document.getElementById('story-modal'),
            charModal: document.getElementById('character-modal'),

            // Buttons
            btnSettings: document.getElementById('btn-story-settings'),
            btnAddChar: document.getElementById('btn-add-character'),
            btnCloseCharModal: document.getElementById('btn-close-char-modal'),
            btnSaveChar: document.getElementById('btn-save-character'),
            btnCreateStory: document.getElementById('btn-create-story'),
            btnSendMsg: document.getElementById('btn-send-message'),
            btnSendEmote: document.getElementById('btn-send-emote'),
            btnSendAction: document.getElementById('btn-send-action'),
            btnCharColor: document.getElementById('btn-char-color'),
            btnDeleteChar: document.getElementById('btn-delete-char'),
            btnAddAct: document.getElementById('btn-add-act'),
            btnAddScene: document.getElementById('btn-add-scene'),
            btnDeleteStory: document.getElementById('btn-delete-story'),

            // Inputs
            newStoryNameInput: document.getElementById('new-story-name'),
            charNameInput: document.getElementById('char-name'),
            charColorInput: document.getElementById('char-color'),
            hiddenColorPicker: document.getElementById('hidden-color-picker'),
            messageInput: document.getElementById('message-input'),

            // Lists & Containers
            storyList: document.getElementById('story-list'),
            characterList: document.getElementById('character-list'),
            chatMessages: document.getElementById('chat-messages'),

            // Headers/Displays
            storyTitleDisplay: document.getElementById('story-title-display'),
            selectedCharInfo: document.getElementById('selected-character-info'),
            noCharHeader: document.getElementById('no-character-selected-header'),
            chatActions: document.getElementById('chat-actions'),
            headerAvatar: document.getElementById('header-avatar'),
            headerCharName: document.getElementById('header-char-name'),
        };

        this.palette = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f43f5e', '#6366f1', '#84cc16'
        ];

        this.insertIndex = null; // null means append to end

        this.init();
    }

    async init() {
        await this.loadState();
        this.setupEventListeners();

        if (this.state.stories.length === 0) {
            // Force create story if none exists
            this.openStoryModal();
        } else {
            // Check if there's a recently active story we can load
            // For now, load the most recently updated one
            const latestStory = [...this.state.stories].sort((a, b) => b.updatedAt - a.updatedAt)[0];
            this.loadStory(latestStory.id);
        }
    }

    /* --- DATA MANAGEMENT --- */

    async loadState() {
        try {
            const dataStr = localStorage.getItem(this.DB_STORE);
            if (dataStr) {
                const parsed = JSON.parse(dataStr);
                this.state.stories = parsed.stories || [];
                this.state.characters = parsed.characters || {};
                this.state.messages = parsed.messages || {};
            }
        } catch (e) {
            console.error("Failed to load writer data:", e);
        }
    }

    async saveState() {
        try {
            // Shallow clone state to persist
            const toSave = {
                stories: this.state.stories,
                characters: this.state.characters,
                messages: this.state.messages
            };
            localStorage.setItem(this.DB_STORE, JSON.stringify(toSave));
        } catch (e) {
            console.error("Failed to save writer data:", e);
        }
    }

    /* --- EVENT LISTENERS --- */

    setupEventListeners() {
        // Story Management
        this.UI.btnSettings.addEventListener('click', () => this.openStoryModal());
        this.UI.btnCreateStory.addEventListener('click', () => this.createNewStory());
        this.UI.newStoryNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createNewStory();
        });
        if (this.UI.btnDeleteStory) {
            this.UI.btnDeleteStory.addEventListener('click', () => this.deleteStory());
        }

        // Character Management
        this.UI.btnAddChar.addEventListener('click', () => this.openCharModal());
        this.UI.btnCloseCharModal.addEventListener('click', () => this.closeCharModal());
        this.UI.btnSaveChar.addEventListener('click', () => this.saveCharacter());

        // Color Picker (changing selected character color from chat)
        this.UI.btnCharColor.addEventListener('click', () => this.UI.hiddenColorPicker.click());
        this.UI.hiddenColorPicker.addEventListener('change', (e) => this.updateCharacterColor(e.target.value));
        this.UI.btnDeleteChar.addEventListener('click', () => this.deleteCharacter());

        // Messaging & Scene Dividers
        this.UI.btnAddAct.addEventListener('click', () => this.addDivider('act'));
        this.UI.btnAddScene.addEventListener('click', () => this.addDivider('scene'));

        this.UI.messageInput.addEventListener('input', () => this.autoResizeTextarea());
        this.UI.messageInput.addEventListener('keydown', (e) => {
            // Shortcuts
            if (e.ctrlKey) {
                if (e.key.toLowerCase() === 'e') {
                    e.preventDefault();
                    this.sendMessage('action');
                    return;
                }
                if (e.key.toLowerCase() === 'd') {
                    e.preventDefault();
                    this.sendMessage('emote');
                    return;
                }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage('text');
            }
        });
        this.UI.btnSendMsg.addEventListener('click', () => this.sendMessage('text'));
        this.UI.btnSendEmote.addEventListener('click', () => this.sendMessage('emote'));
        this.UI.btnSendAction.addEventListener('click', () => this.sendMessage('action'));
    }

    /* --- STORY METHODS --- */

    openStoryModal() {
        this.renderStoryList();
        this.UI.storyModal.classList.add('active');
    }

    closeStoryModal() {
        this.UI.storyModal.classList.remove('active');
    }

    renderStoryList() {
        this.UI.storyList.innerHTML = '';
        if (this.state.stories.length === 0) {
            this.UI.storyList.innerHTML = '<li class="story-item" style="justify-content: center; color: var(--text-secondary);">Kayıtlı hikaye yok.</li>';
            return;
        }

        // Sort by newest
        const sorted = [...this.state.stories].sort((a, b) => b.updatedAt - a.updatedAt);

        sorted.forEach(story => {
            const li = document.createElement('li');
            li.className = 'story-item';
            const date = new Date(story.updatedAt).toLocaleDateString();
            li.innerHTML = `
                <span class="story-title">${story.title}</span>
                <span class="story-date">${date}</span>
            `;
            li.addEventListener('click', () => {
                this.loadStory(story.id);
                this.closeStoryModal();
            });
            this.UI.storyList.appendChild(li);
        });
    }

    createNewStory() {
        const title = this.UI.newStoryNameInput.value.trim();
        if (!title) return;

        const newStory = {
            id: 'story_' + Date.now(),
            title: title,
            updatedAt: Date.now()
        };

        this.state.stories.push(newStory);
        this.state.characters[newStory.id] = [];
        this.state.messages[newStory.id] = [];

        // Auto-create 'Sahne Ekibi'
        const sahneEkibi = {
            id: 'char_' + Date.now() + '_se',
            name: 'Sahne Ekibi',
            color: '#948a54'
        };
        this.state.characters[newStory.id].push(sahneEkibi);

        this.UI.newStoryNameInput.value = '';
        this.saveState();

        this.loadStory(newStory.id);
        this.closeStoryModal();
    }

    loadStory(storyId) {
        const story = this.state.stories.find(s => s.id === storyId);
        if (!story) return;

        this.state.activeStoryId = storyId;
        this.state.activeCharacterId = null; // reset active character

        this.UI.storyTitleDisplay.textContent = story.title;
        if (this.UI.btnDeleteStory) this.UI.btnDeleteStory.style.display = 'block';

        this.renderCharacterList();
        this.renderChatMessages();
        this.updateChatHeader();
        this.updateMessageInputState();
    }

    deleteStory() {
        if (!this.state.activeStoryId) return;

        const story = this.state.stories.find(s => s.id === this.state.activeStoryId);

        this.showDialog({
            title: 'Hikayeyi Sil',
            message: `"${story.title}" senaryosunu tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`,
            type: 'confirm',
            onConfirm: () => {
                // Remove from state
                this.state.stories = this.state.stories.filter(s => s.id !== this.state.activeStoryId);
                delete this.state.characters[this.state.activeStoryId];
                delete this.state.messages[this.state.activeStoryId];

                this.state.activeStoryId = null;
                this.state.activeCharacterId = null;
                this.UI.storyTitleDisplay.textContent = 'Hikaye Seçilmedi';
                if (this.UI.btnDeleteStory) this.UI.btnDeleteStory.style.display = 'none';

                this.saveState();

                this.renderCharacterList();
                this.updateChatHeader();
                this.renderChatMessages();
                this.updateMessageInputState();

                // If no stories left, prompt to create one
                if (this.state.stories.length === 0) {
                    this.openStoryModal();
                } else {
                    // Load the next available story
                    const latestStory = [...this.state.stories].sort((a, b) => b.updatedAt - a.updatedAt)[0];
                    this.loadStory(latestStory.id);
                }
            }
        });
    }


    /* --- CHARACTER METHODS --- */

    openCharModal() {
        if (!this.state.activeStoryId) {
            alert('Lütfen önce bir hikaye seçin veya oluşturun.');
            return;
        }
        this.UI.charNameInput.value = '';

        // Find first unused color
        const usedColors = (this.state.characters[this.state.activeStoryId] || []).map(c => c.color.toLowerCase());
        let nextColor = this.palette.find(c => !usedColors.includes(c));
        if (!nextColor) {
            // Fallback to random if all palette colors are used
            nextColor = this.palette[Math.floor(Math.random() * this.palette.length)];
        }

        this.UI.charColorInput.value = nextColor;
        this.UI.charModal.classList.add('active');
        setTimeout(() => this.UI.charNameInput.focus(), 100);
    }

    closeCharModal() {
        this.UI.charModal.classList.remove('active');
    }

    saveCharacter() {
        const name = this.UI.charNameInput.value.trim();
        const color = this.UI.charColorInput.value;

        if (!name) return;

        const newChar = {
            id: 'char_' + Date.now(),
            name: name,
            color: color
        };

        const storyChars = this.state.characters[this.state.activeStoryId] || [];
        storyChars.push(newChar);
        this.state.characters[this.state.activeStoryId] = storyChars;

        this.saveState();
        this.closeCharModal();
        this.renderCharacterList();

        // Auto-select newly created character
        this.selectCharacter(newChar.id);
    }

    renderCharacterList() {
        this.UI.characterList.innerHTML = '';
        const chars = this.state.characters[this.state.activeStoryId] || [];

        chars.forEach(char => {
            const li = document.createElement('li');
            li.className = `character-item ${this.state.activeCharacterId === char.id ? 'active' : ''}`;

            // Generate initials
            const initial = char.name.charAt(0).toUpperCase();

            li.innerHTML = `
                <div class="avatar" style="--char-color: ${char.color};">${initial}</div>
                <div class="character-info">
                    <div class="character-name">${char.name}</div>
                    <div class="character-preview">Replik yazmak için seç...</div>
                </div>
            `;

            li.addEventListener('click', () => this.selectCharacter(char.id));
            this.UI.characterList.appendChild(li);
        });
    }

    selectCharacter(charId) {
        this.state.activeCharacterId = charId;
        this.renderCharacterList(); // re-render to update 'active' class
        this.updateChatHeader();
        this.updateMessageInputState();
        this.UI.messageInput.focus();
    }

    updateCharacterColor(newColor) {
        if (!this.state.activeCharacterId || !this.state.activeStoryId) return;

        const chars = this.state.characters[this.state.activeStoryId];
        const charIndex = chars.findIndex(c => c.id === this.state.activeCharacterId);

        if (charIndex !== -1) {
            chars[charIndex].color = newColor;
            this.saveState();

            // Re-render UI
            this.renderCharacterList();
            this.updateChatHeader();
            this.renderChatMessages(); // update bubble colors dynamically
        }
    }

    deleteCharacter() {
        if (!this.state.activeCharacterId || !this.state.activeStoryId) return;

        const chars = this.state.characters[this.state.activeStoryId];
        const char = chars.find(c => c.id === this.state.activeCharacterId);

        this.showDialog({
            title: 'Karakteri Sil',
            message: `"${char.name}" karakterini silmek istediğinize emin misiniz? (Repliklerin de silinmesini istiyorsanız aşağıdaki kutucuğu işaretleyin)`,
            type: 'confirm',
            checkboxLabel: 'Karakterin tüm metinleri/replikleri de silinsin',
            onConfirm: (val, isChecked) => {
                // Remove character
                this.state.characters[this.state.activeStoryId] = chars.filter(c => c.id !== this.state.activeCharacterId);

                // Remove messages if checked
                if (isChecked) {
                    const messages = this.state.messages[this.state.activeStoryId] || [];
                    this.state.messages[this.state.activeStoryId] = messages.filter(m => m.charId !== this.state.activeCharacterId);

                    // Reset insert cursor to avoid bounds issues
                    this.insertIndex = null;
                }

                this.state.activeCharacterId = null;

                this.saveState();
                this.renderCharacterList();
                this.updateChatHeader();
                this.updateMessageInputState();
                this.renderChatMessages();
            }
        });
    }

    /* --- CHAT METHODS --- */

    updateChatHeader() {
        if (!this.state.activeCharacterId) {
            this.UI.selectedCharInfo.style.display = 'none';
            this.UI.chatActions.style.display = 'none';
            this.UI.noCharHeader.style.display = 'block';
            return;
        }

        const char = this.state.characters[this.state.activeStoryId].find(c => c.id === this.state.activeCharacterId);
        if (char) {
            this.UI.selectedCharInfo.style.display = 'flex';
            this.UI.chatActions.style.display = 'flex';
            this.UI.noCharHeader.style.display = 'none';

            this.UI.headerAvatar.style.setProperty('--char-color', char.color);
            this.UI.headerAvatar.textContent = char.name.charAt(0).toUpperCase();
            this.UI.headerCharName.textContent = char.name;

            // Sync hidden color picker with current color
            this.UI.hiddenColorPicker.value = char.color;
        }
    }

    updateMessageInputState() {
        const isActive = !!this.state.activeCharacterId;
        this.UI.messageInput.disabled = !isActive;
        this.UI.btnSendMsg.disabled = !isActive;
        this.UI.btnSendEmote.disabled = !isActive;
        this.UI.btnSendAction.disabled = !isActive;

        if (isActive) {
            const char = this.state.characters[this.state.activeStoryId].find(c => c.id === this.state.activeCharacterId);
            this.UI.messageInput.placeholder = `${char ? char.name : 'Silinmiş Karakter'} olarak konuş...`;
        } else {
            this.UI.messageInput.placeholder = 'Replik yazmak için bir karakter seçin...';
            this.UI.messageInput.value = '';
        }
    }

    autoResizeTextarea() {
        const ta = this.UI.messageInput;
        const hasText = ta.value.trim() !== '';
        this.UI.btnSendMsg.disabled = !hasText;
        this.UI.btnSendEmote.disabled = !hasText;
        this.UI.btnSendAction.disabled = !hasText;

        // Reset height to auto to recalculate properly
        ta.style.height = 'auto';
        // Set to scrollHeight up to max-height defined in CSS
        ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    }

    addDivider(type) {
        if (!this.state.activeStoryId) return;

        const typeName = type === 'act' ? 'Perde' : 'Sahne';

        this.showDialog({
            title: `Yeni ${typeName} Ekle`,
            message: `${typeName} Adı veya Numarası (Örn: 1, 2, "Giriş"):`,
            type: 'prompt',
            onConfirm: (name) => {
                if (!name || name.trim() === '') return;

                const newMessage = {
                    id: 'div_' + Date.now(),
                    type: 'divider',
                    dividerType: type, // 'act' or 'scene'
                    text: `${typeName} ${name}`.trim(),
                    timestamp: Date.now()
                };

                this.insertMessageIntoState(newMessage);
            }
        });
    }

    sendMessage(msgType) {
        // msgType can be 'text', 'emote', 'action'
        if (!this.state.activeCharacterId || !this.state.activeStoryId) return;

        let text = this.UI.messageInput.value.trim();
        if (!text) return;

        // Note: For 'emote' and 'action' types from buttons, we DO NOT add raw brackets anymore.
        // The UI handles styling them correctly based on the message type.
        // We only parse raw brackets via parseInlineFormatting for 'text' type messages.

        const newMessage = {
            id: 'msg_' + Date.now(),
            type: msgType,
            charId: this.state.activeCharacterId,
            text: text,
            timestamp: Date.now()
        };

        this.insertMessageIntoState(newMessage);

        // Reset input
        this.UI.messageInput.value = '';
        this.UI.messageInput.style.height = 'auto'; // reset height
        this.UI.btnSendMsg.disabled = true;
        this.UI.btnSendEmote.disabled = true;
        this.UI.btnSendAction.disabled = true;
        this.UI.messageInput.focus();
    }

    insertMessageIntoState(message) {
        const storyMessages = this.state.messages[this.state.activeStoryId] || [];

        if (this.insertIndex !== null && this.insertIndex >= 0 && this.insertIndex <= storyMessages.length) {
            storyMessages.splice(this.insertIndex, 0, message);
            this.insertIndex++; // Move cursor down automatically
        } else {
            storyMessages.push(message);
        }

        this.state.messages[this.state.activeStoryId] = storyMessages;

        // Update story timestamp
        const story = this.state.stories.find(s => s.id === this.state.activeStoryId);
        if (story) story.updatedAt = Date.now();

        this.saveState();
        this.renderChatMessages();
    }

    renderChatMessages() {
        const container = this.UI.chatMessages;
        container.innerHTML = '';

        const messages = this.state.messages[this.state.activeStoryId] || [];
        const chars = this.state.characters[this.state.activeStoryId] || [];

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-masks-theater"></i></div>
                    <h2>Senaryo Oluşturucuya Hoş Geldiniz</h2>
                    <p>Soldan bir karakter seçin ve repliklerini yazmaya başlayın. Gönderdiğiniz mesajlar tıpkı bir sohbet uygulaması gibi senaryoya eklenecektir.</p>
                </div>
            `;
            // Option to insert here
            if (this.insertIndex === 0) {
                container.insertAdjacentHTML('beforeend', `<div class="insert-point"></div>`);
            }
            return;
        }

        let prevCharId = null;
        let prevType = null;

        messages.forEach((msg, index) => {
            // Render insert point if cursor is here
            if (this.insertIndex === index) {
                container.insertAdjacentHTML('beforeend', `<div class="insert-point" title="Yeni replikler buraya eklenecek"></div>`);
                prevCharId = null; // Reset grouping after insert point
            }

            if (msg.type === 'divider') {
                const divClass = msg.dividerType === 'act' ? 'act-divider' : 'scene-divider';
                const msgHtml = `
                    <div class="script-divider ${divClass}" data-id="${msg.id}">
                        <div class="divider-text">${this.escapeHtml(msg.text)}</div>
                        <div class="message-actions">
                            <button class="message-action-btn" onclick="window.writerApp.editMessage('${msg.id}')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
                            <button class="message-action-btn danger" onclick="window.writerApp.deleteMessage('${msg.id}')" title="Sil"><i class="fa-solid fa-trash"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.moveMessage('${msg.id}', -1)" title="Yukarı Taşı"><i class="fa-solid fa-arrow-up"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.moveMessage('${msg.id}', 1)" title="Aşağı Taşı"><i class="fa-solid fa-arrow-down"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.setInsertPoint(${index})" title="İmleci Buraya Getir"><i class="fa-solid fa-i-cursor"></i></button>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', msgHtml);
                prevCharId = null; // Reset grouping after divider
                return;
            }

            // It's a character message
            const char = chars.find(c => c.id === msg.charId) || { name: 'Silinmiş Karakter', color: '#888' };
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Group if previous message was from same character (regardless of type)
            const isConsecutive = (prevCharId === msg.charId);
            const groupClass = isConsecutive ? 'message-group consecutive' : 'message-group';

            // Type classes
            let typeClass = '';
            let formattedText = this.escapeHtml(msg.text);

            if (msg.type === 'emote') {
                typeClass = 'message-type-emote';
                formattedText = `(${formattedText})`; // wrap in brackets purely for UI if needed, user said no brackets if sent via button, but actually "zaman o zaman mesaj görünümünde parantez ve köşeli paranteze gerek yok yazı formatı"
                // Let's NOT wrap in brackets if sent explicitly via type.
                formattedText = this.escapeHtml(msg.text); // keep it clean
            } else if (msg.type === 'action') {
                typeClass = 'message-type-action';
                formattedText = this.escapeHtml(msg.text);
            } else {
                // If it's pure text, parse for inline actions/emotes
                formattedText = this.parseInlineFormatting(formattedText, char.color);
            }

            const msgHtml = `
                <div class="${groupClass} ${typeClass}" data-id="${msg.id}">
                    <div class="message-wrapper">
                        <div class="message-bubble" style="--char-color: ${char.color};">
                            <div class="message-sender-name">${char.name}</div>
                            <div class="message-text">${formattedText}</div>
                            <div class="message-time">${timeStr}</div>
                        </div>
                        <div class="message-actions">
                            <button class="message-action-btn" onclick="window.writerApp.editMessage('${msg.id}')" title="Düzenle"><i class="fa-solid fa-pen"></i></button>
                            <button class="message-action-btn danger" onclick="window.writerApp.deleteMessage('${msg.id}')" title="Sil"><i class="fa-solid fa-trash"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.moveMessage('${msg.id}', -1)" title="Yukarı Taşı"><i class="fa-solid fa-arrow-up"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.moveMessage('${msg.id}', 1)" title="Aşağı Taşı"><i class="fa-solid fa-arrow-down"></i></button>
                            <button class="message-action-btn" onclick="window.writerApp.setInsertPoint(${index})" title="İmleci Buraya Getir"><i class="fa-solid fa-i-cursor"></i></button>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', msgHtml);

            prevCharId = msg.charId;
            prevType = msg.type;
        });

        // If insertIndex is at the very end
        if (this.insertIndex === messages.length) {
            container.insertAdjacentHTML('beforeend', `<div class="insert-point" title="Yeni replikler buraya eklenecek"></div>`);
        }

        // Scroll to bottom only if we don't have an active insert cursor, or scroll to cursor
        if (this.insertIndex === null || this.insertIndex === messages.length) {
            container.scrollTop = container.scrollHeight;
        }
    }

    setInsertPoint(index) {
        if (!this.state.activeStoryId) return;
        const messages = this.state.messages[this.state.activeStoryId] || [];

        // If clicking the same point, toggle it off (set to end)
        if (this.insertIndex === index) {
            this.insertIndex = null;
        } else {
            this.insertIndex = index;
        }
        this.renderChatMessages();
    }

    editMessage(msgId) {
        if (!this.state.activeStoryId) return;
        const messages = this.state.messages[this.state.activeStoryId] || [];
        const msgIndex = messages.findIndex(m => m.id === msgId);

        if (msgIndex === -1) return;
        const msg = messages[msgIndex];

        let titleStr = msg.type === 'divider' ? 'Sahne/Perde Başlığını Düzenle' : 'Repliği Düzenle';
        let msgStr = msg.type === 'divider' ? 'Yeni başlığı girin:' : 'Yeni replik metnini girin:';

        this.showDialog({
            title: titleStr,
            message: msgStr,
            type: 'prompt',
            defaultValue: msg.text,
            onConfirm: (newText) => {
                if (!newText || newText.trim() === '') return;

                messages[msgIndex].text = newText.trim();
                this.saveState();
                this.renderChatMessages();
            }
        });
    }

    deleteMessage(msgId) {
        if (!this.state.activeStoryId) return;

        const messages = this.state.messages[this.state.activeStoryId] || [];
        const msgIndex = messages.findIndex(m => m.id === msgId);
        if (msgIndex === -1) return;

        this.showDialog({
            title: 'Mesajı Sil',
            message: 'Bu mesajı/bölümü silmek istediğinize emin misiniz?',
            type: 'confirm',
            onConfirm: () => {
                messages.splice(msgIndex, 1);

                // Adjust insert cursor if needed
                if (this.insertIndex !== null && this.insertIndex > msgIndex) {
                    this.insertIndex--;
                }

                this.saveState();
                this.renderChatMessages();
            }
        });
    }

    moveMessage(msgId, direction) {
        if (!this.state.activeStoryId) return;
        const messages = this.state.messages[this.state.activeStoryId] || [];
        const msgIndex = messages.findIndex(m => m.id === msgId);

        if (msgIndex === -1) return;

        const targetIndex = msgIndex + direction;
        // Check bounds
        if (targetIndex < 0 || targetIndex >= messages.length) return;

        // Swap
        const temp = messages[msgIndex];
        messages[msgIndex] = messages[targetIndex];
        messages[targetIndex] = temp;

        // Reset insert cursor to avoid confusion when moving things around
        this.insertIndex = null;

        this.saveState();
        this.renderChatMessages();
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    parseInlineFormatting(text, color) {
        // Convert (text) to <span class="inline-emote" style="--char-color: color">(text)</span>
        let result = text.replace(/\(([^)]+)\)/g, `<span class="inline-emote" style="--char-color: ${color}">($1)</span>`);

        // Convert [text] to <span class="inline-action" style="--char-color: color">[text]</span>
        result = result.replace(/\[([^\]]+)\]/g, `<span class="inline-action" style="--char-color: ${color}">[$1]</span>`);

        return result;
    }

    showDialog(options) {
        // options: { title, message, type: 'confirm'|'prompt'|'alert', defaultValue: '', checkboxLabel: '', onConfirm: (val, isChecked) => {}, onCancel: () => {} }
        const modal = document.getElementById('dialog-modal');
        const titleEl = document.getElementById('dialog-title');
        const messageEl = document.getElementById('dialog-message');

        const inputGroup = document.getElementById('dialog-input-group');
        const inputEl = document.getElementById('dialog-input');

        const checkboxGroup = document.getElementById('dialog-checkbox-group');
        const checkboxEl = document.getElementById('dialog-checkbox');
        const checkboxLabelEl = document.getElementById('dialog-checkbox-label');

        const btnConfirm = document.getElementById('btn-dialog-confirm');
        const btnCancel = document.getElementById('btn-dialog-cancel');
        const btnClose = document.getElementById('btn-close-dialog');

        titleEl.textContent = options.title || 'Uyarı';
        messageEl.textContent = options.message || '';

        if (options.type === 'prompt') {
            inputGroup.style.display = 'block';
            inputEl.value = options.defaultValue || '';
        } else {
            inputGroup.style.display = 'none';
        }

        if (options.checkboxLabel) {
            checkboxGroup.style.display = 'block';
            checkboxLabelEl.textContent = options.checkboxLabel;
            checkboxEl.checked = false; // default unchecked
        } else {
            checkboxGroup.style.display = 'none';
        }

        if (options.type === 'alert') {
            btnCancel.style.display = 'none';
        } else {
            btnCancel.style.display = 'block';
        }

        modal.classList.add('active');
        if (options.type === 'prompt') {
            setTimeout(() => inputEl.focus(), 100);
        }

        // Clean event listeners by replacing nodes
        const newBtnConfirm = btnConfirm.cloneNode(true);
        const newBtnCancel = btnCancel.cloneNode(true);
        const newBtnClose = btnClose.cloneNode(true);
        btnConfirm.replaceWith(newBtnConfirm);
        btnCancel.replaceWith(newBtnCancel);
        btnClose.replaceWith(newBtnClose);

        const cleanup = () => {
            modal.classList.remove('active');
            inputEl.onkeydown = null;
        };

        const handleConfirm = () => {
            const val = options.type === 'prompt' ? inputEl.value : true;
            const isChecked = checkboxGroup.style.display !== 'none' ? checkboxEl.checked : false;
            cleanup();
            if (options.onConfirm) options.onConfirm(val, isChecked);
        };

        const handleCancel = () => {
            cleanup();
            if (options.onCancel) options.onCancel();
        };

        newBtnConfirm.addEventListener('click', handleConfirm);
        newBtnCancel.addEventListener('click', handleCancel);
        newBtnClose.addEventListener('click', handleCancel);

        if (options.type === 'prompt') {
            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') handleConfirm();
                if (e.key === 'Escape') handleCancel();
            };
        }
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.writerApp = new WriterApp();
});
