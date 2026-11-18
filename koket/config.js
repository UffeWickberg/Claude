// Inställningar för köksskärmen.
// Nyckeln till proxyn skrivs INTE här – den anges en gång i adressen (?key=...)
// och sparas sedan på iPaden.
window.KOKET_CONFIG = {
  plats: 'Örebro',
  lat: 59.2741,
  lon: 15.2066,

  // Adressen till er Cloudflare Worker (se README.md), t.ex.
  // 'https://koket.ditt-namn.workers.dev'. Tom = demoläge med påhittade händelser.
  proxy: '',

  // Kalendrar som visas under "Idag". id måste matcha ICS_<ID> i Workern.
  kalendrar: [
    { id: 'familj', namn: 'Familjen', farg: '#f6c177' },
  ],

  // Kalendern som används för meddelanden till skärmen.
  meddelanden: 'meddelanden',

  // Nattläge (endast klockan, dämpat). Tryck på skärmen för att väcka den en stund.
  nattStart: 22,
  nattSlut: 6,
};
