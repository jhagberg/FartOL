// Mock data for FartOL prototype

window.MOCK_COMPETITIONS = [
  {
    id: 'c1',
    name: 'Onsdagsträning v.20',
    date: '2026-05-13',
    status: 'live',
    starters: 28,
    finished: 11,
  },
  {
    id: 'c2',
    name: 'Klubbmästerskap 2026',
    date: '2026-04-22',
    status: 'done',
    starters: 64,
    finished: 64,
  },
  {
    id: 'c3',
    name: 'Vårserie etapp 3',
    date: '2026-04-08',
    status: 'done',
    starters: 41,
    finished: 39,
  },
];

window.MOCK_CLASSES = [
  {
    id: 'H21',
    name: 'H21',
    course: 'Lång svår',
    length: 6.4,
    climb: 110,
    controls: 14,
    starters: 6,
  },
  {
    id: 'D21',
    name: 'D21',
    course: 'Medel svår',
    length: 4.8,
    climb: 80,
    controls: 11,
    starters: 5,
  },
  {
    id: 'H45',
    name: 'H45',
    course: 'Medel svår',
    length: 4.8,
    climb: 80,
    controls: 11,
    starters: 4,
  },
  { id: 'D45', name: 'D45', course: 'Kort svår', length: 3.6, climb: 60, controls: 9, starters: 3 },
  {
    id: 'HD12',
    name: 'HD12',
    course: 'Kort lätt',
    length: 2.1,
    climb: 30,
    controls: 7,
    starters: 6,
  },
  {
    id: 'Öppen',
    name: 'Öppen Motion',
    course: 'Kort lätt',
    length: 2.1,
    climb: 30,
    controls: 7,
    starters: 4,
  },
];

// Control codes for "Lång svår" (H21) — used to render the course punch sequence
window.MOCK_COURSE_H21 = [
  { code: 31, expected: '00:48' },
  { code: 45, expected: '02:12' },
  { code: 52, expected: '04:31' },
  { code: 38, expected: '07:08' },
  { code: 61, expected: '09:54' },
  { code: 47, expected: '13:22' },
  { code: 33, expected: '16:11' },
  { code: 55, expected: '19:45' },
  { code: 42, expected: '22:08' },
  { code: 64, expected: '25:33' },
  { code: 39, expected: '28:01' },
  { code: 51, expected: '31:18' },
  { code: 36, expected: '34:42' },
  { code: 100, expected: '37:55' }, // finish
];

