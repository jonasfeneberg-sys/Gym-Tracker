
/**
 * ==========================================================================
 * Loadr | Track your exercise and overload progress
 * ==========================================================================
 * Fully functional, client-side, localStorage-backed workout progression app.
 * Fixed Timezone: Europe/Berlin (handles CET & CEST automatically).
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
    version: 3,
    settings: {
      overloadIncrement: 2.5, // Default overload step for NEW exercises (kg)
      timezone: 'Europe/Berlin'
    },
    workoutDays: [], // [{id, name}] — named workout day groups
    exercises: []   // Zero pre-loaded; user builds library from scratch
  };

  // Map of active Chart.js instances by exercise ID
  const activeCharts = new Map();

  // Active exercise ID targeted by the OCR scanner modal
  let activeOcrExerciseId = null;

  // ID of the currently expanded exercise card (accordion — one at a time)
  let activeCardId = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.settings && typeof parsed.settings === 'object') {
            state.settings = {
              overloadIncrement: parseFloat(parsed.settings.overloadIncrement) || 2.5,
              timezone: 'Europe/Berlin'
            };
          }
          if (Array.isArray(parsed.workoutDays)) {
            state.workoutDays = parsed.workoutDays;
          }
          if (Array.isArray(parsed.exercises)) {
            state.exercises = parsed.exercises.map(ex => ({
              ...ex,
              workoutDayId: ex.workoutDayId || null,
              overloadIncrement:
                Number(ex.overloadIncrement) > 0
                  ? Number(ex.overloadIncrement)
                  : Number(parsed.settings?.overloadIncrement) || 2.5,
              overloadFrequency:
                Number(ex.overloadFrequency) > 0
                  ? Math.floor(Number(ex.overloadFrequency))
                  : 2,
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
     TIMEZONE & LIVE CLOCK (Europe/Berlin)
     ========================================================================== */
  function getTodayUkDate() {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
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
        timeZone: 'Europe/Berlin',
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
          timeZone: 'Europe/Berlin',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        });
        const dateFormatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Berlin',
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
     WORKOUT DAY MANAGEMENT
     ========================================================================== */
  function addWorkoutDay(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      showToast('Please enter a day name', 'danger');
      return;
    }
    const exists = state.workoutDays.some(d => d.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      showToast(`"${trimmed}" already exists`, 'danger');
      return;
    }
    state.workoutDays.push({
      id: 'day_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: trimmed
    });
    saveState();
    renderWorkoutDaysList();
    renderExercises();
    showToast(`Added workout day: ${trimmed}`, 'success');
  }

  function deleteWorkoutDay(dayId) {
    const day = state.workoutDays.find(d => d.id === dayId);
    if (!day) return;
    const confirmed = window.confirm(`Remove workout day "${day.name}"? Exercises in this group will become ungrouped.`);
    if (!confirmed) return;
    // Unassign exercises from this day
    state.exercises.forEach(ex => {
      if (ex.workoutDayId === dayId) ex.workoutDayId = null;
    });
    state.workoutDays = state.workoutDays.filter(d => d.id !== dayId);
    saveState();
    renderWorkoutDaysList();
    renderExercises();
    showToast(`Removed "${day.name}"`, 'info');
  }

  function renderWorkoutDaysList() {
    const container = document.getElementById('workoutDaysList');
    if (!container) return;
    if (state.workoutDays.length === 0) {
      container.innerHTML = '<p class="settings-tip" style="margin-bottom: 10px;">No workout days yet. Add one below to organise your exercises.</p>';
      return;
    }
    container.innerHTML = state.workoutDays.map(d => `
      <div class="workout-day-list-item">
        <span class="workout-day-list-name">${escapeHtml(d.name)}</span>
        <button type="button" class="btn btn-danger-outline btn-sm btn-delete-day" data-day-id="${d.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          Delete
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-delete-day').forEach(btn => {
      btn.addEventListener('click', function () {
        deleteWorkoutDay(this.dataset.dayId);
      });
    });
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
      workoutDayId: null,
      overloadIncrement: Number(state.settings.overloadIncrement) || 2.5,
      overloadFrequency: 2,
      sessions: []
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
      try { activeCharts.get(id).destroy(); } catch (e) {}
      activeCharts.delete(id);
    }

    if (activeCardId === id) activeCardId = null;

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

    // Group exercises by workout day
    const days = state.workoutDays || [];
    const dayMap = {};
    days.forEach(d => { dayMap[d.id] = []; });
    const ungrouped = [];

    filtered.forEach(ex => {
      if (ex.workoutDayId && dayMap[ex.workoutDayId] !== undefined) {
        dayMap[ex.workoutDayId].push(ex);
      } else {
        ungrouped.push(ex);
      }
    });

    function appendGroup(exercises, groupLabel) {
      if (exercises.length === 0) return;
      if (groupLabel) {
        const groupEl = document.createElement('div');
        groupEl.className = 'workout-day-group';
        groupEl.innerHTML = `
          <div class="workout-day-header">
            <span class="workout-day-name">${escapeHtml(groupLabel)}</span>
            <span class="workout-day-count">${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}</span>
          </div>
        `;
        grid.appendChild(groupEl);
      }
      exercises.forEach(ex => {
        grid.appendChild(createExerciseCardElement(ex));
      });
    }

    // Render named day groups first
    days.forEach(day => appendGroup(dayMap[day.id], day.name));

    // Render ungrouped (with "Ungrouped" label only if named days also exist)
    appendGroup(ungrouped, days.length > 0 && ungrouped.length > 0 ? 'Ungrouped' : null);
  }

  /* ==========================================================================
     SUGGESTED WEIGHT CALCULATION
     ========================================================================== */
  function getSuggestedWeight(ex) {
    const sessions = Array.isArray(ex.sessions) ? ex.sessions : [];
    if (sessions.length === 0) return '';

    const lastSession = sessions[sessions.length - 1];
    const lastWeight = Number(lastSession.weight);
    if (!Number.isFinite(lastWeight)) return '';

    const increment = Number(ex.overloadIncrement) > 0
      ? Number(ex.overloadIncrement)
      : Number(state.settings.overloadIncrement) || 2.5;

    const frequency = Number(ex.overloadFrequency) > 0
      ? Math.floor(Number(ex.overloadFrequency))
      : 2;

    const shouldIncrease = sessions.length % frequency === 0;
    const suggestedWeight = shouldIncrease ? lastWeight + increment : lastWeight;

    return Number(suggestedWeight.toFixed(2));
  }

  /* ==========================================================================
     EXERCISE CARD RENDERING
     ========================================================================== */
  function createExerciseCardElement(ex) {
    const card = document.createElement('article');
    card.className = 'exercise-card';
    card.id = `card-${ex.id}`;

    const sessions = ex.sessions || [];
    const hasSessions = sessions.length > 0;

    // Resolve per-exercise progression settings
    const increment = Number(ex.overloadIncrement) > 0
      ? Number(ex.overloadIncrement)
      : Number(state.settings.overloadIncrement) || 2.5;

    const frequency = Number(ex.overloadFrequency) > 0
      ? Math.floor(Number(ex.overloadFrequency))
      : 2;

    ex.overloadIncrement = increment;
    ex.overloadFrequency = frequency;

    const suggestedWeight = getSuggestedWeight(ex);

    // Overload status badges for the expanded header
    let overloadBadgeHtml = `
      <div class="overload-target-badge">
        <span>Increment:</span>
        <span class="target-highlight">+${increment} kg</span>
      </div>
    `;

    if (hasSessions) {
      const shouldIncrease = sessions.length % frequency === 0;
      const nextTarget = Number(suggestedWeight).toFixed(1);
      overloadBadgeHtml += `
        <div class="overload-badge">
          <span>${shouldIncrease ? 'Next Target' : 'Maintain'}</span>
          <strong>${nextTarget} kg${shouldIncrease ? ` (+${increment} kg)` : ''}</strong>
        </div>
      `;
    }

    const defaultDate = getTodayUkDate();

    // Session history HTML
    let historyItemsHtml = '';
    if (hasSessions) {
      historyItemsHtml = [...sessions].reverse().map(s => `
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

    // Chart section (only if sessions exist; lazy-rendered on first expand)
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
        </div>
        <div class="chart-canvas-wrapper">
          <canvas id="chart-canvas-${ex.id}"></canvas>
        </div>
      </div>
    ` : '';

    // Workout day selector (only if day groups exist)
    const dayOptions = state.workoutDays.map(d =>
      `<option value="${d.id}" ${ex.workoutDayId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
    ).join('');

    const dayRowHtml = state.workoutDays.length > 0 ? `
      <div class="overload-setting-row">
        <label for="day-${ex.id}">Workout Day</label>
        <div class="overload-input-with-unit">
          <select id="day-${ex.id}" class="form-control form-control-sm exercise-day-select">
            <option value="">— Ungrouped —</option>
            ${dayOptions}
          </select>
        </div>
      </div>
    ` : '';

    card.innerHTML = `
      <!-- COLLAPSED HEADER: always visible, click to expand/collapse -->
      <div class="exercise-card-header-row" role="button" tabindex="0" aria-expanded="false">
        <h3 class="exercise-title-collapsed">${escapeHtml(ex.name)}</h3>
        <div class="card-chevron" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      <!-- EXPANDED BODY: hidden by default, shown when card has .is-expanded -->
      <div class="exercise-card-body">
        <div class="exercise-card-header">
          <div class="exercise-title-group">
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
          <div class="overload-setting-row">
            <label for="overload-${ex.id}">Increment</label>
            <div class="overload-input-with-unit">
              <input type="number" id="overload-${ex.id}" class="form-control form-control-sm exercise-overload-input" value="${increment}" min="0.1" step="0.5" />
              <span class="overload-input-unit">kg</span>
            </div>
          </div>
          <div class="overload-setting-row">
            <label for="frequency-${ex.id}">Frequency</label>
            <div class="overload-input-with-unit">
              <input type="number" id="frequency-${ex.id}" class="form-control form-control-sm exercise-overload-frequency-input" value="${frequency}" min="1" step="1" />
              <span class="overload-input-unit">Workouts</span>
            </div>
          </div>
          ${dayRowHtml}
          <button type="button" class="btn btn-secondary btn-save-exercise-overload">Save</button>
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
                <input type="number" id="weight-${ex.id}" class="form-control form-control-sm input-weight" step="0.25" min="0" value="${suggestedWeight}" placeholder="e.g. 50" required />
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
      </div>
    `;

    // Wire up per-exercise overload + day save
    const overloadInput = card.querySelector('.exercise-overload-input');
    const frequencyInput = card.querySelector('.exercise-overload-frequency-input');
    const daySelect = card.querySelector('.exercise-day-select');
    const saveOverloadBtn = card.querySelector('.btn-save-exercise-overload');

    function saveExerciseOverload() {
      const incrementValue = parseFloat(overloadInput.value);
      const frequencyValue = parseInt(frequencyInput.value, 10);

      if (isNaN(incrementValue) || incrementValue <= 0) {
        showToast('Please enter a valid overload increment.', 'danger');
        return;
      }
      if (isNaN(frequencyValue) || frequencyValue < 1) {
        showToast('Please enter a valid workout frequency.', 'danger');
        return;
      }

      ex.overloadIncrement = incrementValue;
      ex.overloadFrequency = frequencyValue;
      if (daySelect) {
        ex.workoutDayId = daySelect.value || null;
      }

      saveState();
      renderExerciseCard(ex);
      showToast(`Saved +${incrementValue} kg every ${frequencyValue} workouts for ${ex.name}`, 'success');
    }

    if (saveOverloadBtn && overloadInput && frequencyInput) {
      saveOverloadBtn.addEventListener('click', saveExerciseOverload);
      overloadInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveExerciseOverload(); });
      frequencyInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveExerciseOverload(); });
    }

    bindCardEvents(card, ex);
    return card;
  }

  function renderExerciseCard(ex) {
    const oldCard = document.getElementById(`card-${ex.id}`);
    if (!oldCard) {
      renderExercises();
      return;
    }
    const wasActive = activeCardId === ex.id;
    const newCard = createExerciseCardElement(ex);
    oldCard.replaceWith(newCard);

    // Re-expand the card if it was open before (e.g. after logging a session)
    if (wasActive) {
      newCard.classList.add('is-expanded');
      const headerRow = newCard.querySelector('.exercise-card-header-row');
      if (headerRow) headerRow.setAttribute('aria-expanded', 'true');
      if (ex.sessions && ex.sessions.length > 0) {
        renderChartForExercise(ex);
      }
    }
  }

  function bindCardEvents(card, ex) {
    // Accordion toggle on collapsed header row
    const headerRow = card.querySelector('.exercise-card-header-row');
    if (headerRow) {
      const toggle = function () {
        const cardId = ex.id;
        if (activeCardId === cardId) {
          // Collapse this card
          card.classList.remove('is-expanded');
          headerRow.setAttribute('aria-expanded', 'false');
          activeCardId = null;
        } else {
          // Collapse previously active card
          if (activeCardId) {
            const prevCard = document.getElementById(`card-${activeCardId}`);
            if (prevCard) {
              prevCard.classList.remove('is-expanded');
              const prevHeader = prevCard.querySelector('.exercise-card-header-row');
              if (prevHeader) prevHeader.setAttribute('aria-expanded', 'false');
            }
          }
          // Expand this card
          card.classList.add('is-expanded');
          headerRow.setAttribute('aria-expanded', 'true');
          activeCardId = cardId;
          // Lazy-render chart on first open
          if (ex.sessions && ex.sessions.length > 0 && !activeCharts.has(ex.id)) {
            renderChartForExercise(ex);
          }
        }
      };

      headerRow.addEventListener('click', toggle);
      headerRow.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    }

    // Session log form submit
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

    // OCR camera scan button
    const scanBtn = card.querySelector('.btn-scan-ocr');
    if (scanBtn) {
      scanBtn.addEventListener('click', function () {
        openOcrModal(ex.id, ex.name);
      });
    }

    // Delete exercise button
    const deleteBtn = card.querySelector('.btn-delete-exercise');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        deleteExercise(ex.id);
      });
    }

    // Delete individual session buttons
    card.querySelectorAll('.btn-delete-entry').forEach(btn => {
      btn.addEventListener('click', function () {
        deleteSession(ex.id, this.dataset.sessionId);
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
      try { activeCharts.get(ex.id).destroy(); } catch (e) {}
      activeCharts.delete(ex.id);
    }

    const labels = [];
    const actualWeights = [];

    sessions.forEach(s => {
      labels.push(formatUkDate(s.date));
      actualWeights.push(Number(s.weight));
    });

    const projectedWeights = new Array(actualWeights.length).fill(null);

    const increment = Number(ex.overloadIncrement) > 0
      ? Number(ex.overloadIncrement)
      : Number(state.settings.overloadIncrement) || 2.5;

    const lastWeight = actualWeights[actualWeights.length - 1];
    const frequency = Number(ex.overloadFrequency) > 0
      ? Math.floor(Number(ex.overloadFrequency))
      : 2;

    const shouldIncrease = sessions.length % frequency === 0;
    const targetNextWeight = Number((lastWeight + (shouldIncrease ? increment : 0)).toFixed(1));

    projectedWeights[projectedWeights.length - 1] = lastWeight;
    labels.push(
      shouldIncrease
        ? `Next Target (+${increment} kg)`
        : 'Maintain Current Weight'
    );
    actualWeights.push(null);
    projectedWeights.push(targetNextWeight);

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(155, 179, 199, 0.30)');
    gradient.addColorStop(1, 'rgba(155, 179, 199, 0.01)');

    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
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
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              boxWidth: 12,
              color: '#aeb8c2',
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 }
            }
          },
          tooltip: {
            backgroundColor: '#0f1726',
            titleColor: '#f8fafc',
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
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#64748b', font: { family: "'JetBrains Mono', monospace", size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: {
              color: '#64748b',
              font: { family: "'JetBrains Mono', monospace", size: 10 },
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
      const valStr = match[1].replace(',', '.');
      const val = parseFloat(valStr);
      if (!isNaN(val) && val >= 1 && val <= 500) {
        if (!candidates.includes(val)) candidates.push(val);
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
    if (stepInput) stepInput.value = state.settings.overloadIncrement;
    renderWorkoutDaysList();
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
    closeSettingsModal();
    showToast(`Default overload increment set to +${val} kg`, 'success');
  }

  function resetAllData() {
    const confirmed = window.confirm(
      'Are you sure you want to RESET ALL DATA? All exercises, weights, and session histories will be permanently deleted.'
    );
    if (!confirmed) return;

    activeCharts.forEach(c => c.destroy());
    activeCharts.clear();
    activeCardId = null;

    state.exercises = [];
    state.workoutDays = [];
    state.settings.overloadIncrement = 2.5;

    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}

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
      a.download = `loadr-backup-${today}.json`;
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
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON format');

        const confirmed = window.confirm(
          'Restore data from this JSON file? This will replace your current exercises and history.'
        );
        if (!confirmed) return;

        activeCharts.forEach(c => c.destroy());
        activeCharts.clear();
        activeCardId = null;

        if (parsed.settings) {
          state.settings = {
            overloadIncrement: parseFloat(parsed.settings.overloadIncrement) || 2.5,
            timezone: 'Europe/Berlin'
          };
        }
        if (Array.isArray(parsed.workoutDays)) {
          state.workoutDays = parsed.workoutDays;
        }
        if (Array.isArray(parsed.exercises)) {
          state.exercises = parsed.exercises;
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

  /* ==========================================================================
     INITIALISATION
     ========================================================================== */
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

    // Settings modal
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
      importFileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) importJsonBackup(e.target.files[0]);
      });
    }

    // Workout day management (in settings)
    const addDayBtn = document.getElementById('addWorkoutDayBtn');
    const addDayInput = document.getElementById('newWorkoutDayInput');
    if (addDayBtn && addDayInput) {
      addDayBtn.addEventListener('click', () => {
        addWorkoutDay(addDayInput.value);
        addDayInput.value = '';
      });
      addDayInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addWorkoutDay(addDayInput.value);
          addDayInput.value = '';
        }
      });
    }

    // OCR modal events
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
        ocrConfirmedInput.value = Math.max(0, val - 2.5);
      });
    }
    if (ocrWeightPlus && ocrConfirmedInput) {
      ocrWeightPlus.addEventListener('click', () => {
        let val = parseFloat(ocrConfirmedInput.value) || 0;
        ocrConfirmedInput.value = val + 2.5;
      });
    }

    if (ocrFileInput) {
      ocrFileInput.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) processOcrImage(e.target.files[0]);
      });
    }

    if (ocrDropzone) {
      ocrDropzone.addEventListener('dragover', e => {
        e.preventDefault();
        ocrDropzone.style.borderColor = 'var(--accent-primary)';
      });
      ocrDropzone.addEventListener('dragleave', () => {
        ocrDropzone.style.borderColor = '';
      });
      ocrDropzone.addEventListener('drop', e => {
        e.preventDefault();
        ocrDropzone.style.borderColor = '';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          processOcrImage(e.dataTransfer.files[0]);
        }
      });
    }

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('active');
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
