import type { TranslationKeys } from './en.js';

export const hr: TranslationKeys = {
  // NfcLanding
  scanToOrder: 'Skeniraj za naručivanje',
  scanToOrderSub: 'Prisloni NFC tag na stolu ili skeniraj QR kod za naručivanje.',
  tagNotFound: 'Stol nije pronađen',
  tagNotFoundSub: 'Ovaj NFC tag nije registriran. Molimo obratite se osoblju.',
  tagInactive: 'Stol nije aktivan',
  tagInactiveSub: 'Ovaj stol trenutno ne prima narudžbe. Molimo obratite se osoblju.',
  noConnection: 'Nema veze',
  noConnectionSub: 'Provjerite Wi-Fi vezu i pokušajte ponovo.',
  somethingWentWrong: 'Nešto je pošlo po krivu',
  somethingWentWrongSub: 'Pokušajte ponovo prisloniti tag ili skenirati QR kod.',
  tryAgain: 'Pokušaj ponovo',

  // Menu
  orders: 'Narudžbe',
  viewOrder: 'Pogledaj narudžbu',
  vip: 'VIP',
  couldNotLoadMenu: 'Nije moguće učitati meni',
  retry: 'Pokušaj ponovo',
  noItemsInCategory: 'Nema stavki u ovoj kategoriji',

  // Cart
  yourOrder: 'Vaša narudžba',
  specialRequests: 'Posebni zahtjevi',
  specialRequestsPlaceholder: 'npr. Bez leda, extra limeta...',
  total: 'Ukupno',
  placeOrder: 'Naruči',
  back: '←',
  cartEmpty: 'Košarica je prazna',
  backToMenu: 'Natrag na meni',
  each: 'kom',
  failedToPlaceOrder: 'Narudžba nije uspjela. Pokušajte ponovo.',

  // Order status
  loadingOrder: 'Učitavam narudžbu...',
  orderNotFound: 'Narudžba nije pronađena',
  estReady: 'Procj. gotovo:',
  items: 'Stavke',
  reorder: 'Naruči ponovo',
  statusPending: 'Narudžba primljena',
  statusAccepted: 'Prihvaćeno od osoblja',
  statusPreparing: 'U pripremi',
  statusReady: 'Spremno za dostavu',
  statusDelivered: 'Dostavljeno!',
  statusCancelled: 'Otkazano',
  stepReceived: 'Primljeno',
  stepAccepted: 'Prihvaćeno',
  stepMaking: 'Priprema',
  stepReady: 'Spremno',
  stepDone: 'Gotovo',

  // Order history
  yourOrders: 'Vaše narudžbe',
  loading: 'Učitavam...',
  noOrdersYet: 'Još nema narudžbi',
  orderSomething: 'Naruči nešto',
  reorderTheSame: 'Naruči isto',
  ordering: 'Naručujem...',
  more: 'više',
};
