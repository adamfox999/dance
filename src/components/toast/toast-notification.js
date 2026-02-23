(function (globalScope) {
  const STYLE_ELEMENT_ID = 'toast-notification-component-style';
  const DEFAULT_DURATION_MS = 2200;

  function ensureStyles() {
    if (document.getElementById(STYLE_ELEMENT_ID)) return;

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ELEMENT_ID;
    styleEl.textContent = `
      .toast {
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%) translateY(120%) scale(0.85);
        opacity: 0;
        pointer-events: none;
        display: flex;
        align-items: flex-end;
        gap: 6px;
        z-index: 2300;
        transition: opacity 0.18s ease;
      }

      .toast-mascot {
        width: 88px;
        height: 88px;
        flex-shrink: 0;
        filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.25));
        animation: none;
      }

      .toast.show .toast-mascot {
        animation: mascot-wave 0.6s ease 0.3s;
      }

      .toast-bubble {
        position: relative;
        background: #fffdf7;
        border: 3px solid #d4943a;
        border-radius: 20px;
        padding: 14px 20px;
        margin-bottom: 30px;
        min-width: 140px;
        max-width: 230px;
        box-shadow:
          0 6px 20px rgba(0, 0, 0, 0.14),
          0 1px 0 rgba(255, 255, 255, 0.8) inset,
          0 -1px 4px rgba(180, 120, 40, 0.08) inset;
        font-family: 'Baloo 2', cursive;
        font-size: 1rem;
        font-weight: 700;
        color: #5a3412;
        text-align: center;
        line-height: 1.35;
      }

      .toast-bubble::before {
        content: '';
        position: absolute;
        bottom: 10px;
        left: -17px;
        width: 0;
        height: 0;
        border-top: 10px solid transparent;
        border-bottom: 6px solid transparent;
        border-right: 17px solid #d4943a;
      }

      .toast-bubble::after {
        content: '';
        position: absolute;
        bottom: 11px;
        left: -12px;
        width: 0;
        height: 0;
        border-top: 8px solid transparent;
        border-bottom: 5px solid transparent;
        border-right: 13px solid #fffdf7;
      }

      .toast-text {
        color: #4a280f;
      }

      .toast.show {
        opacity: 1;
        animation: toast-pop 0.5s cubic-bezier(0.2, 1.05, 0.25, 1) forwards;
      }

      @keyframes toast-pop {
        0% {
          transform: translateX(-50%) translateY(120%) scale(0.85);
        }
        60% {
          transform: translateX(-50%) translateY(-8px) scale(1.04);
        }
        100% {
          transform: translateX(-50%) translateY(0) scale(1);
        }
      }

      @keyframes mascot-wave {
        0%, 100% {
          transform: rotate(0deg);
        }
        25% {
          transform: rotate(-8deg);
        }
        50% {
          transform: rotate(6deg);
        }
        75% {
          transform: rotate(-4deg);
        }
      }
    `;

    document.head.appendChild(styleEl);
  }

  function createToastNotification(options) {
    const config = options || {};
    const duration = Number(config.duration) > 0 ? Number(config.duration) : DEFAULT_DURATION_MS;
    const injectStyles = config.injectStyles !== false;
    const mascotSrc = config.mascotSrc || 'toast/toast-mascot.svg';
    const mascotAlt = config.mascotAlt || 'Toast mascot';

    if (injectStyles) {
      ensureStyles();
    }

    let toastEl = null;
    let timeoutId = null;

    function ensureToastElement() {
      if (toastEl) return toastEl;

      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.innerHTML = `
        <img class="toast-mascot" src="${mascotSrc}" alt="${mascotAlt}" draggable="false">
        <div class="toast-bubble">
          <span class="toast-text"></span>
        </div>
      `;
      document.body.appendChild(toastEl);
      return toastEl;
    }

    function show(message) {
      const el = ensureToastElement();
      const textEl = el.querySelector('.toast-text');
      if (textEl) {
        textEl.textContent = String(message || '');
      }

      el.classList.remove('show');
      void el.offsetWidth;
      el.classList.add('show');

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        el.classList.remove('show');
      }, duration);
    }

    function destroy() {
      clearTimeout(timeoutId);
      if (toastEl) {
        toastEl.remove();
      }
      toastEl = null;
    }

    return {
      show,
      destroy,
    };
  }

  globalScope.createToastNotification = createToastNotification;
})(window);
