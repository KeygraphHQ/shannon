const bulls = [
  {
    id: 'black-thunder',
    name: 'Black Thunder',
    breed: 'Boran Cross',
    marketBreed: 'Spanish Fighting Bull',
    weight: 780,
    location: 'Nakuru, Kenya',
    price: 450,
    available: 320,
    rating: '4.8',
    wins: 12,
    losses: 2,
    category: 'champion',
    image: 'images (3).jpg',
    imageAlt: 'Black bull standing in a dry arena',
    record: ['Win', 'Win', 'Win', 'Win', 'Win', 'Win'],
    description: 'A powerful Boran Cross bull with exceptional strength, stamina, and fighting spirit. Sired by a proven champion and raised in the rugged terrain of Nakuru.',
  },
  {
    id: 'iron-horn',
    name: 'Iron Horn',
    breed: 'Ankole-Watusi',
    marketBreed: 'Kenyan Ankole',
    weight: 720,
    location: 'Nakuru, Kenya',
    price: 450,
    available: 28,
    rating: '4.6',
    wins: 9,
    losses: 3,
    category: 'champion',
    image: '10.jpg',
    imageAlt: 'Two bulls competing in a sandy arena',
    record: ['Win', 'Win', 'Loss', 'Win', 'Win', 'Win'],
    description: 'A composed, hard-charging arena bull known for powerful turns and remarkable stamina.',
  },
  {
    id: 'midnight-warrior',
    name: 'Midnight Warrior',
    breed: 'Boran',
    marketBreed: 'Boran Fighting Bull',
    weight: 710,
    location: 'Nakuru, Kenya',
    price: 420,
    available: 64,
    rating: '4.7',
    wins: 10,
    losses: 2,
    category: 'rising',
    image: 'bull-fighting-mbale.jpg',
    imageAlt: 'Two bulls meeting head to head in a green field',
    record: ['Win', 'Win', 'Win', 'Loss', 'Win', 'Win'],
    description: 'A rising contender with a quick response and a strong early-season record.',
  },
  {
    id: 'red-fury',
    name: 'Red Fury',
    breed: 'Portuguese Cross',
    marketBreed: 'Portuguese Fighting Bull',
    weight: 680,
    location: 'Nakuru, Kenya',
    price: 390,
    available: 21,
    rating: '4.5',
    wins: 9,
    losses: 3,
    category: 'rising',
    image: 'bull-fighting-mbale.jpg',
    imageAlt: 'Two bulls meeting head to head in a grassy field',
    record: ['Win', 'Loss', 'Win', 'Win', 'Win', 'Win'],
    description: 'A crowd favorite building momentum after a string of strong performances.',
  },
];

const events = [
  {
    id: 'championship',
    type: 'championship',
    label: 'CHAMPIONSHIP',
    title: 'Kenya Championship Semi-Finals',
    venue: 'Kasarani Stadium',
    date: 'Sat, 22 May 2027',
    time: '4:00 PM EAT',
    description: 'Two epic semi-final clashes. One step closer to greatness. Witness the best bullfighters in Kenya battle for glory.',
    bulls: 'Simba wa Machakos, Mfalme wa Nakuru, Kijani Boy',
    price: 3500,
    image: 'images (2).jpg',
    imageAlt: 'Two bulls facing off before a crowd',
  },
  {
    id: 'underground',
    type: 'underground',
    label: 'UNDERGROUND',
    title: 'Nairobi Underground Bullfight',
    venue: 'Undisclosed Venue, Nairobi',
    date: 'Fri, 28 May 2027',
    time: '9:00 PM EAT',
    description: 'Raw. Real. Unfiltered. The underground scene brings the underground energy. Not for the faint-hearted.',
    bulls: 'Midnight Warrior, Red Fury',
    price: 2000,
    image: 'Bulls_Ishikawa,_Okinawa_2007.jpg',
    imageAlt: 'Bull preparing for a match in a traditional arena',
  },
  {
    id: 'nairobi-cup',
    type: 'championship',
    label: 'CHAMPIONSHIP',
    title: 'Nairobi Cup: The Final',
    venue: 'Kasarani Stadium',
    date: 'Sat, 12 June 2027',
    time: '5:30 PM EAT',
    description: 'The season finale brings the top-ranked contenders together for the Nairobi Cup.',
    bulls: 'Black Thunder, Iron Horn',
    price: 4500,
    image: 'images (3).jpg',
    imageAlt: 'Two bulls competing in a field',
  },
];

