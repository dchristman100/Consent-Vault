export const runtime = 'nodejs'

export async function GET() {
  // Determine the correct APP_URL for API calls
  const appUrl = process.env.NEXT_PUBLIC_APP_URL 
    || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '')
    || 'https://v0-consentvault-app-shell-eight.vercel.app';

  const recorderScript = `
(function() {
  // Configuration
  const script = document.currentScript;
  const siteKey = script?.getAttribute('data-site-key');
  
  console.log('[ConsentVault] Script loaded, site key:', siteKey);
  
  if (!siteKey) {
    console.warn('ConsentVault: data-site-key attribute not found');
    return;
  }

  const APP_URL = '${appUrl}';
  const apiBaseUrl = APP_URL;
  console.log('[ConsentVault] API base URL:', APP_URL);
  let sessionId = '';
  let batchNumber = 0;
  let eventBatch = [];
  let rrwebInstance = null;
  let batchTimer = null;
  let urlCheckTimer = null;
  let originalUrl = ''; // URL recorded at session start (for change detection)
  let isFinalized = false; // guard so we only finalize a session once
  const BATCH_INTERVAL = 5000; // 5 seconds
  const URL_CHECK_INTERVAL = 500; // 500ms

  // Generate unique session ID
  function generateSessionId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now();
  }

  // API helper.
  // NOTE: keepalive must default to FALSE. The Fetch spec caps any request sent
  // with keepalive:true at a 64KB total body size, and rrweb event batches
  // easily exceed that — which throws "TypeError: Failed to fetch" before the
  // request is ever sent. Only enable keepalive for tiny unload-time payloads.
  async function apiCall(endpoint, data, options) {
    const useKeepalive = !!(options && options.keepalive);
    try {
      const response = await fetch(\`\${apiBaseUrl}/api/sessions\${endpoint}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: useKeepalive,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error(\`[ConsentVault] API error \${endpoint}: \${response.status} \${detail}\`);
        return null;
      }
      return response.json();
    } catch (error) {
      console.error(\`[ConsentVault] API fetch failed \${endpoint}:\`, error);
      return null;
    }
  }

  // Capture a full-page screenshot using html2canvas and send it to ConsentVault.
  // Triggered by the submit-button click / form-submit listeners below. Guarded
  // so it only ever runs once per session.
  let screenshotCaptured = false;
  async function captureAndSendScreenshot(trigger) {
    if (screenshotCaptured || !sessionId) return;
    screenshotCaptured = true;
    console.log('[ConsentVault] Screenshot capture triggered by:', trigger);
    try {
      // Load html2canvas if not already loaded
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Wait so form values are fully visible in the DOM before capture
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Capture full page screenshot
      const canvas = await window.html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: 0.75,
        logging: false,
        foreignObjectRendering: false,
      });

      const imageBase64 = canvas.toDataURL('image/jpeg', 0.75);
      console.log('[ConsentVault] Screenshot captured, size:', imageBase64.length, 'chars');

      // Send to ConsentVault API
      const res = await fetch(\`\${apiBaseUrl}/api/screenshot\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          site_key: siteKey,
          screenshot: imageBase64,
          captured_at: new Date().toISOString(),
        }),
      });

      const result = await res.json().catch(() => null);
      console.log('[ConsentVault] Screenshot API response:', result);
    } catch (err) {
      console.error('[ConsentVault] Screenshot capture failed:', err);
      screenshotCaptured = false; // allow a retry on a later trigger
    }
  }

  // Start session
  async function startSession() {
    sessionId = generateSessionId();
    isFinalized = false;
    batchNumber = 0;
    eventBatch = [];
    originalUrl = window.location.href; // capture for URL-change detection
    await apiCall('/start', {
      site_key: siteKey,
      session_id: sessionId,
      page_url: window.location.href,
      referrer: document.referrer,
    });
    console.log('[ConsentVault] Session started:', sessionId);
  }

  // Send event batch
  async function sendBatch() {
    if (eventBatch.length === 0) return;

    batchNumber++;
    const eventsToSend = [...eventBatch];
    eventBatch = [];

    await apiCall('/events', {
      site_key: siteKey,
      session_id: sessionId,
      events: eventsToSend,
      batch_number: batchNumber,
    });
  }

  // Setup batch timer
  function setupBatchTimer() {
    if (batchTimer) clearInterval(batchTimer);
    batchTimer = setInterval(sendBatch, BATCH_INTERVAL);
  }

  // Finalize the session. Triggered by: (1) URL change, (2) submit-button click,
  // (3) beforeunload/pagehide fallback. Uses regular fetch() (no sendBeacon) and
  // awaits BOTH the final event-batch flush and the finalize API call so nothing
  // is lost. Guarded so a session is only ever finalized once.
  async function finalizeSession(reason) {
    if (isFinalized || !sessionId) return;
    isFinalized = true;
    console.log('[ConsentVault] finalizeSession (' + reason + ') for session:', sessionId);

    // Stop timers so they don't race with the final flush.
    if (batchTimer) clearInterval(batchTimer);
    if (urlCheckTimer) clearInterval(urlCheckTimer);

    // 1) Flush any buffered events via regular fetch (awaited).
    if (eventBatch.length > 0) {
      batchNumber++;
      const eventsToSend = [...eventBatch];
      eventBatch = [];
      console.log('[ConsentVault] Flushing final batch of', eventsToSend.length, 'events');
      await apiCall('/events', {
        site_key: siteKey,
        session_id: sessionId,
        events: eventsToSend,
        batch_number: batchNumber,
      });
    }

    // 2) Capture the page_url at submit time (may differ from session start).
    const currentPageUrl = window.location.href;

    // 3) Finalize via regular fetch (awaited). Sets status=finalized,
    //    submitted_at=now(), finalized_at=now() server-side.
    console.log('[ConsentVault] Calling /finalize for session:', sessionId, 'page_url:', currentPageUrl);
    const result = await apiCall('/finalize', {
      site_key: siteKey,
      session_id: sessionId,
      page_url: currentPageUrl,
    });
    console.log('[ConsentVault] Finalize result:', result);
  }

  // Load rrweb and start recording
  async function loadRrweb() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/rrweb@1.1.3/dist/rrweb.min.js';
      script.onload = () => {
        if (window.rrweb) {
          try {
            rrwebInstance = window.rrweb.record({
              emit(event) {
                eventBatch.push(event);
              },
              // Disable ALL input masking
              maskAllInputs: false,
              maskInputOptions: {
                password: false,
                email: false,
                text: false,
                search: false,
                tel: false,
                url: false,
                number: false,
                color: false,
                date: false,
                range: false,
                select: false,
                textarea: false,
                checkbox: false,
                radio: false,
              },
              // Do not block any elements
              blockClass: 'rr-block-DISABLED',
              ignoreClass: 'rr-ignore-DISABLED',
              // Do not mask any text
              maskTextClass: 'rr-mask-DISABLED',
              maskTextSelector: null,
              // Do not mask any inputs by selector
              maskInputSelector: null,
              // Keep all attributes including values
              inlineStylesheet: true,
              recordCanvas: false,
              collectFonts: false,
              // Capture input values on initial snapshot too
              userTriggeredOnInput: true,
              slimDOMOptions: {
                script: false,
                comment: false,
                headFavicon: false,
                headWhitespace: false,
                headMetaDescKeywords: false,
                headMetaSocial: false,
                headMetaRobots: false,
                headMetaHttpEquiv: false,
                headMetaAuthorship: false,
                headMetaVerification: false,
              },
            });
            setupBatchTimer();
            resolve(true);
          } catch (error) {
            console.error('ConsentVault: rrweb initialization error:', error);
            resolve(false);
          }
        }
      };
      script.onerror = () => {
        console.error('ConsentVault: failed to load rrweb');
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  // Initialize on page load
  async function init() {
    try {
      await startSession();
      await loadRrweb();

      // METHOD 1 (primary) - URL change detection.
      // Poll every 500ms; if the URL changes from what it was at session start
      // (e.g. the form redirects to /booking?name=...), finalize immediately.
      urlCheckTimer = setInterval(() => {
        if (!isFinalized && window.location.href !== originalUrl) {
          console.log('[ConsentVault] URL changed from', originalUrl, 'to', window.location.href);
          finalizeSession('url-change');
        }
      }, URL_CHECK_INTERVAL);

      // METHOD 2 - Submit button click (event delegation on document).
      // Detects a click on: any element whose text contains "GET MY FREE",
      // a submit control, or any button/input inside a form.
      document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target || typeof target.closest !== 'function') return;

        // Match by visible button text (the CTA on vsl.rooferfuel.ai).
        const textEl = target.closest('button, a, input, [role="button"]');
        const text = (textEl && (textEl.innerText || textEl.value || '')) || '';
        const matchesText = text.toUpperCase().indexOf('GET MY FREE') !== -1;

        // Match any button/input inside a form.
        const formControl =
          target.closest('button, input[type="submit"], input[type="button"]') &&
          target.closest('form');

        if (matchesText || formControl) {
          console.log('[ConsentVault] submit click detected, text:', text);
          // Capture the screenshot of the form at submission time, then finalize.
          captureAndSendScreenshot('button_click');
          finalizeSession('submit-click');
        }
      }, true);

      // Native form submit (Enter key + programmatic submit).
      document.addEventListener('submit', () => {
        console.log('[ConsentVault] form submit event detected');
        captureAndSendScreenshot('form_submit');
        finalizeSession('form-submit');
      }, true);

      // METHOD 3 (fallback only) - page reload / navigation away.
      window.addEventListener('pagehide', () => {
        console.log('[ConsentVault] pagehide (fallback)');
        finalizeSession('pagehide');
      });
      window.addEventListener('beforeunload', () => {
        console.log('[ConsentVault] beforeunload (fallback)');
        finalizeSession('beforeunload');
      });
    } catch (error) {
      console.error('ConsentVault: initialization error:', error);
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
  `.trim();

  return new Response(recorderScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
