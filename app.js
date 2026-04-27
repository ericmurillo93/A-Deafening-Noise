const list = document.getElementById('concertList');
const upcomingList = document.getElementById('upcomingList');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const emptyState = document.getElementById('emptyState');
const historyCount = document.getElementById('historyCount');
const nextCount = document.getElementById('nextCount');

const normalize = value => value.toLocaleLowerCase('en').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const parseDate = value => {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match ? new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`) : new Date(0);
};

function renderUpcoming() {
  upcomingList.innerHTML = upcomingConcerts.map(item => `
    <article class="card">
      <h3>${item.artist}</h3>
      <div class="event"><span class="date">${item.date}</span></div>
    </article>
  `).join('');
  nextCount.textContent = `${upcomingConcerts.length} upcoming concerts`;
}

function cardTemplate(item) {
  return `
    <article class="card">
      <h3>${item.artist}</h3>
      ${item.events.map(([venue, date]) => `
        <div class="event">
          <span class="venue">${venue}</span>
          <span class="date">${date}</span>
        </div>
      `).join('')}
    </article>
  `;
}

function renderConcerts() {
  const query = normalize(searchInput.value.trim());
  const sort = sortSelect.value;
  let filtered = concerts.filter(item => normalize(`${item.artist} ${item.events.flat().join(' ')}`).includes(query));

  filtered.sort((a, b) => {
    if (sort === 'count') return b.events.length - a.events.length || a.artist.localeCompare(b.artist);
    if (sort === 'recent') return Math.max(...b.events.map(e => parseDate(e[1]))) - Math.max(...a.events.map(e => parseDate(e[1])));
    return a.artist.localeCompare(b.artist);
  });

  list.innerHTML = filtered.map(cardTemplate).join('');
  emptyState.hidden = filtered.length > 0;

  const totalEvents = concerts.reduce((sum, item) => sum + item.events.length, 0);
  historyCount.textContent = `${concerts.length} artists, ${totalEvents} concerts`;
}

searchInput.addEventListener('input', renderConcerts);
sortSelect.addEventListener('change', renderConcerts);
renderUpcoming();
renderConcerts();
