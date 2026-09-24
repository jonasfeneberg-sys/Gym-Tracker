
/**
 * ==========================================================================
 * Loadr | Track your exercise and overload progress
 * ==========================================================================
 * Fully functional, client-side, localStorage-backed workout progression app.
 * Fixed Timezone: Europe/London (handles GMT & BST).
 * 100% British English throughout.
 * ==========================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     APPLICATION STATE & STORAGE (JSON LocalStorage Layer)
     ========================================================================== */
  const STORAGE_KEY = 'irontrack_uk_gym_data';

  // Default state: starts completely empty with 0 pre-loaded exercises
  let state = {
    version: 2,
    settings: {
      overloadIncrement: 2.5, // Default overload step in kg (fully user-configurable in settings)
      timezone: 'Europe/London'
    },
    exercises: [] // Zero pre-loaded exercises; user builds library from scratch
  };

  // Map of active Chart.js instances by exercise ID
  const activeCharts = new Map();

  // Active exercise ID targeted by the OCR scanner modal
  let activeOcrExerciseId = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.settings && typeof parsed.settings === 'object') {
            state.settings = {
              overloadIncrement: parseFloat(parsed.settings.overloadIncrement) || 2.5,
              timezone: 'Europe/London'
            };
          }
          if (Array.isArray(parsed.exercises)) {
            state.exercises = parsed.exercises.map(ex => ({
              ...ex,
              overloadIncrement: Number.isFinite(parseFloat(ex.overloadIncrement)) && parseFloat(ex.overloadIncrement) > 0
                ? parseFloat(ex.overloadIncrement)
                : (parseFloat(parsed.settings?.overloadIncrement) || 2.5),
              sessions: Array.isArray(ex.sessions) ? ex.sessions : []
            }));
          }
        }
      }
    } catch (err) {
      console.error('Error loading data from localStorage:', err);
      showToast('Error reading saved data from storage', 'danger');
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStorageStatus(true);
    } catch (err) {
      console.error('Error saving data to localStorage:', err);
      updateStorageStatus(false);
      showToast('Failed to save data to storage', 'danger');
    }
  }

  function updateStorageStatus(isSaved) {
    const indicator = document.getElementById('storageStatusIndicator');
    if (indicator) {
      if (isSaved) {
        indicator.innerHTML = '<span class="status-dot"></span> Persistent JSON Saved';
        indicator.className = 'summary-value status-saved';
      } else {
        indicator.innerHTML = '<span class="status-dot" style="background: var(--accent-danger);"></span> Storage Error';
        indicator.className = 'summary-value status-error';
      }
    }
  }

  /* ==========================================================================
     UK TIMEZONE & LIVE CLOCK (Europe/London)
     ========================================================================== */
  function getTodayUkDate() {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(new Date());
    } catch (e) {
      const d = new Date();
      return d.toISOString().split('T')[0];
    }
  }

  function formatUkDate(dateVal) {
    if (!dateVal) return '';
    try {
      if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
        const parts = dateVal.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dateVal);
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(d);
    } catch (e) {
      return String(dateVal);
    }
  }

  function startUkClock() {
    const timeElem = document.getElementById('ukLiveTime');
    const dateElem = document.getElementById('ukLiveDate');

    function tick() {
      const now = new Date();
      try {
        const timeFormatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        });

        const dateFormatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });

        if (timeElem) timeElem.textContent = timeFormatter.format(now);
        if (dateElem) dateElem.textContent = dateFormatter.format(now);
      } catch (err) {
        console.warn('Clock format error:', err);
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ==========================================================================
     TOAST NOTIFICATION ENGINE
     ========================================================================== */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'danger') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(30px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
  /* ==========================================================================
     EXERCISE MANAGEMENT
     ========================================================================== */
  function addExercise(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Please enter an exercise name', 'danger');
      return;
    }

    const exists = state.exercises.some(
      ex => ex.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      showToast(`"${trimmed}" is already in your exercise list`, 'danger');
      return;
    }

    const newExercise = {
      id: 'ex_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: trimmed,
      createdAt: new Date().toISOString(),
      overloadIncrement: Number(state.settings.overloadIncrement) || 2.5,
      sessions: [] // Empty session history
    };

    state.exercises.unshift(newExercise);
    saveState();
    renderExercises();
    updateSummaryBar();
    showToast(`Added "${trimmed}" to your exercises`, 'success');
  }

  function deleteExercise(id) {
    const ex = state.exercises.find(e => e.id === id);
    if (!ex) return;

    const confirmed = window.confirm(
      `Are you sure you want to permanently remove "${ex.name}" and all of its logged history?`
    );
    if (!confirmed) return;

    if (activeCharts.has(id)) {
      try {
        activeCharts.get(id).destroy();
      } catch (e) {}
      activeCharts.delete(id);
    }

    state.exercises = state.exercises.filter(e => e.id !== id);
    saveState();
    renderExercises();
    updateSummaryBar();
    showToast(`Removed "${ex.name}"`, 'info');
  }

  /* ==========================================================================
     SESSION LOGGING & PROGRESSIVE OVERLOAD
     ========================================================================== */
  function logSession(exerciseId, date, weight, sets, reps) {
    const ex = state.exercises.find(e => e.id === exerciseId);
    if (!ex) return;

    const parsedWeight = parseFloat(weight);
    const parsedSets = parseInt(sets, 10);
    const parsedReps = parseInt(reps, 10);

    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      showToast('Please enter a valid weight in kg', 'danger');
      return;
    }
    if (isNaN(parsedSets) || parsedSets <= 0) {
      showToast('Please enter valid sets', 'danger');
      return;
    }
    if (isNaN(parsedReps) || parsedReps <= 0) {
      showToast('Please enter valid reps', 'danger');
      return;
    }

    const sessionEntry = {
      id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: date || getTodayUkDate(),
      weight: parsedWeight,
      sets: parsedSets,
      reps: parsedReps,
      timestamp: new Date().toISOString()
    };

    ex.sessions.push(sessionEntry);
    saveState();

    renderExerciseCard(ex);
    showToast(`Logged ${parsedWeight} kg (${parsedSets} sets × ${parsedReps} reps) for ${ex.name}`, 'success');
  }

  function deleteSession(exerciseId, sessionId) {
    const ex = state.exercises.find(e => e.id === exerciseId);
    if (!ex) return;

    const confirmed = window.confirm('Delete this logged session from history?');
    if (!confirmed) return;

    ex.sessions = ex.sessions.filter(s => s.id !== sessionId);
    saveState();
    renderExerciseCard(ex);
    showToast('Session entry deleted', 'info');
  }

  function updateSummaryBar() {
    const overloadPill = document.getElementById('globalOverloadPill');
    const machinesCount = document.getElementById('totalMachinesCount');

    if (overloadPill) {
      overloadPill.textContent = `+${state.settings.overloadIncrement} kg`;
    }
    if (machinesCount) {
      machinesCount.textContent = state.exercises.length;
    }
  }

  function renderExercises() {
    const emptyState = document.getElementById('emptyState');
    const grid = document.getElementById('exercisesGrid');
    const filterBar = document.getElementById('filterBar');
    const filterInput = document.getElementById('searchExercisesInput');

    if (state.exercises.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      if (grid) grid.style.display = 'none';
      if (filterBar) filterBar.style.display = 'none';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (grid) grid.style.display = 'flex';
    if (filterBar) filterBar.style.display = 'flex';

    grid.innerHTML = '';
    const query = filterInput ? filterInput.value.toLowerCase().trim() : '';

    const filtered = state.exercises.filter(ex => 
      ex.name.toLowerCase().includes(query)
    );

    const filterCount = document.getElementById('filterCount');
    if (filterCount) {
      filterCount.textContent = query 
        ? `Showing ${filtered.length} of ${state.exercises.length} exercises`
        : `Showing all ${state.exercises.length} exercises`;
    }

    filtered.forEach(ex => {
      const card = createExerciseCardElement(ex);
      grid.appendChild(card);
      if (ex.sessions && ex.sessions.length > 0) {
        renderChartForExercise(ex);
      }
    });
  }
  function createExerciseCardElement(ex) {
    const card = document.createElement('article');
    card.className = 'exercise-card';
    card.id = `card-${ex.id}`;

    const sessions = ex.sessions || [];
    const hasSessions = sessions.length > 0;

    // Each exercise has its own manually controlled overload increment.
    const increment = Number(ex.overloadIncrement) > 0 ? Number(ex.overloadIncrement) : 2.5;
    ex.overloadIncrement = increment;

    let overloadBadgeHtml = `
      <div class="overload-target-badge" title="This exercise's overload increment is set by you.">
        <span>Overload Increment:</span>
        <span class="target-highlight">+${increment} kg</span>
        ${hasSessions ? `<span class="target-separator">•</span><span>Next Target: <strong>${(Number(sessions[sessions.length - 1].weight) + increment).toFixed(1)} kg</strong></span>` : '<span class="target-muted">Set for this exercise</span>'}
      </div>
    `;

    // Default logging date to current UK date
    const defaultDate = getTodayUkDate();

    // Session History HTML
    let historyItemsHtml = '';
    if (hasSessions) {
      const reversedSessions = [...sessions].reverse();
      historyItemsHtml = reversedSessions.map(s => `
        <li class="history-item">
          <div class="history-meta">
            <span class="history-date">${formatUkDate(s.date)}</span>
            <span class="history-weight">${Number(s.weight).toFixed(1)} kg</span>
            <span class="history-sets-reps">${s.sets} sets × ${s.reps} reps</span>
          </div>
          <button type="button" class="btn-delete-entry" data-exercise-id="${ex.id}" data-session-id="${s.id}" title="Delete this entry">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </li>
      `).join('');
    } else {
      historyItemsHtml = `
        <li class="history-item" style="color: var(--text-muted); justify-content: center;">
          No sessions logged yet. Enter your first workout above to start tracking.
        </li>
      `;
    }

    // Chart container is ONLY rendered if at least 1 session has been logged
    const chartSectionHtml = hasSessions ? `
      <div class="chart-container" id="chart-wrap-${ex.id}">
        <div class="chart-header">
          <span class="chart-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            Weight Progression (kg)
          </span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono);">
            UK Timezone (Europe/London)
          </span>
        </div>
        <div class="chart-canvas-wrapper">
          <canvas id="chart-canvas-${ex.id}"></canvas>
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <div class="exercise-card-header">
        <div class="exercise-title-group">
          <h3 class="exercise-title">
            ${escapeHtml(ex.name)}
          </h3>
          ${overloadBadgeHtml}
        </div>
        <div class="exercise-actions">
          <button type="button" class="btn btn-danger-outline btn-sm btn-delete-exercise" data-id="${ex.id}" title="Permanently delete exercise">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Remove
          </button>
        </div>
      </div>

      <div class="exercise-overload-settings">
        <div class="exercise-overload-label">
          <span>Exercise Overload Increment</span>
          <span class="exercise-overload-hint">Manual • used for this exercise only</span>
        </div>
        <div class="exercise-overload-control">
          <input type="number" class="form-control form-control-sm exercise-overload-input" value="${increment}" min="0.25" max="50" step="0.25" aria-label="Overload increment for ${escapeHtml(ex.name)}" />
          <span class="exercise-overload-unit">kg</span>
          <button type="button" class="btn btn-secondary btn-sm btn-save-exercise-overload">Save</button>
        </div>
      </div>

      <form class="session-log-form" data-exercise-id="${ex.id}" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label for="date-${ex.id}">Date</label>
            <input type="date" id="date-${ex.id}" class="form-control form-control-sm input-date" value="${defaultDate}" required />
          </div>

          <div class="form-group">
            <label for="weight-${ex.id}">Weight (kg)</label>
            <div class="weight-input-group">
              <input type="number" id="weight-${ex.id}" class="form-control form-control-sm input-weight" step="0.25" min="0" placeholder="e.g. 50" required />
              <button type="button" class="btn-scan-ocr" data-exercise-id="${ex.id}" data-exercise-name="${escapeHtml(ex.name)}" title="Scan weight plate or machine stack with Camera OCR">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="sets-${ex.id}">Sets</label>
            <input type="number" id="sets-${ex.id}" class="form-control form-control-sm input-sets" min="1" step="1" value="3" required />
          </div>

          <div class="form-group">
            <label for="reps-${ex.id}">Reps</label>
            <input type="number" id="reps-${ex.id}" class="form-control form-control-sm input-reps" min="1" step="1" value="10" required />
          </div>

          <button type="submit" class="btn btn-primary btn-sm btn-log-session">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Log Session
          </button>
        </div>
      </form>

      ${chartSectionHtml}

      <div class="history-section">
        <div class="history-header-toggle">
          <span class="history-title">Session History (${sessions.length})</span>
        </div>
        <ul class="history-list">
          ${historyItemsHtml}
        </ul>
      </div>
    `;

    bindCardEvents(card, ex);
    return card;
  }

  function renderExerciseCard(ex) {
    const oldCard = document.getElementById(`card-${ex.id}`);
    if (!oldCard) {
      renderExercises();
      return;
    }
    const newCard = createExerciseCardElement(ex);
    oldCard.replaceWith(newCard);

    if (ex.sessions && ex.sessions.length > 0) {
      renderChartForExercise(ex);
    }
  }

  function bindCardEvents(card, ex) {
    const form = card.querySelector('.session-log-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const date = card.querySelector('.input-date').value;
        const weight = card.querySelector('.input-weight').value;
        const sets = card.querySelector('.input-sets').value;
        const reps = card.querySelector('.input-reps').value;
        logSession(ex.id, date, weight, sets, reps);
      });
    }

    const overloadInput = card.querySelector('.exercise-overload-input');
    const saveOverloadBtn = card.querySelector('.btn-save-exercise-overload');
    if (overloadInput && saveOverloadBtn) {
      const saveExerciseOverload = () => {
        const value = parseFloat(overloadInput.value);
        if (!Number.isFinite(value) || value <= 0) {
          showToast('Please enter a valid overload increment greater than 0', 'danger');
          overloadInput.value = ex.overloadIncrement;
          return;
        }
        ex.overloadIncrement = value;
        saveState();
        renderExerciseCard(ex);
        showToast(`Saved ${ex.name} overload increment: +${value} kg`, 'success');
      };
      saveOverloadBtn.addEventListener('click', saveExerciseOverload);
      overloadInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveExerciseOverload();
        }
      });
    }

    const scanBtn = card.querySelector('.btn-scan-ocr');
    if (scanBtn) {
      scanBtn.addEventListener('click', function () {
        openOcrModal(ex.id, ex.name);
      });
    }

    const deleteBtn = card.querySelector('.btn-delete-exercise');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        deleteExercise(ex.id);
      });
    }

    const deleteEntryBtns = card.querySelectorAll('.btn-delete-entry');
    deleteEntryBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const sId = this.dataset.sessionId;
        deleteSession(ex.id, sId);
      });
    });
  }
  /* ==========================================================================
     PROGRESS GRAPH (Chart.js via cdnjs pinned)
     ========================================================================== */
  function renderChartForExercise(ex) {
    const canvas = document.getElementById(`chart-canvas-${ex.id}`);
    if (!canvas || typeof Chart === 'undefined') return;

    const sessions = ex.sessions || [];
    if (sessions.length === 0) return;

    if (activeCharts.has(ex.id)) {
      try {
        activeCharts.get(ex.id).destroy();
      } catch (e) {}
      activeCharts.delete(ex.id);
    }

    const labels = [];
    const actualWeights = [];

    sessions.forEach((s) => {
      labels.push(formatUkDate(s.date));
      actualWeights.push(Number(s.weight));
    });

    // Projected Overload Target Dataset
    const projectedWeights = new Array(actualWeights.length).fill(null);
    const increment = Number(ex.overloadIncrement) > 0 ? Number(ex.overloadIncrement) : 2.5;
    const lastWeight = actualWeights[actualWeights.length - 1];
    const targetNextWeight = Number((lastWeight + increment).toFixed(1));

    projectedWeights[projectedWeights.length - 1] = lastWeight;
    labels.push(`Next Target (+${increment} kg)`);
    actualWeights.push(null);
    projectedWeights.push(targetNextWeight);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(155, 179, 199, 0.30)');
    gradient.addColorStop(1, 'rgba(155, 179, 199, 0.01)');

    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Logged Weight (kg)',
            data: actualWeights,
            borderColor: '#9bb3c7',
            backgroundColor: gradient,
            borderWidth: 2.5,
            pointBackgroundColor: '#9bb3c7',
            pointBorderColor: '#080c14',
            pointBorderWidth: 2,
            pointRadius: 4.5,
            pointHoverRadius: 6.5,
            tension: 0.25,
            fill: true
          },
          {
            label: 'Overload Target (kg)',
            data: projectedWeights,
            borderColor: '#7f9bad',
            borderWidth: 2,
            borderDash: [5, 5],
            pointBackgroundColor: '#7f9bad',
            pointBorderColor: '#080c14',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              color: '#aeb8c2',
              font: {
                family: "'Plus Jakarta Sans', sans-serif",
                size: 11
              }
            }
          },
          tooltip: {
            backgroundColor: '#0f1726',
            titleColor: '#ffffff',
            bodyColor: '#9bb3c7',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function (context) {
                if (context.parsed.y !== null) {
                  return `${context.dataset.label}: ${context.parsed.y} kg`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(255, 255, 255, 0.04)'
            },
            ticks: {
              color: '#68737e',
              font: {
                family: "'JetBrains Mono', monospace",
                size: 10
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.06)'
            },
            ticks: {
              color: '#68737e',
              font: {
                family: "'JetBrains Mono', monospace",
                size: 10
              },
              callback: val => `${val} kg`
            }
          }
        }
      }
    });

    activeCharts.set(ex.id, newChart);
  }

  /* ==========================================================================
     PHOTO WEIGHT DETECTION (OCR via Tesseract.js pinned from cdnjs)
     ========================================================================== */
  function openOcrModal(exerciseId, exerciseName) {
    activeOcrExerciseId = exerciseId;
    const modal = document.getElementById('ocrModal');
    const targetNameElem = document.getElementById('ocrTargetExerciseName');
    const confirmedInput = document.getElementById('ocrConfirmedWeightInput');
    const previewContainer = document.getElementById('ocrPreviewContainer');
    const dropzonePrompt = document.getElementById('ocrDropzonePrompt');
    const statusArea = document.getElementById('ocrStatusArea');
    const resultsArea = document.getElementById('ocrResultsArea');
    const detectedPills = document.getElementById('ocrDetectedPills');

    if (targetNameElem) targetNameElem.textContent = exerciseName;
    if (confirmedInput) confirmedInput.value = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (dropzonePrompt) dropzonePrompt.style.display = 'block';
    if (statusArea) statusArea.style.display = 'none';
    if (resultsArea) resultsArea.style.display = 'none';
    if (detectedPills) detectedPills.innerHTML = '';

    if (modal) modal.classList.add('active');
  }

  function closeOcrModal() {
    const modal = document.getElementById('ocrModal');
    if (modal) modal.classList.remove('active');
    activeOcrExerciseId = null;
  }

  async function processOcrImage(file) {
    if (!file) return;

    const previewContainer = document.getElementById('ocrPreviewContainer');
    const previewImage = document.getElementById('ocrPreviewImage');
    const dropzonePrompt = document.getElementById('ocrDropzonePrompt');
    const statusArea = document.getElementById('ocrStatusArea');
    const statusText = document.getElementById('ocrStatusText');
    const resultsArea = document.getElementById('ocrResultsArea');
    const detectedPills = document.getElementById('ocrDetectedPills');
    const confirmedInput = document.getElementById('ocrConfirmedWeightInput');

    const reader = new FileReader();
    reader.onload = async function (e) {
      if (previewImage) previewImage.src = e.target.result;
      if (previewContainer) previewContainer.style.display = 'block';
      if (dropzonePrompt) dropzonePrompt.style.display = 'none';
      if (statusArea) statusArea.style.display = 'flex';
      if (statusText) statusText.textContent = 'Scanning weight plate with Tesseract OCR...';

      try {
        if (typeof Tesseract === 'undefined') {
          throw new Error('Tesseract.js library not loaded');
        }

        const worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(e.target.result);
        await worker.terminate();

        const fullText = ret.data.text || '';
        statusArea.style.display = 'none';

        const numbersFound = parseWeightsFromText(fullText);

        if (numbersFound.length > 0) {
          resultsArea.style.display = 'block';
          detectedPills.innerHTML = '';

          confirmedInput.value = numbersFound[0];

          numbersFound.forEach((num, idx) => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = `ocr-pill ${idx === 0 ? 'active' : ''}`;
            pill.textContent = `${num} kg`;
            pill.addEventListener('click', () => {
              confirmedInput.value = num;
              detectedPills.querySelectorAll('.ocr-pill').forEach(p => p.classList.remove('active'));
              pill.classList.add('active');
            });
            detectedPills.appendChild(pill);
          });

          showToast(`Detected ${numbersFound[0]} kg from photo`, 'success');
        } else {
          resultsArea.style.display = 'block';
          detectedPills.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No clear numbers found. You can type the weight below manually.</span>';
        }
      } catch (err) {
        console.error('OCR Error:', err);
        if (statusArea) statusArea.style.display = 'none';
        showToast('Could not read weight from image. Please enter manually.', 'danger');
      }
    };
    reader.readAsDataURL(file);
  }

  function parseWeightsFromText(text) {
    const candidates = [];
    const regex = /(?:\b|\s|^)([0-9]{1,3}(?:[.,][0-9]{1,2})?)(?:\s*(?:kg|kgs|kilos|lbs))?(?:\b|\s|$)/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      let valStr = match[1].replace(',', '.');
      let val = parseFloat(valStr);
      if (!isNaN(val) && val >= 1 && val <= 500) {
        if (!candidates.includes(val)) {
          candidates.push(val);
        }
      }
    }
    return candidates;
  }

  function applyOcrWeight() {
    const confirmedInput = document.getElementById('ocrConfirmedWeightInput');
    const val = parseFloat(confirmedInput.value);

    if (isNaN(val) || val <= 0) {
      showToast('Please enter or select a valid weight', 'danger');
      return;
    }

    if (!activeOcrExerciseId) {
      closeOcrModal();
      return;
    }

    const targetCard = document.getElementById(`card-${activeOcrExerciseId}`);
    if (targetCard) {
      const weightInput = targetCard.querySelector('.input-weight');
      if (weightInput) {
        weightInput.value = val;
        weightInput.focus();
        showToast(`Applied ${val} kg to exercise`, 'success');
      }
    }

    closeOcrModal();
  }
  /* ==========================================================================
     SETTINGS PANEL & JSON PERSISTENCE
     ========================================================================== */
  function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const stepInput = document.getElementById('settingsOverloadInput');
    if (stepInput) {
      stepInput.value = state.settings.overloadIncrement;
    }
    if (modal) modal.classList.add('active');
  }

  function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.classList.remove('active');
  }

  function saveSettings() {
    const stepInput = document.getElementById('settingsOverloadInput');
    const val = parseFloat(stepInput.value);

    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid overload increment (greater than 0)', 'danger');
      return;
    }

    state.settings.overloadIncrement = val;
    saveState();
    updateSummaryBar();
    renderExercises();
    closeSettingsModal();
    showToast(`Saved overload increment: +${val} kg`, 'success');
  }

  function resetAllData() {
    const confirmed = window.confirm(
      'Are you sure you want to RESET ALL DATA? All exercises, weights, and session histories will be permanently deleted.'
    );
    if (!confirmed) return;

    activeCharts.forEach(c => c.destroy());
    activeCharts.clear();

    state.exercises = [];
    state.settings.overloadIncrement = 2.5;

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    saveState();
    updateSummaryBar();
    renderExercises();
    closeSettingsModal();
    showToast('All gym data reset to clean slate', 'info');
  }

  function exportJsonBackup() {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = getTodayUkDate();
      a.href = url;
      a.download = `irontrack-uk-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Downloaded JSON backup', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export JSON backup', 'danger');
    }
  }

  function importJsonBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid JSON format');
        }

        const confirmed = window.confirm(
          'Restore data from this JSON file? This will replace your current exercises and history.'
        );
        if (!confirmed) return;

        activeCharts.forEach(c => c.destroy());
        activeCharts.clear();

        if (parsed.settings) {
          state.settings = {
            overloadIncrement: parseFloat(parsed.settings.overloadIncrement) || 2.5,
            timezone: 'Europe/London'
          };
        }
        if (Array.isArray(parsed.exercises)) {
          state.exercises = parsed.exercises.map(ex => ({
            ...ex,
            overloadIncrement: Number.isFinite(parseFloat(ex.overloadIncrement)) && parseFloat(ex.overloadIncrement) > 0
              ? parseFloat(ex.overloadIncrement)
              : (parseFloat(parsed.settings?.overloadIncrement) || 2.5),
            sessions: Array.isArray(ex.sessions) ? ex.sessions : []
          }));
        }

        saveState();
        updateSummaryBar();
        renderExercises();
        closeSettingsModal();
        showToast('Gym data restored successfully from JSON', 'success');
      } catch (err) {
        console.error('Import error:', err);
        showToast('Invalid backup file. Restoration failed.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function initApp() {
    loadState();
    startUkClock();

    const addForm = document.getElementById('addExerciseForm');
    const addInput = document.getElementById('newExerciseInput');

    if (addForm) {
      addForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (addInput) {
          addExercise(addInput.value);
          addInput.value = '';
          addInput.focus();
        }
      });
    }

    const filterInput = document.getElementById('searchExercisesInput');
    if (filterInput) {
      filterInput.addEventListener('input', function () {
        renderExercises();
      });
    }

    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsModalBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const resetDataBtn = document.getElementById('resetDataBtn');
    const exportJsonBtn = document.getElementById('exportJsonBtn');
    const importFileInput = document.getElementById('importJsonFileInput');
    const triggerImportBtn = document.getElementById('triggerImportBtn');

    if (openSettingsBtn) openSettingsBtn.addEventListener('click', openSettingsModal);
    if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    if (resetDataBtn) resetDataBtn.addEventListener('click', resetAllData);
    if (exportJsonBtn) exportJsonBtn.addEventListener('click', exportJsonBackup);

    if (triggerImportBtn && importFileInput) {
      triggerImportBtn.addEventListener('click', () => importFileInput.click());
      importFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          importJsonBackup(e.target.files[0]);
        }
      });
    }

    const closeOcrBtn = document.getElementById('closeOcrModalBtn');
    const cancelOcrBtn = document.getElementById('cancelOcrBtn');
    const applyOcrBtn = document.getElementById('applyOcrWeightBtn');
    const ocrFileInput = document.getElementById('ocrFileInput');
    const ocrDropzone = document.getElementById('ocrDropzone');
    const ocrWeightMinus = document.getElementById('ocrWeightMinus');
    const ocrWeightPlus = document.getElementById('ocrWeightPlus');
    const ocrConfirmedInput = document.getElementById('ocrConfirmedWeightInput');
    const ocrRetakeBtn = document.getElementById('ocrRetakeBtn');

    if (closeOcrBtn) closeOcrBtn.addEventListener('click', closeOcrModal);
    if (cancelOcrBtn) cancelOcrBtn.addEventListener('click', closeOcrModal);
    if (applyOcrBtn) applyOcrBtn.addEventListener('click', applyOcrWeight);

    if (ocrRetakeBtn) {
      ocrRetakeBtn.addEventListener('click', () => {
        document.getElementById('ocrPreviewContainer').style.display = 'none';
        document.getElementById('ocrDropzonePrompt').style.display = 'block';
        document.getElementById('ocrResultsArea').style.display = 'none';
        if (ocrFileInput) ocrFileInput.value = '';
      });
    }

    if (ocrWeightMinus && ocrConfirmedInput) {
      ocrWeightMinus.addEventListener('click', () => {
        let val = parseFloat(ocrConfirmedInput.value) || 0;
        val = Math.max(0, val - 2.5);
        ocrConfirmedInput.value = val;
      });
    }
    if (ocrWeightPlus && ocrConfirmedInput) {
      ocrWeightPlus.addEventListener('click', () => {
        let val = parseFloat(ocrConfirmedInput.value) || 0;
        val = val + 2.5;
        ocrConfirmedInput.value = val;
      });
    }

    if (ocrFileInput) {
      ocrFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          processOcrImage(e.target.files[0]);
        }
      });
    }

    if (ocrDropzone) {
      ocrDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        ocrDropzone.style.borderColor = 'var(--accent-primary)';
      });
      ocrDropzone.addEventListener('dragleave', () => {
        ocrDropzone.style.borderColor = '';
      });
      ocrDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        ocrDropzone.style.borderColor = '';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processOcrImage(e.dataTransfer.files[0]);
        }
      });
    }

    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      });
    });

    updateSummaryBar();
    renderExercises();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();


/* PWA service-worker registration */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Loadr service worker registration failed:', error);
    });
  });
}