// A live feed of card reads (newest first). Each has match status + computed result.
window.MOCK_READS = [
  {
    cardNumber: 2078451,
    name: 'Erik Lindqvist',
    club: 'Stora Tuna OK',
    cls: 'H21',
    readTime: '14:32:11',
    startTime: '13:54:00',
    elapsed: '38:11',
    status: 'OK',
    place: 1,
    progress: { place: 1, finishedInClass: 2, startersInClass: 6, behind: null, behindLeg: 0 },
    punches: [
      { code: 31, time: '00:46', split: '00:46', ok: true, legRank: 1, lost: '+0:00' },
      { code: 45, time: '02:18', split: '01:32', ok: true, legRank: 2, lost: '+0:08' },
      { code: 52, time: '04:29', split: '02:11', ok: true, legRank: 1, lost: '+0:00' },
      { code: 38, time: '07:01', split: '02:32', ok: true, legRank: 3, lost: '+0:18' },
      { code: 61, time: '09:48', split: '02:47', ok: true, legRank: 1, lost: '+0:00' },
      { code: 47, time: '13:15', split: '03:27', ok: true, legRank: 2, lost: '+0:11' },
      { code: 33, time: '16:02', split: '02:47', ok: true, legRank: 1, lost: '+0:00' },
      { code: 55, time: '19:31', split: '03:29', ok: true, legRank: 2, lost: '+0:14' },
      { code: 42, time: '21:55', split: '02:24', ok: true, legRank: 1, lost: '+0:00' },
      { code: 64, time: '25:19', split: '03:24', ok: true, legRank: 1, lost: '+0:00' },
      { code: 39, time: '27:48', split: '02:29', ok: true, legRank: 2, lost: '+0:05' },
      { code: 51, time: '31:02', split: '03:14', ok: true, legRank: 1, lost: '+0:00' },
      { code: 36, time: '34:28', split: '03:26', ok: true, legRank: 1, lost: '+0:00' },
      {
        code: 100,
        time: '38:11',
        split: '03:43',
        ok: true,
        finish: true,
        legRank: 1,
        lost: '+0:00',
      },
    ],
  },
  {
    cardNumber: 8451209,
    name: 'Anna Persson',
    club: 'IK Stern',
    cls: 'D21',
    readTime: '14:28:54',
    startTime: '13:57:00',
    elapsed: '31:54',
    status: 'OK',
    place: 1,
    progress: { place: 1, finishedInClass: 1, startersInClass: 5, behind: null },
    punches: [
      { code: 31, time: '00:52', split: '00:52', ok: true, legRank: 1, lost: '+0:00' },
      { code: 45, time: '02:31', split: '01:39', ok: true, legRank: 1, lost: '+0:00' },
      { code: 38, time: '05:18', split: '02:47', ok: true, legRank: 1, lost: '+0:00' },
      { code: 61, time: '08:44', split: '03:26', ok: true, legRank: 1, lost: '+0:00' },
      { code: 47, time: '12:01', split: '03:17', ok: true, legRank: 1, lost: '+0:00' },
      { code: 33, time: '15:22', split: '03:21', ok: true, legRank: 1, lost: '+0:00' },
      { code: 55, time: '18:50', split: '03:28', ok: true, legRank: 1, lost: '+0:00' },
      { code: 42, time: '21:48', split: '02:58', ok: true, legRank: 1, lost: '+0:00' },
      { code: 39, time: '24:30', split: '02:42', ok: true, legRank: 1, lost: '+0:00' },
      { code: 51, time: '28:11', split: '03:41', ok: true, legRank: 1, lost: '+0:00' },
      {
        code: 100,
        time: '31:54',
        split: '03:43',
        ok: true,
        finish: true,
        legRank: 1,
        lost: '+0:00',
      },
    ],
  },
  {
    cardNumber: 2104883,
    name: 'Mikael Sjöberg',
    club: 'Stora Tuna OK',
    cls: 'H45',
    readTime: '14:25:17',
    startTime: '13:51:00',
    elapsed: '34:17',
    status: 'MP',
    place: null,
    missing: [55],
    progress: { place: null, finishedInClass: 1, startersInClass: 4, behind: null },
    punches: [
      { code: 31, time: '01:02', split: '01:02', ok: true, legRank: 2, lost: '+0:08' },
      { code: 45, time: '02:48', split: '01:46', ok: true, legRank: 3, lost: '+0:14' },
      { code: 38, time: '05:42', split: '02:54', ok: true, legRank: 2, lost: '+0:12' },
      { code: 61, time: '09:11', split: '03:29', ok: true, legRank: 2, lost: '+0:21' },
      { code: 47, time: '13:08', split: '03:57', ok: true, legRank: 3, lost: '+0:38' },
      { code: 33, time: '16:44', split: '03:36', ok: true, legRank: 2, lost: '+0:18' },
      { code: 55, time: '—', split: '—', ok: false, legRank: null, lost: null },
      { code: 42, time: '21:30', split: '04:46', ok: true, legRank: 4, lost: '+1:08' },
      { code: 39, time: '25:18', split: '03:48', ok: true, legRank: 3, lost: '+0:34' },
      { code: 51, time: '29:44', split: '04:26', ok: true, legRank: 2, lost: '+0:42' },
      {
        code: 100,
        time: '34:17',
        split: '04:33',
        ok: true,
        finish: true,
        legRank: 3,
        lost: '+0:28',
      },
    ],
  },
  {
    cardNumber: 7203881,
    name: 'Karin Lund',
    club: 'OK Tisaren',
    cls: 'D45',
    readTime: '14:22:03',
    startTime: '13:55:00',
    elapsed: '27:03',
    status: 'OK',
    place: 1,
    progress: { place: 1, finishedInClass: 2, startersInClass: 3, behind: null },
    punches: [
      { code: 31, time: '01:08', split: '01:08', ok: true, legRank: 1, lost: '+0:00' },
      { code: 52, time: '03:42', split: '02:34', ok: true, legRank: 1, lost: '+0:00' },
      { code: 38, time: '06:51', split: '03:09', ok: true, legRank: 1, lost: '+0:00' },
      { code: 47, time: '10:33', split: '03:42', ok: true, legRank: 1, lost: '+0:00' },
      { code: 33, time: '14:08', split: '03:35', ok: true, legRank: 1, lost: '+0:00' },
      { code: 42, time: '17:55', split: '03:47', ok: true, legRank: 1, lost: '+0:00' },
      { code: 39, time: '20:48', split: '02:53', ok: true, legRank: 1, lost: '+0:00' },
      { code: 36, time: '23:31', split: '02:43', ok: true, legRank: 1, lost: '+0:00' },
      {
        code: 100,
        time: '27:03',
        split: '03:32',
        ok: true,
        finish: true,
        legRank: 1,
        lost: '+0:00',
      },
    ],
  },
  {
    cardNumber: 2078122,
    name: 'Johan Berg',
    club: 'Stora Tuna OK',
    cls: 'H21',
    readTime: '14:18:44',
    startTime: '13:51:00',
    elapsed: '37:44',
    status: 'OK',
    place: 2,
    progress: { place: 2, finishedInClass: 2, startersInClass: 6, behind: '+0:27' },
    punches: [
      { code: 31, time: '00:51', split: '00:51', ok: true, legRank: 2, lost: '+0:05' },
      { code: 45, time: '02:29', split: '01:38', ok: true, legRank: 3, lost: '+0:14' },
      { code: 52, time: '04:48', split: '02:19', ok: true, legRank: 2, lost: '+0:08' },
      { code: 38, time: '07:22', split: '02:34', ok: true, legRank: 2, lost: '+0:02' },
      { code: 61, time: '10:11', split: '02:49', ok: true, legRank: 2, lost: '+0:02' },
      { code: 47, time: '13:42', split: '03:31', ok: true, legRank: 3, lost: '+0:04' },
      { code: 33, time: '16:33', split: '02:51', ok: true, legRank: 2, lost: '+0:04' },
      { code: 55, time: '20:02', split: '03:29', ok: true, legRank: 1, lost: '+0:00' },
      { code: 42, time: '22:40', split: '02:38', ok: true, legRank: 3, lost: '+0:14' },
      { code: 64, time: '26:01', split: '03:21', ok: true, legRank: 2, lost: '+0:03' },
      { code: 39, time: '28:38', split: '02:37', ok: true, legRank: 3, lost: '+0:08' },
      { code: 51, time: '31:55', split: '03:17', ok: true, legRank: 2, lost: '+0:03' },
      { code: 36, time: '34:10', split: '02:15', ok: true, legRank: 1, lost: '+0:00' },
      {
        code: 100,
        time: '37:44',
        split: '03:34',
        ok: true,
        finish: true,
        legRank: 1,
        lost: '+0:00',
      },
    ],
  },
  {
    cardNumber: 8451301,
    name: 'Lena Holm',
    club: 'IK Stern',
    cls: 'D45',
    readTime: '14:15:22',
    startTime: '13:49:00',
    elapsed: '26:22',
    status: 'OK',
    place: 2,
    progress: { place: 2, finishedInClass: 2, startersInClass: 3, behind: '+0:41' },
    punches: [
      { code: 31, time: '01:14', split: '01:14', ok: true, legRank: 2, lost: '+0:06' },
      { code: 52, time: '03:58', split: '02:44', ok: true, legRank: 2, lost: '+0:10' },
      { code: 38, time: '07:12', split: '03:14', ok: true, legRank: 2, lost: '+0:05' },
      { code: 47, time: '10:48', split: '03:36', ok: true, legRank: 1, lost: '+0:00' },
      { code: 33, time: '14:31', split: '03:43', ok: true, legRank: 2, lost: '+0:08' },
      { code: 42, time: '18:01', split: '03:30', ok: true, legRank: 2, lost: '+0:00' },
      { code: 39, time: '20:55', split: '02:54', ok: true, legRank: 2, lost: '+0:01' },
      { code: 36, time: '23:11', split: '02:16', ok: true, legRank: 2, lost: '+0:03' },
      {
        code: 100,
        time: '26:22',
        split: '03:11',
        ok: true,
        finish: true,
        legRank: 2,
        lost: '+0:08',
      },
    ],
  },
];

