(() => {
  'use strict';

  const localDb = new PouchDB('schema-a-movies');
  let remoteDb;
  let syncHandler;
  let editingId = null;
  let movies = [];

  const elements = {
    form: document.querySelector('#movie-form'),
    formHeading: document.querySelector('#form-heading'),
    formError: document.querySelector('#form-error'),
    title: document.querySelector('#title'),
    actors: document.querySelector('#actors'),
    genres: document.querySelector('#genres'),
    movieId: document.querySelector('#movie-id'),
    saveButton: document.querySelector('#save-button'),
    cancelEdit: document.querySelector('#cancel-edit'),
    list: document.querySelector('#movie-list'),
    empty: document.querySelector('#empty-state'),
    count: document.querySelector('#movie-count'),
    search: document.querySelector('#search-input'),
    status: document.querySelector('#sync-status'),
    remoteUrl: document.querySelector('#remote-url'),
    connect: document.querySelector('#connect-button'),
    refresh: document.querySelector('#refresh-button')
  };

  function setStatus(text, type) {
    elements.status.textContent = text;
    elements.status.className = `status status-${type}`;
  }

  function splitValues(value) {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  function displayValues(values) {
    return Array.isArray(values) ? values.join(', ') : '';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  async function loadMovies() {
    const result = await localDb.allDocs({ include_docs: true });
    movies = result.rows.map(row => row.doc)
      .filter(doc => doc && !doc._deleted && !doc._id.startsWith('_design/'))
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    renderMovies();
  }

  function renderMovies() {
    const query = elements.search.value.trim().toLowerCase();
    const filtered = movies.filter(movie => {
      const searchable = [movie.title, ...movie.actors || [], ...movie.genres || []].join(' ').toLowerCase();
      return searchable.includes(query);
    });

    elements.count.textContent = String(filtered.length);
    elements.empty.classList.toggle('hidden', filtered.length > 0);
    elements.list.innerHTML = filtered.map(movie => `
      <article class="movie">
        <h3>${escapeHtml(movie.title || 'Untitled movie')}</h3>
        <div>ID: ${escapeHtml(movie._id)}</div>
        <div>Genres: ${escapeHtml(displayValues(movie.genres) || 'None')}</div>
        <div>Actors: ${escapeHtml(displayValues(movie.actors) || 'None')}</div>
        <div class="movie-actions">
          <button class="text-button" data-action="edit" data-id="${escapeHtml(movie._id)}" type="button">Edit</button>
          <button class="text-button danger" data-action="delete" data-id="${escapeHtml(movie._id)}" type="button">Delete</button>
        </div>
      </article>
    `).join('');
  }

  function resetForm() {
    editingId = null;
    elements.form.reset();
    elements.formHeading.textContent = 'Add movie';
    elements.saveButton.textContent = 'Add movie';
    elements.movieId.disabled = false;
    elements.cancelEdit.classList.add('hidden');
    elements.formError.textContent = '';
  }

  function editMovie(movie) {
    editingId = movie._id;
    elements.title.value = movie.title || '';
    elements.actors.value = displayValues(movie.actors);
    elements.genres.value = displayValues(movie.genres);
    elements.movieId.value = movie._id;
    elements.movieId.disabled = true;
    elements.formHeading.textContent = 'Edit movie';
    elements.saveButton.textContent = 'Save changes';
    elements.cancelEdit.classList.remove('hidden');
    elements.title.focus();
  }

  async function saveMovie(event) {
    event.preventDefault();
    elements.formError.textContent = '';
    const title = elements.title.value.trim();
    if (!title) return;

    try {
      const doc = editingId ? await localDb.get(editingId) : {
        _id: elements.movieId.value.trim() || crypto.randomUUID()
      };
      doc.title = title;
      doc.actors = splitValues(elements.actors.value);
      doc.genres = splitValues(elements.genres.value);
      await localDb.put(doc);
      resetForm();
      await loadMovies();
    } catch (error) {
      elements.formError.textContent = `Could not save movie: ${error.message}`;
    }
  }

  async function deleteMovie(id) {
    try {
      const doc = await localDb.get(id);
      await localDb.remove(doc);
      await loadMovies();
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`, 'error');
    }
  }

  function startSync() {
    if (syncHandler) syncHandler.cancel();
    const url = elements.remoteUrl.value.trim();
    if (!url) {
      setStatus('Local only', 'offline');
      return;
    }

    remoteDb = new PouchDB(url);
    setStatus('Connecting…', 'syncing');
    syncHandler = localDb.sync(remoteDb, { live: true, retry: true })
      .on('change', () => loadMovies().catch(error => setStatus(`Refresh failed: ${error.message}`, 'error')))
      .on('paused', error => {
        if (error) setStatus(`Offline: ${error.message}`, 'offline');
        else setStatus(navigator.onLine ? 'Synced' : 'Offline', navigator.onLine ? 'synced' : 'offline');
      })
      .on('active', () => setStatus('Syncing…', 'syncing'))
      .on('error', error => setStatus(`Sync error: ${error.message}`, 'error'));
  }

  elements.form.addEventListener('submit', saveMovie);
  elements.cancelEdit.addEventListener('click', resetForm);
  elements.search.addEventListener('input', renderMovies);
  elements.refresh.addEventListener('click', () => loadMovies().catch(error => setStatus(`Refresh failed: ${error.message}`, 'error')));
  elements.connect.addEventListener('click', startSync);
  elements.list.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const movie = movies.find(item => item._id === button.dataset.id);
    if (!movie) return;
    if (button.dataset.action === 'edit') editMovie(movie);
    if (button.dataset.action === 'delete') deleteMovie(movie._id);
  });
  localDb.changes({ live: true, since: 'now' }).on('change', () => loadMovies().catch(error => setStatus(`Refresh failed: ${error.message}`, 'error')));
  window.addEventListener('online', startSync);
  window.addEventListener('offline', () => setStatus('Offline', 'offline'));

  loadMovies()
    .then(startSync)
    .catch(error => setStatus(`Local database error: ${error.message}`, 'error'));
})();
