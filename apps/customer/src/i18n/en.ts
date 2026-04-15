export const en = {
  // NfcLanding
  scanToOrder: 'Scan to order',
  scanToOrderSub: 'Tap the NFC tag on your table, or scan the QR code to start ordering.',
  tagNotFound: 'Table not found',
  tagNotFoundSub: 'This NFC tag is not registered. Please ask a member of staff for assistance.',
  tagInactive: 'Table not active',
  tagInactiveSub: 'This table is currently not taking orders. Please ask a member of staff for assistance.',
  noConnection: 'No connection',
  noConnectionSub: 'Please check your Wi-Fi connection and try again.',
  somethingWentWrong: 'Something went wrong',
  somethingWentWrongSub: 'Please try tapping the tag again or scan the QR code.',
  tryAgain: 'Try again',

  // Menu
  orders: 'Orders',
  viewOrder: 'View order',
  vip: 'VIP',
  couldNotLoadMenu: 'Could not load menu',
  retry: 'Retry',
  noItemsInCategory: 'No items in this category',

  // Cart
  yourOrder: 'Your order',
  specialRequests: 'Special requests',
  specialRequestsPlaceholder: 'e.g. No ice, extra lime...',
  total: 'Total',
  placeOrder: 'Place order',
  back: '←',
  cartEmpty: 'Your cart is empty',
  backToMenu: 'Back to menu',
  each: 'each',
  failedToPlaceOrder: 'Failed to place order. Please try again.',

  // Order status
  loadingOrder: 'Loading order...',
  orderNotFound: 'Order not found',
  estReady: 'Est. ready:',
  items: 'Items',
  reorder: 'Reorder',
  statusPending: 'Order received',
  statusAccepted: 'Accepted by staff',
  statusPreparing: 'Being prepared',
  statusReady: 'Ready for delivery',
  statusDelivered: 'Delivered!',
  statusCancelled: 'Cancelled',
  stepReceived: 'Received',
  stepAccepted: 'Accepted',
  stepMaking: 'Making',
  stepReady: 'Ready',
  stepDone: 'Done',

  // Order history
  yourOrders: 'Your orders',
  loading: 'Loading...',
  noOrdersYet: 'No orders yet',
  orderSomething: 'Order something',
  reorderTheSame: 'Reorder the same',
  ordering: 'Ordering...',
  more: 'more',
} as const;

export type TranslationKeys = typeof en;