window.MOCK_RESULTS = {
  H21: [
    { place: 1, name: 'Erik Lindqvist', club: 'Stora Tuna OK', time: '38:11', status: 'OK' },
    {
      place: 2,
      name: 'Johan Berg',
      club: 'Stora Tuna OK',
      time: '27:44',
      status: 'OK',
      note: '(provis.)',
    },
    { place: null, name: 'Anders Norén', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Lars Hedman', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Patrik Ek', club: 'IK Stern', time: '—', status: 'PEND' },
    { place: null, name: 'Fredrik Olsson', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
  ],
  D21: [
    { place: 1, name: 'Anna Persson', club: 'IK Stern', time: '31:54', status: 'OK' },
    { place: null, name: 'Sara Lindgren', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Maja Sjögren', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Ida Wahlberg', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Hanna Östlund', club: 'IK Stern', time: '—', status: 'PEND' },
  ],
  H45: [
    { place: null, name: 'Mikael Sjöberg', club: 'Stora Tuna OK', time: '34:17', status: 'MP' },
    { place: null, name: 'Per Karlsson', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Tomas Vik', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Henrik Forss', club: 'IK Stern', time: '—', status: 'PEND' },
  ],
  D45: [
    { place: 1, name: 'Karin Lund', club: 'OK Tisaren', time: '27:03', status: 'OK' },
    {
      place: 2,
      name: 'Lena Holm',
      club: 'IK Stern',
      time: '26:22',
      status: 'OK',
      note: '(provis.)',
    },
    { place: null, name: 'Eva Sundberg', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
  ],
  HD12: [
    { place: null, name: 'Oskar Lund', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Stina Berg', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Linus Ek', club: 'IK Stern', time: '—', status: 'PEND' },
    { place: null, name: 'Wilma Norén', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Hugo Sjögren', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Alva Holm', club: 'IK Stern', time: '—', status: 'PEND' },
  ],
  Öppen: [
    { place: null, name: 'Bengt Andersson', club: 'Stora Tuna OK', time: '—', status: 'PEND' },
    { place: null, name: 'Marie Lund', club: '—', time: '—', status: 'PEND' },
    { place: null, name: 'Stefan Hellgren', club: 'OK Tisaren', time: '—', status: 'PEND' },
    { place: null, name: 'Karin Forss', club: '—', time: '—', status: 'PEND' },
  ],
};

// Consent status per competitor (REQ-PRIV-001):
//   - confirmed_on_entry  : signed up via Eventor, consent already on file
//   - pending_first_read  : imported from EntryList, needs operator confirmation on first read
//   - confirmed_on_read   : operator clicked Bekräfta in the toast
window.CONSENT_BY_CARD = {
  2078451: 'confirmed_on_entry',
  8451209: 'pending_first_read', // triggers the consent toast on read
  2104883: 'confirmed_on_entry',
  7203881: 'confirmed_on_entry',
  2078122: 'confirmed_on_read',
  8451301: 'confirmed_on_entry',
};

// Cards that have been read but not matched against the start list.
// Surface as a pending sidebar section on the readout view.
window.MOCK_PENDING_UNKNOWN = [9128344, 9482011];

window.CLUBS = [
  'Stora Tuna OK',
  'IK Stern',
  'OK Tisaren',
  'Falu OK',
  'Hagaby GoIF',
  'OK Linné',
  'Stora Tuna IK',
  'Smedjebackens OK',
  'Gagnefs OK',
  'Säters SK',
];

// ────────────────────────────────────────────────────────────────────────
// Phase 2.0 — 4-klubbs MVP mock state
// MeOS bridge (MIP/MOP), Eventor cache, Hyrbricka inventory.
// ────────────────────────────────────────────────────────────────────────

window.MOCK_PHASE2 = {
  // External integration status (mirrors what TweaksPanel renders in the real app)
  integrations: {
    meos: {
      status: 'ok', // 'ok' | 'stale' | 'offline'
      mipLastPollSec: 5, // seconds since MeOS's last GET /mip
      mopLastPushSec: 12, // seconds since MeOS's last POST /mop
      entriesSent: 28, // count of <entry> elements emitted since boot
      cmpReceived: 11, // count of <cmp> rows merged from MeOS
    },
    eventor: {
      status: 'ok', // 'ok' | 'stale' | 'offline' | 'no_key'
      cacheAgeDays: 3,
      competitorCount: 252919, // matches the real cachedcompetitors fixture
      cardCount: 96918,
      lastRefreshed: '2026-05-14 14:02',
    },
  },

  // Hyrbricka — uthyrda SI-kort med kontaktinfo. Demo populates a handful of
  // open + one returned to show both states of the toggle.
  hyrbrickor: [
    {
      cardNumber: 8501122,
      contactName: 'Familjen Lund',
      contactPhone: '070-555 12 34',
      contactEmail: null,
      note: 'Två barn — Oskar (HD12) + Wilma (HD12)',
      markedAt: '13:42',
      returnedAt: null,
    },
    {
      cardNumber: 8501123,
      contactName: 'Bengt Andersson',
      contactPhone: '070-555 22 11',
      contactEmail: 'bengt@example.com',
      note: null,
      markedAt: '13:58',
      returnedAt: null,
    },
    {
      cardNumber: 8501124,
      contactName: 'Marie Lund',
      contactPhone: null,
      contactEmail: 'marie@example.se',
      note: 'Glömt bricka hemma — vill ha tillbaka kort innan kl 16',
      markedAt: '14:11',
      returnedAt: null,
    },
    {
      cardNumber: 8501100,
      contactName: 'Lena Holm',
      contactPhone: '070-555 99 88',
      contactEmail: null,
      note: null,
      markedAt: '12:30',
      returnedAt: '14:05',
    },
  ],

  // Card-beep queue — what the registreringsdisk operator sees when the kids
  // line beeps four cards in a row before the operator can save the first.
  registrationQueue: [
    {
      cardNumber: 2104883,
      name: 'Stina Berg',
      club: 'Stora Tuna OK',
      cls: 'HD12',
      queuedAt: '14:31:48',
      age: 11,
      source: 'eventor',
    },
    {
      cardNumber: 7203881,
      name: 'Hugo Sjögren',
      club: 'Stora Tuna OK',
      cls: 'HD12',
      queuedAt: '14:31:52',
      age: 9,
      source: 'eventor',
    },
    {
      cardNumber: 8501122,
      name: '(hyrbricka)',
      club: null,
      cls: null,
      queuedAt: '14:31:55',
      age: null,
      source: 'rental',
    },
    {
      cardNumber: 9128344,
      name: null,
      club: null,
      cls: null,
      queuedAt: '14:32:01',
      age: null,
      source: 'unknown',
    },
  ],
};
