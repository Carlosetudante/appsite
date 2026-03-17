(() => {
  const HIGHLIGHT_OPEN_TOKEN = '[[hl]]';
  const HIGHLIGHT_CLOSE_TOKEN = '[[/hl]]';
  const HIGHLIGHT_BLOCK_REGEX = /\[\[hl\]\]([\s\S]*?)\[\[\/hl\]\]/gi;

  const showError = (msg) => {
    const box = document.getElementById('bibleReadingError');
    if (!box) return;
    box.textContent = msg;
    box.classList.remove('hidden');
  };

  const escapeHtml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const getSessionUser = () => {
    try {
      return localStorage.getItem('ur_session') || localStorage.getItem('ur_last_user') || 'local';
    } catch (e) {
      return 'local';
    }
  };

  const getNotesLocalKey = () => `bible_notes_${getSessionUser()}`;

  const normalizeHighlightTokens = (str) =>
    String(str || '')
      .replace(/<\s*h\s*>/gi, HIGHLIGHT_OPEN_TOKEN)
      .replace(/<\s*\/\s*h\s*>/gi, HIGHLIGHT_CLOSE_TOKEN);

  const renderHighlightedContent = (str) => {
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
    return html || '<span class="bible-reading-empty">Sem conteúdo para leitura.</span>';
  };

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

  const parseNoteId = () => {
    try {
      const url = new URL(window.location.href);
      return String(url.searchParams.get('noteId') || '').trim();
    } catch (e) {
      return '';
    }
  };

  const loadNotes = () => {
    try {
      const raw = localStorage.getItem(getNotesLocalKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const finishIntro = () => {
    const intro = document.getElementById('bibleReadingIntro');
    if (!intro) return;
    intro.classList.add('is-finished');
    setTimeout(() => {
      intro.remove();
    }, 520);
  };

  const initIntro = () => {
    const intro = document.getElementById('bibleReadingIntro');
    const gate = document.getElementById('bibleReadingGate');
    const skipBtn = document.getElementById('bibleReadingSkipBtn');
    if (!intro || !gate) return;

    const openGate = () => gate.classList.add('is-open');

    setTimeout(openGate, 650);
    setTimeout(finishIntro, 2550);

    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        gate.classList.add('is-open');
        finishIntro();
      });
    }
  };

  const init = () => {
    const backBtn = document.getElementById('bibleReadingBackBtn');
    const refEl = document.getElementById('bibleReadingRef');
    const metaEl = document.getElementById('bibleReadingMeta');
    const contentEl = document.getElementById('bibleReadingContent');

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
        window.location.replace('biblia-anotacoes.html');
      });
    }

    const noteId = parseNoteId();
    const notes = loadNotes();
    const note = notes.find((n) => String(n?.id || '') === noteId);

    if (!note) {
      showError('Não encontrei essa anotação para leitura.');
      if (contentEl) {
        contentEl.innerHTML = '<span class="bible-reading-empty">Volte para Anotações e abra a leitura novamente.</span>';
      }
      initIntro();
      return;
    }

    if (refEl) refEl.textContent = note.reference || 'Sem referência';
    if (metaEl) metaEl.textContent = `Atualizado: ${formatDateTime(note.updatedAt || note.createdAt)}`;
    if (contentEl) contentEl.innerHTML = renderHighlightedContent(note.content || '');

    initIntro();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
