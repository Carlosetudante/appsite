// workTimer.js - Sistema de Cronômetro de Trabalho em Segundo Plano
// Este arquivo deve ser incluído em todas as páginas para manter o timer sincronizado

const WorkTimer = {
  intervalId: null,
  displayElement: null,
  startBtn: null,
  stopBtn: null,
  floatingWidget: null,
  _nativeNotifier: null,
  _backgroundSyncInFlight: false,

  getCapacitorPlatform() {
    try {
      const cap = window.Capacitor;
      if (!cap) return 'web';
      if (typeof cap.getPlatform === 'function') return cap.getPlatform();
      if (typeof cap.platform === 'string' && cap.platform) return cap.platform;
      if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return 'android';
      if (window.location?.protocol === 'capacitor:') return 'android';
      return 'web';
    } catch (e) {
      return 'web';
    }
  },

  getNativeNotifier() {
    try {
      const cap = window.Capacitor;
      if (!cap || this.getCapacitorPlatform() === 'web') return null;
      if (cap.Plugins?.WorkTimerNotifier) return cap.Plugins.WorkTimerNotifier;
      if (!this._nativeNotifier && typeof cap.registerPlugin === 'function') {
        this._nativeNotifier = cap.registerPlugin('WorkTimerNotifier');
      }
      return this._nativeNotifier || null;
    } catch (e) {
      return null;
    }
  },

  notifyNativeStart(startTime) {
    try {
      const notifier = this.getNativeNotifier();
      if (notifier && typeof notifier.start === 'function') {
        Promise.resolve()
          .then(() => {
            if (typeof notifier.requestPermission === 'function') {
              return notifier.requestPermission();
            }
            return null;
          })
          .then(() => notifier.start({ startTime: Number(startTime || Date.now()) }))
          .catch((e) => {
            console.warn('Falha ao iniciar notificação nativa do timer:', e);
          });
      }
    } catch (e) {}
  },

  notifyNativeStop() {
    try {
      const notifier = this.getNativeNotifier();
      if (notifier && typeof notifier.stop === 'function') {
        notifier.stop().catch((e) => {
          console.warn('Falha ao parar notificação nativa do timer:', e);
        });
      }
    } catch (e) {}
  },

  syncBackgroundNotifier(startTime) {
    if (this._backgroundSyncInFlight) return;
    this._backgroundSyncInFlight = true;
    try {
      if (typeof window.startWorkNotification === 'function') {
        Promise.resolve(window.startWorkNotification(Number(startTime || Date.now())))
          .catch((e) => {
            console.warn('Falha ao iniciar notificação global do timer, usando fallback nativo:', e);
            this.notifyNativeStart(startTime);
          })
          .finally(() => {
            this._backgroundSyncInFlight = false;
          });
        return;
      }
      this.notifyNativeStart(startTime);
      this._backgroundSyncInFlight = false;
    } catch (e) {
      console.warn('Falha ao sincronizar notificador de background do timer:', e);
      this._backgroundSyncInFlight = false;
    }
  },

  unsyncBackgroundNotifier() {
    try {
      if (typeof window.stopWorkNotification === 'function') {
        Promise.resolve(window.stopWorkNotification())
          .catch((e) => {
            console.warn('Falha ao parar notificação global do timer, usando fallback nativo:', e);
            this.notifyNativeStop();
          });
        return;
      }
      this.notifyNativeStop();
    } catch (e) {
      console.warn('Falha ao parar notificador de background do timer:', e);
    }
  },

  init() {
    // Tenta encontrar os elementos do timer principal (index.html)
    this.displayElement = document.getElementById('workTimerDisplay');
    this.startBtn = document.getElementById('startWorkBtn');
    this.stopBtn = document.getElementById('stopWorkBtn');

    // Se os botÃµes existem, configura os listeners
    if (this.startBtn && this.stopBtn) {
      this.startBtn.addEventListener('click', () => this.start());
      this.stopBtn.addEventListener('click', () => this.stop());
    }

    // Cria o widget flutuante APENAS se hÃ¡ um timer ativo E nÃ£o estamos na pÃ¡gina com o timer principal
    const hasActiveTimer = localStorage.getItem('work_start_time');
    if (!this.displayElement && hasActiveTimer) {
      this.createFloatingWidget();
    }

    // Inicia a atualizaÃ§Ã£o do display
    this.updateDisplay();

    // Se hÃ¡ um timer ativo, inicia o intervalo
    if (hasActiveTimer) {
      this.intervalId = setInterval(() => this.updateDisplay(), 1000);
      this.syncBackgroundNotifier(Number(hasActiveTimer));
    }

    // Escuta eventos de storage para sincronizar entre abas
    window.addEventListener('storage', (e) => {
      if (e.key === 'work_start_time') {
        this.updateDisplay();
        if (e.newValue && !this.intervalId) {
          this.intervalId = setInterval(() => this.updateDisplay(), 1000);
          this.syncBackgroundNotifier(Number(e.newValue));
          // Cria widget se nÃ£o existe e nÃ£o estamos na pÃ¡gina principal
          if (!this.displayElement && !this.floatingWidget) {
            this.createFloatingWidget();
          }
        } else if (!e.newValue && this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
          this.updateDisplay();
          // Remove widget quando timer para
          if (this.floatingWidget) {
            this.floatingWidget.remove();
            this.floatingWidget = null;
          }
          this.unsyncBackgroundNotifier();
        }
      }
    });

    // Quando a pÃ¡gina fica visÃ­vel novamente, atualiza o display
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.updateDisplay();
      }
    });
  },

  createFloatingWidget() {
    // Verifica se jÃ¡ existe
    if (document.getElementById('workTimerFloatingWidget')) return;

    // Cria o widget flutuante
    const widget = document.createElement('div');
    widget.id = 'workTimerFloatingWidget';
    widget.innerHTML = `
      <div class="work-timer-floating-content">
        <span class="work-timer-floating-icon">💼</span>
        <span class="work-timer-floating-time" id="workTimerFloatingDisplay">00:00:00</span>
        <div class="work-timer-floating-actions">
          <button class="work-timer-floating-btn start" id="workTimerFloatingStart" title="Iniciar">▶</button>
          <button class="work-timer-floating-btn stop" id="workTimerFloatingStop" title="Parar" disabled>⏹</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(widget);
    this.floatingWidget = widget;

    // Adiciona os estilos se ainda nÃ£o existem
    if (!document.getElementById('workTimerFloatingStyles')) {
      const styles = document.createElement('style');
      styles.id = 'workTimerFloatingStyles';
      styles.textContent = `
        #workTimerFloatingWidget {
          position: fixed;
          bottom: calc(20px + env(safe-area-inset-bottom));
          right: 20px;
          background: linear-gradient(135deg, #1e3a5f 0%, #0e2340 100%);
          border: 1px solid rgba(255, 221, 87, 0.3);
          border-radius: 50px;
          padding: 8px 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          z-index: 9999;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          transition: all 0.3s ease;
          display: none;
        }

        #workTimerFloatingWidget.active {
          display: block;
          animation: slideIn 0.3s ease;
        }

        #workTimerFloatingWidget:hover {
          transform: scale(1.02);
          box-shadow: 0 6px 25px rgba(0, 0, 0, 0.5);
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .work-timer-floating-content {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .work-timer-floating-icon {
          font-size: 18px;
        }

        .work-timer-floating-time {
          font-size: 16px;
          font-weight: 700;
          color: #ffdd57;
          font-family: 'Courier New', monospace;
          min-width: 70px;
          text-align: center;
        }

        .work-timer-floating-actions {
          display: flex;
          gap: 5px;
        }

        .work-timer-floating-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .work-timer-floating-btn.start {
          background: #4ade80;
          color: #000;
        }

        .work-timer-floating-btn.start:hover:not(:disabled) {
          background: #22c55e;
          transform: scale(1.1);
        }

        .work-timer-floating-btn.stop {
          background: #f87171;
          color: #000;
        }

        .work-timer-floating-btn.stop:hover:not(:disabled) {
          background: #ef4444;
          transform: scale(1.1);
        }

        .work-timer-floating-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* AnimaÃ§Ã£o pulsante quando ativo */
        #workTimerFloatingWidget.running {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          }
          50% {
            box-shadow: 0 4px 20px rgba(255, 221, 87, 0.4);
          }
        }

        /* Responsivo */
        @media (max-width: 600px) {
          #workTimerFloatingWidget {
            bottom: calc(96px + env(safe-area-inset-bottom));
            right: 10px;
            padding: 6px 12px;
          }

          .work-timer-floating-time {
            font-size: 14px;
          }

          .work-timer-floating-btn {
            width: 24px;
            height: 24px;
            font-size: 10px;
          }
        }
      `;
      document.head.appendChild(styles);
    }

    // Listeners para os botÃµes do widget flutuante
    const floatingStartBtn = document.getElementById('workTimerFloatingStart');
    const floatingStopBtn = document.getElementById('workTimerFloatingStop');

    if (floatingStartBtn) {
      floatingStartBtn.addEventListener('click', () => this.start());
    }
    if (floatingStopBtn) {
      floatingStopBtn.addEventListener('click', () => this.stop());
    }
  },

  formatTime(ms) {
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  },

  updateDisplay() {
    const startTimeRaw = localStorage.getItem('work_start_time');
    const startTimeParsed = Number(startTimeRaw);
    const isRunning = Number.isFinite(startTimeParsed) && startTimeParsed > 0;

    // Se o valor estiver invÃ¡lido, limpa para nÃ£o manter contador fantasma.
    if (startTimeRaw && !isRunning) {
      try { localStorage.removeItem('work_start_time'); } catch (e) {}
    }
    
    let timeText = '00:00:00';
    let isOverLimit = false;

    if (isRunning) {
      let diff = Date.now() - startTimeParsed;
      
      // Limite visual de 48 horas
      const maxDuration = 48 * 60 * 60 * 1000;
      if (diff >= maxDuration) {
        diff = maxDuration;
        isOverLimit = true;
      }
      
      timeText = this.formatTime(diff);
    }

    // Atualiza o display principal (se existir)
    if (this.displayElement) {
      this.displayElement.textContent = timeText;
      this.displayElement.style.color = isOverLimit ? '#f87171' : '';
    }

    // Atualiza os botÃµes principais
    if (this.startBtn && this.stopBtn) {
      this.startBtn.disabled = isRunning;
      this.startBtn.style.opacity = isRunning ? '0.5' : '1';
      this.stopBtn.disabled = !isRunning;
      this.stopBtn.style.opacity = isRunning ? '1' : '0.5';
    }

    // Atualiza o widget flutuante
    const floatingDisplay = document.getElementById('workTimerFloatingDisplay');
    const floatingStartBtn = document.getElementById('workTimerFloatingStart');
    const floatingStopBtn = document.getElementById('workTimerFloatingStop');
    const floatingWidget = document.getElementById('workTimerFloatingWidget');

    if (floatingWidget) {
      // Mostra o widget se o timer estÃ¡ rodando ou se estamos em outra pÃ¡gina
      if (isRunning || !this.displayElement) {
        floatingWidget.classList.add('active');
        
        if (isRunning) {
          floatingWidget.classList.add('running');
        } else {
          floatingWidget.classList.remove('running');
        }
      } else {
        floatingWidget.classList.remove('active', 'running');
      }
    }

    if (floatingDisplay) {
      floatingDisplay.textContent = timeText;
      floatingDisplay.style.color = isOverLimit ? '#f87171' : '#ffdd57';
    }

    if (floatingStartBtn && floatingStopBtn) {
      floatingStartBtn.disabled = isRunning;
      floatingStopBtn.disabled = !isRunning;
    }
  },

  start(options = {}) {
    const requestedStart = Number(options?.startTime);
    const startTime = Number.isFinite(requestedStart) && requestedStart > 0
      ? requestedStart
      : Date.now();
    localStorage.setItem('work_start_time', startTime.toString());
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.intervalId = setInterval(() => this.updateDisplay(), 1000);
    this.updateDisplay();
    this.syncBackgroundNotifier(startTime);
    

    // Dispara um evento customizado para outras partes do app
    window.dispatchEvent(new CustomEvent('workTimerStarted', {
      detail: {
        startTime,
        source: String(options?.source || 'app')
      }
    }));
  },

  stop(options = {}) {
    const storedStart = Number(localStorage.getItem('work_start_time'));
    const requestedStart = Number(options?.startTime);
    const startTime = Number.isFinite(requestedStart) && requestedStart > 0
      ? requestedStart
      : storedStart;
    const requestedEnd = Number(options?.endTime);
    const endTime = Number.isFinite(requestedEnd) && requestedEnd > 0
      ? requestedEnd
      : Date.now();

    const hasValidStart = Number.isFinite(startTime) && startTime > 0;

    // Sempre limpa o estado do timer para evitar continuar contando após parar.
    localStorage.removeItem('work_start_time');

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (hasValidStart && typeof window.finishWorkSession === 'function') {
      window.finishWorkSession(startTime, endTime);
    }

    this.updateDisplay();
    this.unsyncBackgroundNotifier();

    // Dispara um evento customizado
    window.dispatchEvent(new CustomEvent('workTimerStopped', {
      detail: {
        startTime: hasValidStart ? startTime : 0,
        endTime,
        source: String(options?.source || 'app')
      }
    }));
  },

  // MÃ©todo para verificar se o timer estÃ¡ ativo
  isRunning() {
    const start = Number(localStorage.getItem('work_start_time'));
    return Number.isFinite(start) && start > 0;
  },

  // MÃ©todo para obter o tempo decorrido em ms
  getElapsedTime() {
    const startTime = Number(localStorage.getItem('work_start_time'));
    if (!Number.isFinite(startTime) || startTime <= 0) return 0;
    return Date.now() - startTime;
  }
};

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => WorkTimer.init());
} else {
  WorkTimer.init();
}

// ExpÃµe globalmente para uso em outras partes do app
window.WorkTimer = WorkTimer;

