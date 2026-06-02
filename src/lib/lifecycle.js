// Order lifecycle state machine. Model every order this way, NOT as
// "open / closed" — every abnormal transition is the point money goes
// missing, and the state machine is where we wire the gates + audit.
//
// Happy path:   new → running → due → settled
// Exceptions:   void / reduce / replace / refund / reprint / recall
//
// Each exception transition requires a manager PIN + a reason. The PIN
// check lives in ManagerPinModal; the audit row is written from there.

export const STATES = {
  NEW:      'new',       // bill created, no lines yet
  RUNNING:  'running',   // ≥1 line, customer ordering
  DUE:      'due',       // customer asked for the bill
  SETTLED:  'settled',   // payment complete
  VOID:     'void',      // whole bill cancelled
};

export const HAPPY_PATH = [STATES.NEW, STATES.RUNNING, STATES.DUE, STATES.SETTLED];

// Exception transitions — every one of these is manager-gated + audit-logged.
export const EXCEPTIONS = {
  VOID:    'void',     // whole bill or line cancelled
  REDUCE:  'reduce',   // drop qty/amount on a placed line
  REPLACE: 'replace',  // swap a placed line for another item
  REFUND:  'refund',   // return money on a settled bill
  REPRINT: 'reprint',  // reprint a receipt (classic skim trick — log it)
  RECALL:  'recall',   // pull a settled bill back to editing
};

export function isOpen(bill) {
  if (!bill) return false;
  return bill.status === STATES.NEW
      || bill.status === STATES.RUNNING
      || bill.status === STATES.DUE;
}

export function isSettled(bill) {
  return bill?.status === STATES.SETTLED;
}

export function isVoid(bill) {
  return bill?.status === STATES.VOID;
}

// Auto-advance new → running once the first line is added.
export function advanceOnItem(status) {
  return status === STATES.NEW ? STATES.RUNNING : status;
}

// Treat legacy v1 statuses gracefully so existing IndexedDB rows still work.
export function normaliseStatus(raw) {
  if (raw === 'open')   return STATES.RUNNING;
  if (raw === 'closed') return STATES.SETTLED;
  if (raw === 'merged') return STATES.VOID;
  return raw;
}
