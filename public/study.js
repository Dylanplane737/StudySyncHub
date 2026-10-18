/* StudySync Hub — private, local-first study tools. */
const STORE_KEY = 'studySyncHub.v1';
const DEFAULTS = {
  tasks: [],
  cards: [],
  notes: [],
  sessions: [],
  theme: 'dark',
  settings: { focusMinutes: 25, breakMinutes: 5, dailyTarget: 60 },
  timer: { mode: 'focus', remaining: 1500, running: false, endAt: null }
};
let state = loadState();
let activeView = 'overview';
let taskFilter = 'all';
let reviewIndex = 0;
let cardRevealed = false;
let timerInterval = null;
let toastTimeout = null;

function $(selector) { return document.querySelector(selector); }
function $$(selector) { return Array.from(document.querySelectorAll(selector)); }

function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return cloneDefaults();
    return {
      ...cloneDefaults(),
      ...saved,
      tasks: Array.isArray(saved.tasks) ? saved.tasks : [],
      cards: Array.isArray(saved.cards) ? saved.cards : [],
      notes: Array.isArray(saved.notes) ? saved.notes : [],
      sessions: Array.isArray(saved.sessions) ? saved.sessions : [],
      settings: { ...DEFAULTS.settings, ...(saved.settings || {}) },
      timer: { ...DEFAULTS.timer, ...(saved.timer || {}) }
    };
  } catch (error) {
    return cloneDefaults();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast('Could not save in this browser. Check local storage space or privacy settings.');
  }
}

function makeId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

function todayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function dueLabel(value) {
  if (!value) return 'No due date';
  const due = new Date(value + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return 'Due date set';
  const today = new Date();
  const offset = Math.round((due - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (offset === 0) return 'Due today';
  if (offset === 1) return 'Due tomorrow';
  if (offset === -1) return 'Due yesterday';
  if (offset < -1) return 'Overdue · ' + due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return 'Due ' + due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(function () { toast.classList.remove('show'); }, 2800);
}

function subjectLabel(subject) {
  return subject || 'General';
}

function priorityClass(priority) {
  return ['low', 'normal', 'high', 'urgent'].includes(priority) ? priority : 'normal';
}

function priorityLabel(priority) {
  const labels = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
  return labels[priority] || 'Normal';
}

function compareTasks(a, b) {
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  const dateA = a.dueDate || '9999-12-31';
  const dateB = b.dueDate || '9999-12-31';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  const rank = { urgent: 0, high: 1, normal: 2, low: 3 };
  return (rank[a.priority] || 2) - (rank[b.priority] || 2);
}

function taskHTML(task) {
  const due = task.dueDate ? dueLabel(task.dueDate) : 'No due date';
  return '<article class="task-item" data-task-id="' + escapeHTML(task.id) + '">' +
    '<label class="task-check" aria-label="' + (task.done ? 'Mark incomplete' : 'Mark complete') + '">' +
      '<input type="checkbox" data-action="toggle-task" data-id="' + escapeHTML(task.id) + '" ' + (task.done ? 'checked' : '') + ' aria-label="Complete task: ' + escapeHTML(task.title) + '">' +
      '<span class="custom-check" aria-hidden="true">✓</span>' +
    '</label>' +
    '<div class="task-main"><div class="task-title ' + (task.done ? 'done' : '') + '">' + escapeHTML(task.title) + '</div>' +
    '<div class="task-subline"><span>' + escapeHTML(subjectLabel(task.subject)) + '</span><span>·</span><span>' + escapeHTML(due) + '</span></div>' +
    (task.details ? '<div class="task-detail">' + escapeHTML(task.details) + '</div>' : '') +
    '</div><div class="task-side"><span class="priority ' + priorityClass(task.priority) + '">' + priorityLabel(task.priority) + '</span>' +
    '<button class="icon-btn" type="button" data-action="delete-task" data-id="' + escapeHTML(task.id) + '" aria-label="Delete task" title="Delete task">×</button></div></article>';
}

function renderTaskList(target, tasks, emptyTitle, emptyCopy) {
  if (!tasks.length) {
    target.innerHTML = '<div class="empty-state"><div class="empty-symbol">✓</div><strong>' + escapeHTML(emptyTitle) + '</strong><p>' + escapeHTML(emptyCopy) + '</p></div>';
    return;
  }
  target.innerHTML = tasks.map(taskHTML).join('');
}

function renderTasks() {
  const query = ($('#globalSearch').value || '').trim().toLowerCase();
  const filtered = state.tasks.filter(function (task) {
    const matchesStatus = taskFilter === 'all' || (taskFilter === 'active' && !task.done) || (taskFilter === 'done' && task.done);
    const haystack = [task.title, task.subject, task.details, task.dueDate].join(' ').toLowerCase();
    return matchesStatus && (!query || haystack.includes(query));
  }).slice().sort(compareTasks);
  renderTaskList($('#taskList'), filtered, query ? 'No matching tasks' : 'Your task list is clear', query ? 'Try another search or clear the search field.' : 'Add an assignment, revision goal, or reminder using the form.');
  $$('.filter-chip').forEach(function (button) {
    const active = button.dataset.filter === taskFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const openCount = state.tasks.filter(function (task) { return !task.done; }).length;
  $('#taskListCount').textContent = openCount + ' open · ' + state.tasks.length + ' total';
  $('#dashboardOpenCount').textContent = openCount + ' open · ' + state.tasks.length + ' total';
  $('#statOpenTasks').textContent = String(openCount);
  $('#statTaskHint').textContent = state.tasks.filter(function (task) { return task.done; }).length + ' completed so far';
}

function renderDashboard() {
  const openTasks = state.tasks.filter(function (task) { return !task.done; }).slice().sort(compareTasks);
  const todayMinutes = minutesStudiedToday();
  const doneTasks = state.tasks.filter(function (task) { return !!task.done; }).length;
  const percentage = state.tasks.length ? Math.round((doneTasks / state.tasks.length) * 100) : 0;
  $('#dashboardTaskProgress').style.width = percentage + '%';
  $('#dashboardTaskProgressText').textContent = doneTasks + ' of ' + state.tasks.length + ' tasks complete';
  $('#dashboardTaskPercent').textContent = percentage + '%';
  $('#welcomeDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (openTasks.length) {
    renderTaskList($('#dashboardTaskList'), openTasks.slice(0, 4), '', '');
  } else if (state.tasks.length) {
    renderTaskList($('#dashboardTaskList'), [], 'Everything is checked off', 'Nice — add another task whenever you are ready.');
  } else {
    $('#dashboardTaskList').innerHTML = '<div class="empty-state"><div class="empty-symbol">＋</div><strong>Start with one task</strong><p>Put your next assignment here so it is easy to find.</p><button class="button small primary" type="button" data-jump="tasks">Add a task</button></div>';
  }
  $('#statFocusMinutes').textContent = String(todayMinutes);
  $('#statFocusHint').textContent = todayMinutes === 0 ? 'Your first focus session starts at zero' : 'Minutes logged today';
  $('#statCards').textContent = String(state.cards.length);
  $('#statCardsHint').textContent = state.cards.length === 1 ? '1 saved flashcard' : 'Saved for quick review';
  $('#dashboardCardSummary').textContent = state.cards.length ? state.cards.length + (state.cards.length === 1 ? ' card ready to review' : ' cards ready to review') : 'Build a set for your next quiz';
  $('#dashboardMinutes').textContent = todayMinutes + ' min';
}

function minutesStudiedToday() {
  const today = todayKey(new Date());
  return state.sessions.filter(function (session) {
    return todayKey(session.at) === today;
  }).reduce(function (total, session) { return total + (Number(session.minutes) || 0); }, 0);
}

function renderMetrics() {
  const minutes = minutesStudiedToday();
  const target = Math.max(1, Number(state.settings.dailyTarget) || 60);
  const pct = Math.min(100, Math.round(minutes / target * 100));
  $('#sidebarFocusMinutes').textContent = String(minutes);
  $('#sidebarTargetMinutes').textContent = String(target);
  $('#sidebarProgress').style.width = pct + '%';
  $('#sidebarProgress').parentElement.setAttribute('aria-label', pct + '% of daily focus goal');
  $('#focusTodayMini').textContent = String(minutes);
  $('#focusSessionMinutes').textContent = String(minutes);
  $('#focusSessionCount').textContent = String(state.sessions.filter(function (session) { return todayKey(session.at) === todayKey(new Date()); }).length);
  const completed = state.cards.reduce(function (n, card) { return n + (Number(card.mastery) || 0); }, 0);
  $('#cardMasteryCount').textContent = String(completed);
}

function renderFlashcards() {
  const stage = $('#flashcardStage');
  const count = state.cards.length;
  $('#cardCountLabel').textContent = count + (count === 1 ? ' card saved' : ' cards saved');
  $('#cardPrev').disabled = count < 2;
  $('#cardNext').disabled = count < 2;
  $('#cardReveal').disabled = count === 0;
  $('#cardKnow').disabled = count === 0;
  $('#cardAgain').disabled = count === 0;
  if (!count) {
    stage.innerHTML = '<div class="empty-state"><div class="empty-symbol">▤</div><strong>No flashcards yet</strong><p>Add a question and answer on the left. Your cards stay in this browser.</p></div>';
    stage.setAttribute('aria-label', 'No flashcards saved');
    $('#cardCounter').textContent = '0 cards';
    $('#reviewCardSubject').textContent = 'Ready to learn';
  } else {
    reviewIndex = ((reviewIndex % count) + count) % count;
    const card = state.cards[reviewIndex];
    const face = cardRevealed ? card.back : card.front;
    stage.innerHTML = '<div class="flashcard-label">' + (cardRevealed ? 'ANSWER' : 'QUESTION') + '</div><div class="flashcard-text">' + escapeHTML(face) + '</div><div class="flashcard-hint">' + (cardRevealed ? 'Choose how well you know this one.' : 'Select the card or use Reveal answer.') + '</div>';
    stage.setAttribute('aria-label', (cardRevealed ? 'Answer: ' : 'Question: ') + card.front);
    $('#cardCounter').textContent = 'Card ' + (reviewIndex + 1) + ' of ' + count + ' · Mastery ' + (Number(card.mastery) || 0) + '/5';
    $('#reviewCardSubject').textContent = subjectLabel(card.subject);
  }
  const deck = $('#flashcardDeck');
  if (!count) {
    deck.innerHTML = '';
    return;
  }
  deck.innerHTML = '<div class="deck-heading">Your cards <span>' + count + '</span></div>' + state.cards.slice().reverse().slice(0, 8).map(function (card) {
    return '<div class="deck-row"><button class="deck-select" type="button" data-action="review-card" data-id="' + escapeHTML(card.id) + '"><strong>' + escapeHTML(card.front) + '</strong><small>' + escapeHTML(subjectLabel(card.subject)) + ' · mastery ' + (Number(card.mastery) || 0) + '/5</small></button><button class="icon-btn" type="button" data-action="delete-card" data-id="' + escapeHTML(card.id) + '" aria-label="Delete flashcard" title="Delete flashcard">×</button></div>';
  }).join('') + (count > 8 ? '<p class="panel-subtitle">Showing the 8 most recently added cards.</p>' : '');
}

function renderNotes() {
  const query = ($('#globalSearch').value || '').trim().toLowerCase();
  const notes = state.notes.filter(function (note) {
    return !query || [note.title, note.subject, note.body].join(' ').toLowerCase().includes(query);
  }).slice().sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
  $('#noteCountLabel').textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
  if (!notes.length) {
    $('#noteList').innerHTML = '<div class="empty-state"><div class="empty-symbol">✎</div><strong>' + (query ? 'No matching notes' : 'No notes saved yet') + '</strong><p>' + (query ? 'Try a different search term.' : 'Save a summary, tricky formula, vocabulary list, or reminder.') + '</p></div>';
    return;
  }
  $('#noteList').innerHTML = notes.map(function (note) {
    const date = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Just now';
    return '<article class="note-card"><div class="note-card-top"><div><h3>' + escapeHTML(note.title) + '</h3><div class="note-meta">' + escapeHTML(subjectLabel(note.subject)) + ' · Updated ' + escapeHTML(date) + '</div></div><div class="note-actions"><button class="text-button" type="button" data-action="edit-note" data-id="' + escapeHTML(note.id) + '">Edit</button><button class="text-button" type="button" data-action="delete-note" data-id="' + escapeHTML(note.id) + '" aria-label="Delete note">Delete</button></div></div><p>' + escapeHTML(note.body) + '</p></article>';
  }).join('');
}

function timerDuration(mode) {
  return (mode === 'break' ? Number(state.settings.breakMinutes) : Number(state.settings.focusMinutes)) * 60;
}

function currentRemaining() {
  if (state.timer.running && state.timer.endAt) return Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
  return Math.max(0, Number(state.timer.remaining) || 0);
}

function formatClock(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(mins).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function renderFocus() {
  const remaining = currentRemaining();
  const duration = Math.max(1, timerDuration(state.timer.mode));
  const progress = Math.min(100, Math.max(0, ((duration - remaining) / duration) * 100));
  $('#timerDisplay').textContent = formatClock(remaining);
  $('#miniTimerDisplay').textContent = formatClock(remaining);
  $('#timerModeLabel').textContent = state.timer.mode === 'break' ? 'Break time' : 'Focus session';
  $('#miniTimerMode').textContent = state.timer.mode === 'break' ? 'On a break' : 'Ready to focus';
  $('#timerRing').style.setProperty('--timer-progress', progress + '%');
  $('#miniTimerRing').style.setProperty('--timer-progress', progress + '%');
  $('#focusStart').textContent = state.timer.running ? 'Pause timer' : (state.timer.mode === 'break' ? 'Start break' : 'Start focus');
  $('#focusStart').classList.toggle('primary', !state.timer.running);
  $('#timerInstruction').textContent = state.timer.running ? 'Timer is running. You can switch pages and it will keep going.' : (state.timer.mode === 'break' ? 'Take a breather. When you are ready, start the break timer.' : 'Pick one task, silence distractions, and work until the timer ends.');
  $('#focusModeToggle').textContent = state.timer.mode === 'break' ? 'Switch to focus' : 'Switch to break';
}

function renderSettings() {
  $('#focusMinutesSetting').value = String(state.settings.focusMinutes);
  $('#breakMinutesSetting').value = String(state.settings.breakMinutes);
  $('#dailyTargetSetting').value = String(state.settings.dailyTarget);
  $('#themeSetting').textContent = state.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

function applyTheme() {
  document.body.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  $('#themeToggle').textContent = state.theme === 'light' ? '☾' : '☼';
  $('#themeToggle').setAttribute('aria-label', state.theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  $('#themeToggle').title = state.theme === 'light' ? 'Dark theme' : 'Light theme';
}

const VIEW_TITLES = {
  overview: ['YOUR WORKSPACE', 'Overview'],
  tasks: ['STAY ORGANIZED', 'Tasks'],
  cards: ['ACTIVE RECALL', 'Flashcards'],
  notes: ['YOUR KNOWLEDGE BASE', 'Notes'],
  focus: ['DEEP WORK', 'Focus timer'],
  settings: ['MAKE IT YOURS', 'Settings']
};

function setView(view) {
  if (!VIEW_TITLES[view]) return;
  activeView = view;
  $$('[data-view]').forEach(function (button) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('[data-page]').forEach(function (page) {
    page.classList.toggle('active', page.dataset.page === view);
  });
  $('#pageEyebrow').textContent = VIEW_TITLES[view][0];
  $('#pageTitle').textContent = VIEW_TITLES[view][1];
  if (view === 'focus') renderFocus();
  if (view === 'tasks') renderTasks();
  if (view === 'cards') renderFlashcards();
  if (view === 'notes') renderNotes();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  applyTheme();
  renderDashboard();
  renderTasks();
  renderFlashcards();
  renderNotes();
  renderFocus();
  renderMetrics();
  renderSettings();
}

function startTimer() {
  if (state.timer.running) {
    pauseTimer();
    return;
  }
  if (currentRemaining() <= 0) state.timer.remaining = timerDuration(state.timer.mode);
  state.timer.running = true;
  state.timer.remaining = currentRemaining();
  state.timer.endAt = Date.now() + (state.timer.remaining * 1000);
  saveState();
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = window.setInterval(tickTimer, 250);
  renderFocus();
}

function pauseTimer() {
  state.timer.remaining = currentRemaining();
  state.timer.running = false;
  state.timer.endAt = null;
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  saveState();
  renderFocus();
}

function resetTimer() {
  state.timer.running = false;
  state.timer.endAt = null;
  state.timer.remaining = timerDuration(state.timer.mode);
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  saveState();
  renderFocus();
}

function switchTimerMode() {
  if (state.timer.running) {
    state.timer.running = false;
    state.timer.endAt = null;
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
  }
  state.timer.mode = state.timer.mode === 'focus' ? 'break' : 'focus';
  state.timer.remaining = timerDuration(state.timer.mode);
  saveState();
  renderFocus();
}

function tickTimer() {
  if (!state.timer.running || !state.timer.endAt) return;
  const remaining = currentRemaining();
  if (remaining <= 0) {
    completeTimer();
    return;
  }
  state.timer.remaining = remaining;
  renderFocus();
}

function completeTimer() {
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  const completedMode = state.timer.mode;
  state.timer.running = false;
  state.timer.endAt = null;
  if (completedMode === 'focus') {
    state.sessions.push({ id: makeId('session'), at: new Date().toISOString(), minutes: Number(state.settings.focusMinutes) });
    state.timer.mode = 'break';
    state.timer.remaining = timerDuration('break');
    showToast('Focus session complete. Take a short break!');
  } else {
    state.timer.mode = 'focus';
    state.timer.remaining = timerDuration('focus');
    showToast('Break complete. Ready for another focus session?');
  }
  saveState();
  renderAll();
}

function exportData() {
  const payload = JSON.stringify({ app: 'StudySync Hub', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'study-sync-hub-backup-' + todayKey(new Date()) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Backup downloaded.');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function () {
    try {
      const parsed = JSON.parse(String(reader.result || ''));
      const imported = parsed.data || parsed;
      if (!imported || typeof imported !== 'object' || !Array.isArray(imported.tasks) || !Array.isArray(imported.cards) || !Array.isArray(imported.notes)) {
        throw new Error('That file does not look like a StudySync Hub backup.');
      }
      if (!window.confirm('Import this backup and replace the current StudySync Hub data on this device?')) return;
      state = {
        ...cloneDefaults(),
        ...imported,
        tasks: imported.tasks,
        cards: imported.cards,
        notes: imported.notes,
        sessions: Array.isArray(imported.sessions) ? imported.sessions : [],
        settings: { ...DEFAULTS.settings, ...(imported.settings || {}) },
        timer: { ...DEFAULTS.timer, ...(imported.timer || {}), running: false, endAt: null }
      };
      state.timer.remaining = Math.max(0, Number(state.timer.remaining) || timerDuration(state.timer.mode));
      saveState();
      renderAll();
      showToast('Backup imported.');
    } catch (error) {
      showToast(error.message || 'Could not import that file.');
    } finally {
      $('#importFile').value = '';
    }
  };
  reader.readAsText(file);
}

function saveSettings(event) {
  event.preventDefault();
  const focus = Number($('#focusMinutesSetting').value);
  const breakMinutes = Number($('#breakMinutesSetting').value);
  const target = Number($('#dailyTargetSetting').value);
  if (!Number.isFinite(focus) || focus < 5 || focus > 90 || !Number.isFinite(breakMinutes) || breakMinutes < 1 || breakMinutes > 30 || !Number.isFinite(target) || target < 15 || target > 600) {
    showToast('Use 5–90 focus minutes, 1–30 break minutes, and a 15–600 minute daily goal.');
    return;
  }
  state.settings = { focusMinutes: Math.round(focus), breakMinutes: Math.round(breakMinutes), dailyTarget: Math.round(target) };
  state.timer.running = false;
  state.timer.endAt = null;
  state.timer.mode = 'focus';
  state.timer.remaining = timerDuration('focus');
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  saveState();
  renderAll();
  showToast('Settings saved.');
}

function resetAllData() {
  const confirmed = window.confirm('Delete all tasks, flashcards, notes, and focus history saved by StudySync Hub on this browser? This cannot be undone unless you have a backup.');
  if (!confirmed) return;
  if (timerInterval) window.clearInterval(timerInterval);
  timerInterval = null;
  state = cloneDefaults();
  taskFilter = 'all';
  reviewIndex = 0;
  cardRevealed = false;
  localStorage.removeItem(STORE_KEY);
  $('#taskForm').reset();
  $('#cardForm').reset();
  $('#noteForm').reset();
  $('#noteEditingId').value = '';
  $('#cancelEditNote').classList.add('hidden');
  $('#saveNoteButton').textContent = 'Save note';
  renderAll();
  setView('overview');
  showToast('Local study data cleared.');
}

$('#taskForm').addEventListener('submit', function (event) {
  event.preventDefault();
  const title = $('#taskTitle').value.trim();
  if (!title) { $('#taskTitle').focus(); return; }
  state.tasks.push({
    id: makeId('task'),
    title: title,
    subject: $('#taskSubject').value,
    dueDate: $('#taskDueDate').value,
    priority: $('#taskPriority').value,
    details: $('#taskDetails').value.trim(),
    done: false,
    doneAt: null,
    createdAt: new Date().toISOString()
  });
  saveState();
  $('#taskForm').reset();
  $('#taskTitle').focus();
  renderAll();
  showToast('Task added.');
});

$('#taskList').addEventListener('change', function (event) {
  const input = event.target.closest('[data-action="toggle-task"]');
  if (!input) return;
  const task = state.tasks.find(function (item) { return item.id === input.dataset.id; });
  if (!task) return;
  task.done = input.checked;
  task.doneAt = task.done ? new Date().toISOString() : null;
  saveState();
  renderAll();
  showToast(task.done ? 'Task completed.' : 'Task reopened.');
});

function handleTaskAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'delete-task') {
    state.tasks = state.tasks.filter(function (task) { return task.id !== id; });
    saveState();
    renderAll();
    showToast('Task deleted.');
  }
}
$('#taskList').addEventListener('click', handleTaskAction);
$('#dashboardTaskList').addEventListener('click', handleTaskAction);

$('#taskFilters').addEventListener('click', function (event) {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  taskFilter = button.dataset.filter;
  renderTasks();
});

$('#cardForm').addEventListener('submit', function (event) {
  event.preventDefault();
  const front = $('#cardFrontInput').value.trim();
  const back = $('#cardBackInput').value.trim();
  if (!front || !back) return;
  state.cards.push({
    id: makeId('card'),
    subject: $('#cardSubject').value,
    front: front,
    back: back,
    mastery: 0,
    createdAt: new Date().toISOString()
  });
  reviewIndex = state.cards.length - 1;
  cardRevealed = false;
  saveState();
  $('#cardForm').reset();
  renderAll();
  showToast('Flashcard added.');
});

$('#flashcardStage').addEventListener('click', function () {
  if (!state.cards.length) return;
  cardRevealed = !cardRevealed;
  renderFlashcards();
});
$('#flashcardStage').addEventListener('keydown', function (event) {
  if ((event.key === 'Enter' || event.key === ' ') && state.cards.length) {
    event.preventDefault();
    cardRevealed = !cardRevealed;
    renderFlashcards();
  }
});
$('#cardReveal').addEventListener('click', function () {
  if (!state.cards.length) return;
  cardRevealed = !cardRevealed;
  renderFlashcards();
});
$('#cardPrev').addEventListener('click', function () {
  if (!state.cards.length) return;
  reviewIndex = (reviewIndex - 1 + state.cards.length) % state.cards.length;
  cardRevealed = false;
  renderFlashcards();
});
$('#cardNext').addEventListener('click', function () {
  if (!state.cards.length) return;
  reviewIndex = (reviewIndex + 1) % state.cards.length;
  cardRevealed = false;
  renderFlashcards();
});
$('#cardKnow').addEventListener('click', function () {
  if (!state.cards.length) return;
  const card = state.cards[reviewIndex];
  card.mastery = Math.min(5, (Number(card.mastery) || 0) + 1);
  reviewIndex = (reviewIndex + 1) % state.cards.length;
  cardRevealed = false;
  saveState();
  renderAll();
  showToast('Marked as known.');
});
$('#cardAgain').addEventListener('click', function () {
  if (!state.cards.length) return;
  const card = state.cards[reviewIndex];
  card.mastery = Math.max(0, (Number(card.mastery) || 0) - 1);
  reviewIndex = (reviewIndex + 1) % state.cards.length;
  cardRevealed = false;
  saveState();
  renderAll();
  showToast('Added another practice round.');
});

$('#flashcardDeck').addEventListener('click', function (event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'review-card') {
    const index = state.cards.findIndex(function (card) { return card.id === id; });
    if (index >= 0) {
      reviewIndex = index;
      cardRevealed = false;
      renderFlashcards();
    }
  }
  if (button.dataset.action === 'delete-card') {
    state.cards = state.cards.filter(function (card) { return card.id !== id; });
    reviewIndex = state.cards.length ? Math.min(reviewIndex, state.cards.length - 1) : 0;
    cardRevealed = false;
    saveState();
    renderAll();
    showToast('Flashcard deleted.');
  }
});

$('#noteForm').addEventListener('submit', function (event) {
  event.preventDefault();
  const title = $('#noteTitle').value.trim();
  const body = $('#noteBody').value.trim();
  if (!title || !body) return;
  const editingId = $('#noteEditingId').value;
  const now = new Date().toISOString();
  if (editingId) {
    const note = state.notes.find(function (item) { return item.id === editingId; });
    if (note) {
      note.title = title;
      note.subject = $('#noteSubject').value;
      note.body = body;
      note.updatedAt = now;
    }
    showToast('Note updated.');
  } else {
    state.notes.push({ id: makeId('note'), title: title, subject: $('#noteSubject').value, body: body, createdAt: now, updatedAt: now });
    showToast('Note saved.');
  }
  saveState();
  $('#noteForm').reset();
  $('#noteEditingId').value = '';
  $('#cancelEditNote').classList.add('hidden');
  $('#saveNoteButton').textContent = 'Save note';
  renderAll();
});

function handleNoteAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const note = state.notes.find(function (item) { return item.id === button.dataset.id; });
  if (!note) return;
  if (button.dataset.action === 'edit-note') {
    $('#noteEditingId').value = note.id;
    $('#noteTitle').value = note.title;
    $('#noteSubject').value = note.subject || 'Other';
    $('#noteBody').value = note.body;
    $('#saveNoteButton').textContent = 'Update note';
    $('#cancelEditNote').classList.remove('hidden');
    setView('notes');
    $('#noteTitle').focus();
  }
  if (button.dataset.action === 'delete-note') {
    state.notes = state.notes.filter(function (item) { return item.id !== note.id; });
    saveState();
    renderAll();
    showToast('Note deleted.');
  }
}
$('#noteList').addEventListener('click', handleNoteAction);
$('#cancelEditNote').addEventListener('click', function () {
  $('#noteForm').reset();
  $('#noteEditingId').value = '';
  $('#cancelEditNote').classList.add('hidden');
  $('#saveNoteButton').textContent = 'Save note';
});

$$('[data-view]').forEach(function (button) {
  button.addEventListener('click', function () { setView(button.dataset.view); });
});
document.addEventListener('click', function (event) {
  const button = event.target.closest('[data-jump]');
  if (button) setView(button.dataset.jump);
});

$('#globalSearch').addEventListener('input', function () {
  renderTasks();
  renderNotes();
});
$('#themeToggle').addEventListener('click', function () {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  saveState();
  applyTheme();
  renderSettings();
});
$('#themeSetting').addEventListener('click', function () {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  saveState();
  applyTheme();
  renderSettings();
});
$('#exportQuick').addEventListener('click', exportData);
$('#exportData').addEventListener('click', exportData);
$('#importFile').addEventListener('change', function (event) {
  importData(event.target.files && event.target.files[0]);
});
$('#settingsForm').addEventListener('submit', saveSettings);
$('#resetAllData').addEventListener('click', resetAllData);
$('#focusStart').addEventListener('click', startTimer);
$('#focusReset').addEventListener('click', resetTimer);
$('#focusModeToggle').addEventListener('click', switchTimerMode);
$('#miniTimerStart').addEventListener('click', function () {
  setView('focus');
  if (!state.timer.running) startTimer();
});
$('#globalSearch').addEventListener('keydown', function (event) {
  if (event.key === 'Escape') {
    event.target.value = '';
    renderTasks();
    renderNotes();
  }
});
window.addEventListener('keydown', function (event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    $('#globalSearch').focus();
  }
});

if (state.timer.running && state.timer.endAt) {
  timerInterval = window.setInterval(tickTimer, 250);
}
renderAll();
setView('overview');
tickTimer();
