(() => {
  const showError = (msg) => {
    const box = document.getElementById('bibleNotesError');
    if (!box) return;
    box.textContent = msg;
    box.classList.remove('hidden');
  };

  const clearError = () => {
    const box = document.getElementById('bibleNotesError');
    if (!box) return;
    box.textContent = '';
    box.classList.add('hidden');
  };

  const getSessionUser = () => {
    try {
      return localStorage.getItem('ur_session') || localStorage.getItem('ur_last_user') || 'local';
    } catch (e) {
      return 'local';
    }
  };

  const BibleNotesStore = {
    cache: [],
    loaded: false,

    _getLocalKey() {
      const user = getSessionUser();
      return `bible_notes_${user}`;
    },

    _normalize(str) {
      return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    },

    _parseTags(tagsStr) {
      if (!tagsStr) return [];
      return tagsStr
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12);
    },

    async load(force = false) {
      if (this.loaded && !force) return this.cache;
      try {
        const raw = localStorage.getItem(this._getLocalKey());
        this.cache = raw ? JSON.parse(raw) : [];
        let migrated = false;
        this.cache = (this.cache || []).map((note) => {
          const content = normalizeHighlightTokens(note?.content || '');
          if (content !== String(note?.content || '')) migrated = true;
          return {
            ...note,
            content,
          };
        });
        if (migrated) this._saveLocal();
      } catch (e) {
        this.cache = [];
      }
      this.loaded = true;
      return this.cache;
    },

    _saveLocal() {
      try {
        localStorage.setItem(this._getLocalKey(), JSON.stringify(this.cache || []));
      } catch (e) {
        console.warn('Falha ao salvar notas localmente:', e);
        showError('Não foi possível salvar as anotações. Verifique as permissões do navegador.');
      }
    },

    async add({ reference, content, tags }) {
      const note = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        reference: reference || '',
        content: content || '',
        tags: Array.isArray(tags) ? tags : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.cache.unshift(note);
      this._saveLocal();
      return note;
    },

    async remove(id) {
      this.cache = (this.cache || []).filter((n) => n.id !== id);
      this._saveLocal();
    },

    async update(id, patch) {
      const idx = this.cache.findIndex((n) => n.id === id);
      if (idx === -1) return null;
      this.cache[idx] = {
        ...this.cache[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      this._saveLocal();
      return this.cache[idx];
    },

    async search(query) {
      const notes = await this.load();
      const q = this._normalize(query);
      const tagQuery = q.replace(/^#/, '').replace(/^tags?:/, '').trim();
      const isTagOnly = q.startsWith('#') || q.startsWith('tag:') || q.startsWith('tags:');
      if (!q) return [];
      if (!isTagOnly && q.length < 3) return [];
      const terms = q.split(/\s+/).filter((t) => t.length >= 3);

      return notes
        .filter((n) => {
          const tags = (n.tags || []).map((t) => this._normalize(t));
          if (isTagOnly) {
            if (!tagQuery) return false;
            return tags.some((t) => t.includes(tagQuery));
          }
          const cleanContent = stripHighlightTokens(n.content);
          const hay = this._normalize(`${n.reference} ${cleanContent} ${(n.tags || []).join(' ')}`);
          return terms.some((t) => hay.includes(t));
        })
        .slice(0, 50);
    },
  };

  const escapeHtml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const HIGHLIGHT_OPEN_TOKEN = '[[hl]]';
  const HIGHLIGHT_CLOSE_TOKEN = '[[/hl]]';
  const HIGHLIGHT_TOKENS_REGEX = /(\[\[\/?hl\]\]|<\s*\/?\s*h\s*>)/gi;
  const HIGHLIGHT_BLOCK_REGEX = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/gi;

  const normalizeHighlightTokens = (str) =>
    String(str || '')
      .replace(/<\s*h\s*>/gi, HIGHLIGHT_OPEN_TOKEN)
      .replace(/<\s*\/\s*h\s*>/gi, HIGHLIGHT_CLOSE_TOKEN);

  const stripHighlightTokens = (str) => String(str || '').replace(HIGHLIGHT_TOKENS_REGEX, '');

  const renderNoteContent = (str) => {
    const raw = normalizeHighlightTokens(str);
    let html = '';
    let lastIndex = 0;
    let match;

    while ((match = HIGHLIGHT_BLOCK_REGEX.exec(raw))) {
      const [fullMatch, innerText] = match;
      const start = match.index;
      html += escapeHtml(raw.slice(lastIndex, start));
      html += `<mark class="bible-inline-highlight bible-note-inline-highlight">${escapeHtml(innerText)}</mark>`;
      lastIndex = start + fullMatch.length;
    }

    html += escapeHtml(raw.slice(lastIndex));
    HIGHLIGHT_BLOCK_REGEX.lastIndex = 0;
    return html;
  };

  const applyHighlightOnTextarea = (textareaEl) => {
    if (!textareaEl) return { ok: false, reason: 'missing' };
    const value = String(textareaEl.value || '');
    const start = Number(textareaEl.selectionStart ?? 0);
    const end = Number(textareaEl.selectionEnd ?? 0);
    if (end <= start) return { ok: false, reason: 'no-selection' };

    const selected = value.slice(start, end);
    if (!selected.trim()) return { ok: false, reason: 'empty-selection' };

    const nextValue =
      value.slice(0, start) +
      HIGHLIGHT_OPEN_TOKEN +
      selected +
      HIGHLIGHT_CLOSE_TOKEN +
      value.slice(end);

    textareaEl.value = nextValue;
    const selectionStart = start + HIGHLIGHT_OPEN_TOKEN.length;
    const selectionEnd = selectionStart + selected.length;
    textareaEl.focus();
    textareaEl.setSelectionRange(selectionStart, selectionEnd);
    return { ok: true };
  };

  const clearHighlightsFromTextarea = (textareaEl) => {
    if (!textareaEl) return;
    textareaEl.value = String(textareaEl.value || '').replace(HIGHLIGHT_TOKENS_REGEX, '');
  };

  const mergeRanges = (ranges) => {
    const normalized = (ranges || [])
      .map((r) => [Number(r?.[0] || 0), Number(r?.[1] || 0)])
      .filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]) && r[1] > r[0])
      .sort((a, b) => a[0] - b[0]);
    if (!normalized.length) return [];

    const merged = [normalized[0]];
    for (let i = 1; i < normalized.length; i += 1) {
      const current = normalized[i];
      const last = merged[merged.length - 1];
      if (current[0] <= last[1]) {
        last[1] = Math.max(last[1], current[1]);
      } else {
        merged.push(current);
      }
    }
    return merged;
  };

  const parseHighlightModel = (rawContent) => {
    const raw = normalizeHighlightTokens(rawContent);
    let plain = '';
    const ranges = [];
    let i = 0;
    let plainIndex = 0;
    let inHighlight = false;
    let highlightStart = 0;

    while (i < raw.length) {
      if (raw.startsWith(HIGHLIGHT_OPEN_TOKEN, i)) {
        if (!inHighlight) {
          inHighlight = true;
          highlightStart = plainIndex;
        }
        i += HIGHLIGHT_OPEN_TOKEN.length;
        continue;
      }
      if (raw.startsWith(HIGHLIGHT_CLOSE_TOKEN, i)) {
        if (inHighlight && plainIndex > highlightStart) {
          ranges.push([highlightStart, plainIndex]);
        }
        inHighlight = false;
        i += HIGHLIGHT_CLOSE_TOKEN.length;
        continue;
      }
      plain += raw[i];
      i += 1;
      plainIndex += 1;
    }

    if (inHighlight && plainIndex > highlightStart) {
      ranges.push([highlightStart, plainIndex]);
    }

    return {
      plain,
      ranges: mergeRanges(ranges),
    };
  };

  const serializeHighlightModel = (plain, ranges) => {
    const text = String(plain || '');
    const merged = mergeRanges(ranges);
    if (!merged.length) return text;

    let out = '';
    let cursor = 0;
    merged.forEach(([start, end]) => {
      const safeStart = Math.max(0, Math.min(text.length, start));
      const safeEnd = Math.max(safeStart, Math.min(text.length, end));
      out += text.slice(cursor, safeStart);
      out += `${HIGHLIGHT_OPEN_TOKEN}${text.slice(safeStart, safeEnd)}${HIGHLIGHT_CLOSE_TOKEN}`;
      cursor = safeEnd;
    });
    out += text.slice(cursor);
    return out;
  };

  const applyHighlightRangeOnRaw = (rawContent, plainStart, plainEnd) => {
    const model = parseHighlightModel(rawContent);
    const start = Math.max(0, Math.min(model.plain.length, Number(plainStart || 0)));
    const end = Math.max(0, Math.min(model.plain.length, Number(plainEnd || 0)));
    if (end <= start) return rawContent;
    const ranges = mergeRanges([...model.ranges, [start, end]]);
    return serializeHighlightModel(model.plain, ranges);
  };

  const clearHighlightsFromRaw = (rawContent) => stripHighlightTokens(rawContent);

  const formatDateTime = (iso) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return '-';
    }
  };

  const getSelectionOffsetsInContainer = (containerEl) => {
    if (!containerEl || !window.getSelection) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!range || range.collapsed) return null;

    const common = range.commonAncestorContainer;
    if (!containerEl.contains(common)) return null;

    const startRange = document.createRange();
    startRange.selectNodeContents(containerEl);
    startRange.setEnd(range.startContainer, range.startOffset);
    const start = startRange.toString().length;

    const endRange = document.createRange();
    endRange.selectNodeContents(containerEl);
    endRange.setEnd(range.endContainer, range.endOffset);
    const end = endRange.toString().length;

    if (end <= start) return null;
    return { start, end };
  };

  const init = () => {
    const noteRef = document.getElementById('bibleNoteRef');
    const noteContent = document.getElementById('bibleNoteContent');
    const noteTags = document.getElementById('bibleNoteTags');
    const noteSaveBtn = document.getElementById('bibleNoteSaveBtn');
    const noteHighlightBtn = document.getElementById('bibleNoteHighlightBtn');
    const noteClearHighlightBtn = document.getElementById('bibleNoteClearHighlightBtn');
    const notesList = document.getElementById('bibleNotesList');
    const noteSearch = document.getElementById('bibleNoteSearch');
    const tagsPanel = document.getElementById('bibleTagsPanel');
    const tagsDatalist = document.getElementById('bibleTagsDatalist');
    const notesCount = document.getElementById('bibleNotesCount');
    const tagsCount = document.getElementById('bibleTagsCount');
    const backBtn = document.getElementById('bibleBackBtn');

    if (backBtn) {
      backBtn.addEventListener('click', (event) => {
        event.preventDefault();
        try {
          if (window.history.length > 1) {
            window.history.back();
            return;
          }
        } catch (e) {
          // no-op
        }
        window.location.replace('index.html#home');
      });
    }

    const renderTagsPanel = (notes) => {
      if (!tagsPanel || !tagsDatalist) return new Map();

      const freq = new Map();
      notes.forEach((n) => {
        (n.tags || []).forEach((t) => {
          const key = t.trim();
          if (!key) return;
          freq.set(key, (freq.get(key) || 0) + 1);
        });
      });

      const tags = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([tag, count]) => ({ tag, count }));

      tagsPanel.innerHTML = tags.length
        ? tags
            .map(
              (t) =>
                `<button type="button" data-tag="${escapeHtml(t.tag)}">#${escapeHtml(t.tag)} <small>${t.count}</small></button>`
            )
            .join('')
        : '<div class="bible-note-empty-inline">Sem tags ainda.</div>';

      tagsDatalist.innerHTML = tags.map((t) => `<option value="#${escapeHtml(t.tag)}"></option>`).join('');

      tagsPanel.querySelectorAll('button[data-tag]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (noteSearch) {
            noteSearch.value = `#${btn.dataset.tag}`;
            renderNotes();
          }
        });
      });

      return freq;
    };

    const renderNotes = async () => {
      const notes = await BibleNotesStore.load();
      const q = noteSearch ? noteSearch.value.trim() : '';
      const filtered = q ? await BibleNotesStore.search(q) : notes;
      const tagsFreq = renderTagsPanel(notes);
      const getNoteById = (id) => notes.find((n) => n.id === id);

      if (notesCount) notesCount.textContent = String(notes.length);
      if (tagsCount) tagsCount.textContent = String(tagsFreq.size);

      if (!notesList) return;

      if (!filtered.length) {
        notesList.innerHTML = `
          <div class="bible-notes-empty">
            <div class="bible-notes-empty-icon">🗒️</div>
            <div class="bible-notes-empty-title">Nenhuma anotação encontrada</div>
            <div class="bible-notes-empty-text">Crie sua primeira anotação ou ajuste a busca/tags.</div>
          </div>
        `;
        return;
      }

      const visibleNotes = filtered.slice(0, 1);
      const hiddenCount = Math.max(0, filtered.length - visibleNotes.length);
      const listHint = hiddenCount > 0
        ? `<div class="bible-notes-list-hint">Mostrando apenas 1 anotação. Use busca ou #tag para trocar. (${hiddenCount} ocultas)</div>`
        : '';

      notesList.innerHTML = `${listHint}${visibleNotes
        .map((n) => {
          const reference = n.reference ? escapeHtml(n.reference) : 'Sem referência';
          const content = renderNoteContent(n.content || '');
          const updated = formatDateTime(n.updatedAt || n.createdAt);
          const tags = (n.tags || [])
            .map((t) => `<span data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`)
            .join('');

          return `
            <article class="bible-note-card" data-id="${n.id}">
              <div class="bible-note-card-head">
                <div class="bible-note-card-ref">${reference}</div>
                <div class="bible-note-card-meta">Atualizado: ${updated}</div>
              </div>
              <div class="bible-note-card-content">${content}</div>
              ${tags ? `<div class="bible-note-card-tags">${tags}</div>` : ''}
              <div class="bible-note-card-actions">
                <button class="ghost bible-note-read-view" type="button" data-id="${n.id}">📖 Ler marcação</button>
                <button class="ghost bible-note-mark-visible" type="button" data-id="${n.id}">🖍️ Marcar no texto</button>
                <button class="ghost bible-note-clear-visible" type="button" data-id="${n.id}">🧹 Limpar marcações</button>
                <button class="ghost bible-note-edit" data-id="${n.id}">✏️ Editar</button>
                <button class="ghost bible-note-delete" data-id="${n.id}">🗑️ Excluir</button>
              </div>

              <div class="bible-note-edit-form hidden" data-id="${n.id}">
                <label class="bible-note-field">
                  <span>Referência</span>
                  <input type="text" class="bible-note-input edit-ref" value="${escapeHtml(n.reference || '')}">
                </label>
                <label class="bible-note-field">
                  <span>Anotação</span>
                  <textarea class="bible-note-textarea edit-content">${escapeHtml(n.content || '')}</textarea>
                </label>
                <div class="bible-note-highlight-tools">
                  <button class="ghost bible-note-edit-highlight" type="button" data-id="${n.id}">🖍️ Marcar seleção</button>
                  <button class="ghost bible-note-edit-highlight-clear" type="button" data-id="${n.id}">🧹 Limpar marcações</button>
                </div>
                <label class="bible-note-field">
                  <span>Tags</span>
                  <input type="text" class="bible-note-input edit-tags" value="${escapeHtml((n.tags || []).join(', '))}">
                </label>
                <div class="bible-note-card-actions">
                  <button class="btn success bible-note-save" data-id="${n.id}">Salvar</button>
                  <button class="ghost bible-note-cancel" data-id="${n.id}">Cancelar</button>
                </div>
              </div>
            </article>
          `;
        })
        .join('')}`;

      notesList.querySelectorAll('.bible-note-delete').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          await BibleNotesStore.remove(id);
          renderNotes();
        });
      });

      notesList.querySelectorAll('.bible-note-read-view').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          window.location.href = `biblia-leitura.html?noteId=${encodeURIComponent(id)}`;
        });
      });

      notesList.querySelectorAll('.bible-note-mark-visible').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          const contentEl = card?.querySelector('.bible-note-card-content');
          const note = getNoteById(id);
          if (!note || !contentEl) return;

          const offsets = getSelectionOffsetsInContainer(contentEl);
          if (!offsets) {
            showError('Selecione um trecho dentro do texto da anotação para marcar.');
            return;
          }

          const updatedContent = applyHighlightRangeOnRaw(note.content || '', offsets.start, offsets.end);
          clearError();
          await BibleNotesStore.update(id, { content: updatedContent });

          try {
            const selection = window.getSelection?.();
            selection?.removeAllRanges?.();
          } catch (e) {
            // no-op
          }
          renderNotes();
        });
      });

      notesList.querySelectorAll('.bible-note-clear-visible').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (!id) return;
          const note = getNoteById(id);
          if (!note) return;
          await BibleNotesStore.update(id, { content: clearHighlightsFromRaw(note.content || '') });
          clearError();
          renderNotes();
        });
      });

      notesList.querySelectorAll('.bible-note-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          if (!card) return;

          notesList
            .querySelectorAll('.bible-note-edit-form')
            .forEach((form) => form.classList.add('hidden'));

          card.querySelector('.bible-note-edit-form')?.classList.remove('hidden');
        });
      });

      notesList.querySelectorAll('.bible-note-cancel').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          if (!card) return;
          card.querySelector('.bible-note-edit-form')?.classList.add('hidden');
        });
      });

      notesList.querySelectorAll('.bible-note-edit-highlight').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          const textarea = card?.querySelector('.edit-content');
          const result = applyHighlightOnTextarea(textarea);
          if (!result.ok && result.reason === 'no-selection') {
            showError('Selecione um trecho da anotação para marcar.');
          } else if (result.ok) {
            clearError();
          }
        });
      });

      notesList.querySelectorAll('.bible-note-edit-highlight-clear').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          const textarea = card?.querySelector('.edit-content');
          clearHighlightsFromTextarea(textarea);
          clearError();
        });
      });

      notesList.querySelectorAll('.bible-note-save').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          const card = notesList.querySelector(`.bible-note-card[data-id="${id}"]`);
          if (!card) return;

          const ref = card.querySelector('.edit-ref')?.value?.trim() || '';
          const content = card.querySelector('.edit-content')?.value?.trim() || '';
          const tags = BibleNotesStore._parseTags(card.querySelector('.edit-tags')?.value || '');

          if (!stripHighlightTokens(content).trim()) {
            showError('Escreva uma anotação antes de salvar.');
            return;
          }

          clearError();
          await BibleNotesStore.update(id, { reference: ref, content, tags });
          renderNotes();
        });
      });

      notesList.querySelectorAll('.bible-note-card-tags span').forEach((tagEl) => {
        tagEl.addEventListener('click', () => {
          if (noteSearch) {
            noteSearch.value = `#${tagEl.dataset.tag || ''}`.trim();
            renderNotes();
          }
        });
      });
    };

    if (noteHighlightBtn) {
      noteHighlightBtn.addEventListener('click', () => {
        const result = applyHighlightOnTextarea(noteContent);
        if (!result.ok && result.reason === 'no-selection') {
          showError('Selecione um trecho da anotação para marcar.');
        } else if (result.ok) {
          clearError();
        }
      });
    }

    if (noteClearHighlightBtn) {
      noteClearHighlightBtn.addEventListener('click', () => {
        clearHighlightsFromTextarea(noteContent);
        clearError();
      });
    }

    if (noteSaveBtn) {
      noteSaveBtn.addEventListener('click', async () => {
        const ref = noteRef ? noteRef.value.trim() : '';
        const content = noteContent ? noteContent.value.trim() : '';
        const tags = noteTags ? BibleNotesStore._parseTags(noteTags.value) : [];

        if (!stripHighlightTokens(content).trim()) {
          showError('Escreva uma anotação antes de salvar.');
          return;
        }

        clearError();
        await BibleNotesStore.add({ reference: ref, content, tags });

        if (noteRef) noteRef.value = '';
        if (noteContent) noteContent.value = '';
        if (noteTags) noteTags.value = '';

        renderNotes();
      });
    }

    if (noteSearch) {
      noteSearch.addEventListener('input', () => {
        renderNotes();
      });
    }

    renderNotes().catch((e) => {
      showError('Não foi possível carregar as anotações.');
      console.warn('Falha ao carregar anotações:', e);
    });
  };

  document.addEventListener('DOMContentLoaded', init);
})();