const holdings = [
  { bullId: 'black-thunder', shares: 45, averagePrice: 380, gain: '18.42%' },
  { bullId: 'iron-horn', shares: 45, averagePrice: 355, gain: '15.27%' },
];

const viewNames = ['market', 'portfolio', 'events', 'wallet', 'detail', 'profile'];
const balance = { bullCoin: 12500 };
const activity = [
  { type: 'in', title: 'Bought Bull Coin via M-Pesa', detail: 'M-Pesa · Simulated', amount: '+2,500 BC', date: 'Today, 9:30 AM' },
  { type: 'out', title: 'Bought shares in Black Thunder', detail: 'Shares · Simulated', amount: '-1,200 BC', date: 'Yesterday, 4:3 PM' },
  { type: 'out', title: 'Ticket purchase simulation', detail: 'Event Ticket · Demo', amount: '-800 BC', date: 'May 18, 2027 · 6:45 PM' },
];

let activeBullFilter = 'all';
let activeEventFilter = 'all';
let selectedBullId = bulls[0].id;
let toastTimeout;

function formatKes(amount) {
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

function showView(name) {
  if (!viewNames.includes(name)) return;
  for (const viewName of viewNames) {
    const section = document.querySelector(`#view-${viewName}`);
    const visible = viewName === name;
    section.hidden = !visible;
    section.classList.toggle('active', visible);
  }
  document.querySelectorAll('.nav-item').forEach((item) => {
    const selected = item.dataset.viewLink === name;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getBull(bullId) {
  return bulls.find((bull) => bull.id === bullId);
}

function renderBullList() {
  const container = document.querySelector('[data-bull-list]');
  const visibleBulls = activeBullFilter === 'all'
    ? bulls
    : bulls.filter((bull) => bull.category === activeBullFilter);
  container.innerHTML = visibleBulls.map((bull) => `
    <article class="bull-card">
      <button class="bull-card-image-button" type="button" data-open-bull="${bull.id}" aria-label="View ${bull.name}">
        <img src="./images/${encodeURIComponent(bull.image)}" alt="${bull.imageAlt}" loading="lazy" />
        <span class="verified-ribbon">♢ VERIFIED</span>
        <span class="rating">★ ${bull.rating}</span>
      </button>
      <div class="bull-card-body">
        <div class="bull-card-main">
          <h2>${bull.name}</h2>
          <p>Breed: ${bull.marketBreed}</p>
          <p class="gold-line">♧ &nbsp;Weight: ${bull.weight} kg</p>
          <p>⌖ &nbsp;${bull.location}</p>
          <div class="record-row"><span class="win-pill">♜ &nbsp;Win ${bull.wins}</span><span class="loss-pill">⚑ &nbsp;Loss ${bull.losses}</span></div>
        </div>
        <div class="bull-card-invest">
          <span class="verified-text">♢ Verified</span>
          <div class="share-price">Share Price<strong>${formatKes(bull.price)}</strong></div>
          <p>Available Shares: <strong>${bull.available}</strong></p>
          <button class="invest-button" type="button" data-invest="${bull.id}">Invest</button>
        </div>
      </div>
    </article>
  `).join('');
}

function renderPortfolio() {
  const container = document.querySelector('[data-holdings]');
  const populated = holdings.filter((holding) => holding.shares > 0);
  if (populated.length === 0) {
    container.innerHTML = '<p class="empty-state">No shares yet. Explore the Bull Market to find a fighter.</p>';
  } else {
    container.innerHTML = populated.map((holding) => {
      const bull = getBull(holding.bullId);
      const currentValue = holding.shares * bull.price;
      const gain = ((bull.price - holding.averagePrice) / holding.averagePrice) * 100;
      return `
        <article class="holding-card">
          <button type="button" class="holding-image-button" data-open-bull="${bull.id}" aria-label="View ${bull.name}"><img src="./images/${encodeURIComponent(bull.image)}" alt="${bull.imageAlt}" loading="lazy" /></button>
          <div class="holding-info">
            <button type="button" class="holding-name" data-open-bull="${bull.id}">${bull.name}</button>
            <p>${holding.shares} shares</p>
            <div class="holding-values">
              <div><span>Average Buy Price</span><strong>${formatKes(holding.averagePrice)}.00</strong></div>
              <div><span>Current Value</span><strong class="gold-value">${formatKes(currentValue)}</strong><em>↑ ${gain >= 0 ? '+' : ''}${gain.toFixed(2)}%</em></div>
            </div>
          </div>
          <button type="button" class="more-button" data-holding-menu="${bull.id}" aria-label="Sell ${bull.name} shares">⋮</button>
        </article>
      `;
    }).join('');
  }
  const total = populated.reduce((sum, holding) => sum + holding.shares * getBull(holding.bullId).price, 0);
  const totalCost = populated.reduce((sum, holding) => sum + holding.shares * holding.averagePrice, 0);
  const totalGain = totalCost ? ((total - totalCost) / totalCost) * 100 : 0;
  document.querySelector('[data-total-value]').textContent = formatKes(total);
  document.querySelector('[data-total-gain]').textContent = `${totalGain >= 0 ? '+' : ''}${totalGain.toFixed(2)}%`;
}

function renderEvents() {
  const container = document.querySelector('[data-event-list]');
  const visibleEvents = activeEventFilter === 'all'
    ? events
    : events.filter((event) => event.type === activeEventFilter);
  container.innerHTML = visibleEvents.map((event) => `
    <article class="event-card">
      <button class="event-cover" type="button" data-open-event="${event.id}" aria-label="View ${event.title}">
        <img src="./images/${encodeURIComponent(event.image)}" alt="${event.imageAlt}" loading="lazy" />
        <span class="event-ribbon">${event.label}</span>
      </button>
      <div class="event-card-body">
        <h2>${event.title}</h2>
        <p class="event-venue"><span>⌖</span> ${event.venue}</p>
        <div class="event-date"><span>▦</span><div>${event.date}<small>${event.time}</small></div></div>
        <p class="event-description">${event.description}</p>
        <p class="featured-bulls"><strong>Featured Bulls</strong><span><img class="inline-bull-icon" src="./bull-mark.svg" alt="" /> ${event.bulls}</span></p>
        <div class="ticket-row"><div>From<strong>${formatKes(event.price)}</strong></div><button class="get-ticket" type="button" data-book-event="${event.id}">Get Ticket <span>›</span></button></div>
      </div>
    </article>
  `).join('');
}

function renderBullDetail(bullId) {
  const bull = getBull(bullId);
  if (!bull) return;
  selectedBullId = bullId;
  const container = document.querySelector('[data-bull-detail]');
  container.innerHTML = `
    <img class="detail-cover" src="./images/${encodeURIComponent(bull.image)}" alt="${bull.imageAlt}" />
    <div class="detail-content">
      <h1 id="detail-title">${bull.name} <span class="verified-check">✓</span></h1>
      <p class="detail-meta"><span>♟ &nbsp;Breed: <strong>${bull.breed}</strong></span></p>
      <p class="detail-meta"><span>♧ &nbsp;${bull.weight} kg</span><span>⌖ &nbsp;${bull.location}</span></p>
      <div class="detail-stats"><div><span>Share Price</span><strong>${formatKes(bull.price)}</strong></div><div><span>Available</span><strong data-detail-available>${bull.available}</strong></div><div><span>Total Value</span><strong>KES 450k</strong></div></div>
      <div class="fight-record"><span>Fight Record</span>${bull.record.map((result) => `<span class="record-pill">${result}</span>`).join('')}</div>
      <div class="description-block"><span>Description</span><p>${bull.description}</p></div>
      <div class="buy-shares">
        <h2>Buy Shares</h2>
        <div class="quantity-row"><span>Quantity</span><div><button type="button" data-share-step="-1" aria-label="Decrease shares">−</button><output data-share-quantity>1</output><button type="button" data-share-step="1" aria-label="Increase shares">+</button></div></div>
        <div class="total-row"><span>Total</span><strong data-share-total>${formatKes(bull.price)}</strong></div>
        <div class="share-balance"><span>Ⓑ &nbsp;Balance: ${balance.bullCoin.toLocaleString('en-KE')} Bull Coin</span><span>${formatKes(bull.price)}</span></div>
        <button class="buy-shares-button" type="button" data-confirm-invest="${bull.id}">Ⓢ &nbsp; Buy 1 Share with Bull Coin <span>›</span></button>
      </div>
    </div>
  `;
}

function renderWallet() {
  document.querySelectorAll('[data-wallet-balance]').forEach((element) => {
    element.textContent = balance.bullCoin.toLocaleString('en-KE');
  });
  document.querySelectorAll('[data-wallet-kes]').forEach((element) => {
    element.textContent = balance.bullCoin.toLocaleString('en-KE');
  });
  document.querySelector('[data-activity-list]').innerHTML = activity.map((item) => `
    <div class="activity-item">
      <span class="activity-icon ${item.type}">${item.type === 'in' ? '↓' : '↑'}</span>
      <div class="activity-copy"><strong>${item.title}</strong><span>${item.detail}</span></div>
      <div class="activity-amount"><strong class="${item.type}">${item.amount}</strong><span>${item.date}</span></div>
    </div>
  `).join('');
}

function showToast(message) {
  const toast = document.querySelector('[data-toast]');
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function openDialog(content) {
  document.querySelector('[data-dialog-content]').innerHTML = content;
  document.querySelector('[data-checkout]').showModal();
}

function openInvestDialog(bullId) {
  const bull = getBull(bullId);
  if (!bull) return;
  renderBullDetail(bullId);
  showView('detail');
}

function updateShareQuantity(change) {
  const output = document.querySelector('[data-share-quantity]');
  const bull = getBull(selectedBullId);
  const quantity = Math.min(bull.available, Math.max(1, Number(output.value || output.textContent) + change));
  output.value = String(quantity);
  output.textContent = String(quantity);
  document.querySelector('[data-share-total]').textContent = formatKes(bull.price * quantity);
  document.querySelector('.buy-shares-button').innerHTML = `Ⓢ &nbsp; Buy ${quantity} Share${quantity === 1 ? '' : 's'} with Bull Coin <span>›</span>`;
}

function confirmInvestment(bullId) {
  const bull = getBull(bullId);
  const quantity = Number(document.querySelector('[data-share-quantity]').value);
  const cost = bull.price * quantity;
  if (quantity > bull.available) {
    showToast('There are not enough demo shares available.');
    return;
  }
  if (balance.bullCoin < cost) {
    showToast('Not enough demo Bull Coin. Add coins in the wallet.');
    return;
  }
  balance.bullCoin -= cost;
  bull.available -= quantity;
  const holding = holdings.find((item) => item.bullId === bullId);
  if (holding) {
    const totalShares = holding.shares + quantity;
    holding.averagePrice = Math.round(((holding.shares * holding.averagePrice) + cost) / totalShares);
    holding.shares = totalShares;
  } else {
    holdings.push({ bullId, shares: quantity, averagePrice: bull.price, gain: '0.00%' });
  }
  activity.unshift({
    type: 'out',
    title: `Bought ${quantity} ${bull.name} share${quantity === 1 ? '' : 's'}`,
    detail: 'Shares · Demo successful',
    amount: `-${cost.toLocaleString('en-KE')} BC`,
    date: 'Just now',
  });
  renderPortfolio();
  renderWallet();
  renderBullList();
  renderBullDetail(bullId);
  showToast(`Demo purchase complete: ${quantity} ${bull.name} share${quantity === 1 ? '' : 's'}.`);
}

function openEventDialog(eventId) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;
  openDialog(`
    <p class="eyebrow">${event.label} · ${event.date}</p>
    <h2>${event.title}</h2>
    <p>${event.venue}<br />${event.time}</p>
    <div class="dialog-meta"><span>Demo ticket price</span><strong>${formatKes(event.price)}</strong></div>
    <p>This prototype does not issue tickets or process payment.</p>
    <button class="button button-primary" type="button" data-confirm-ticket="${event.id}">Confirm demo booking</button>
  `);
}

function openWalletDialog(action) {
  if (action === 'topup') {
    openDialog(`
      <p class="eyebrow">DEMO WALLET</p><h2>Buy Bull Coin</h2>
      <p>Choose an amount to simulate adding Bull Coin. M-Pesa is not connected.</p>
      <div class="topup-options"><button type="button" data-topup="500">KES 500</button><button type="button" data-topup="1000">KES 1,000</button><button type="button" data-topup="2500">KES 2,500</button></div>
      <p class="demo-dialog-note">1 BC = KES 1 in this demo only.</p>
    `);
    return;
  }
  openDialog(`
    <p class="eyebrow">DEMO WALLET</p><h2>Pay Seller</h2>
    <p>Seller payments are not connected in this prototype. Your demo Bull Coin balance remains unchanged.</p>
    <button class="button button-primary" type="button" data-close-dialog>Got it</button>
  `);
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.viewLink) {
    showView(target.dataset.viewLink);
    return;
  }
  if (target.dataset.bullFilter) {
    activeBullFilter = target.dataset.bullFilter;
    document.querySelectorAll('[data-bull-filter]').forEach((button) => button.classList.toggle('selected', button === target));
    renderBullList();
    return;
  }
  if (target.dataset.eventFilter) {
    activeEventFilter = target.dataset.eventFilter;
    document.querySelectorAll('[data-event-filter]').forEach((button) => button.classList.toggle('selected', button === target));
    renderEvents();
    return;
  }
  if (target.dataset.openBull || target.dataset.invest) {
    openInvestDialog(target.dataset.openBull || target.dataset.invest);
    return;
  }
  if (target.dataset.holdingMenu) {
    const bull = getBull(target.dataset.holdingMenu);
    const holding = holdings.find((item) => item.bullId === bull.id);
    openDialog(`
      <p class="eyebrow">PORTFOLIO</p><h2>Sell ${bull.name} shares?</h2>
      <p>You hold ${holding.shares} demo shares. Choose to sell one at the sample market price.</p>
      <div class="dialog-meta"><span>Demo sale proceeds</span><strong>${formatKes(bull.price)} BC</strong></div>
      <button class="button button-primary" type="button" data-sell-share="${bull.id}">Simulate selling 1 share</button>
    `);
    return;
  }
  if (target.dataset.shareStep) {
    updateShareQuantity(Number(target.dataset.shareStep));
    return;
  }
  if (target.dataset.confirmInvest) {
    confirmInvestment(target.dataset.confirmInvest);
    return;
  }
  if (target.dataset.openEvent || target.dataset.bookEvent) {
    openEventDialog(target.dataset.openEvent || target.dataset.bookEvent);
    return;
  }
  if (target.dataset.confirmTicket) {
    const bookedEvent = events.find((item) => item.id === target.dataset.confirmTicket);
    document.querySelector('[data-checkout]').close();
    if (bookedEvent) showToast(`Demo booking recorded for ${bookedEvent.title}. No payment was made.`);
    return;
  }
  if (target.dataset.walletAction) {
    openWalletDialog(target.dataset.walletAction);
    return;
  }
  if (target.dataset.topup) {
    const amount = Number(target.dataset.topup);
    balance.bullCoin += amount;
    activity.unshift({
      type: 'in',
      title: 'Bought Bull Coin via M-Pesa',
      detail: 'Simulated top-up · Demo successful',
      amount: `+${amount.toLocaleString('en-KE')} BC`,
      date: 'Just now',
    });
    renderWallet();
    document.querySelector('[data-checkout]').close();
    showToast(`${amount.toLocaleString('en-KE')} demo Bull Coin added. No payment was made.`);
    return;
  }
  if (target.dataset.sellShare) {
    const bull = getBull(target.dataset.sellShare);
    const holding = holdings.find((item) => item.bullId === bull.id);
    if (!holding || holding.shares === 0) return;
    holding.shares -= 1;
    balance.bullCoin += bull.price;
    bull.available += 1;
    activity.unshift({
      type: 'in',
      title: `Sold 1 ${bull.name} share`,
      detail: 'Shares · Demo successful',
      amount: `+${bull.price.toLocaleString('en-KE')} BC`,
      date: 'Just now',
    });
    renderPortfolio();
    renderWallet();
    renderBullList();
    document.querySelector('[data-checkout]').close();
    showToast(`Demo sale complete. ${bull.price} BC added to your wallet.`);
    return;
  }
  if (target.hasAttribute('data-close-dialog')) {
    document.querySelector('[data-checkout]').close();
  }
});

renderBullList();
renderPortfolio();
renderEvents();
renderWallet();
renderBullDetail(selectedBullId);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.error('Bullfighter offline support could not be registered.', error);
    });
  });
}
