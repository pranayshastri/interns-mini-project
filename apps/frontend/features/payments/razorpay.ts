import type { Payment, PaymentState } from '../../lib/contracts';
// Draft contract only. No live caller is wired until gateway capabilities are verified.
export type PaymentCheckout = { orderId: string; providerOrderId: string; publicKeyId: string; amount: number; currency: string; expiresAt?: string };
export type PaymentEvidence = { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string };
type ProviderResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type ProviderInstance = { open: () => void; close: () => void; on: (event: 'payment.failed', callback: () => void) => void };
type ProviderConstructor = new (options: { key: string; order_id: string; amount: number; currency: string; name: string; handler: (response: ProviderResponse) => void; modal: { ondismiss: () => void } }) => ProviderInstance;
declare global { interface Window { Razorpay?: ProviderConstructor } }
let scriptPromise: Promise<void> | null = null;
function loadProvider() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.async = true;
    const timer = setTimeout(() => fail(), 12000);
    function fail() { clearTimeout(timer); script.remove(); scriptPromise = null; reject(new Error('Payment checkout could not load. Check your connection and payment status.')); }
    script.onerror = fail; script.onload = () => { if (!window.Razorpay) return fail(); clearTimeout(timer); resolve(); };
    document.head.append(script);
  });
  return scriptPromise;
}
const attempts = new Map<string, Promise<Payment>>();
export function hostedCheckout(checkout: PaymentCheckout, verify: (evidence: PaymentEvidence) => Promise<Payment>, lookup: (orderId: string) => Promise<Payment>, onState: (state: PaymentState) => void): Promise<Payment> {
  const existing = attempts.get(checkout.orderId); if (existing) return existing;
  const attempt = run(); attempts.set(checkout.orderId, attempt); void attempt.finally(() => attempts.delete(checkout.orderId)).catch(() => undefined); return attempt;
  async function run(): Promise<Payment> {
    if (!Number.isSafeInteger(checkout.amount) || checkout.amount <= 0 || !checkout.providerOrderId || !checkout.publicKeyId || checkout.expiresAt && Date.parse(checkout.expiresAt) <= Date.now()) throw new Error('The payment session is invalid or expired. Request a fresh checkout.');
    onState('provider-loading'); await loadProvider();
    return new Promise<Payment>((resolve, reject) => {
      let settled = false; let reconciling = false;
      const delayed = () => ({ orderId: checkout.orderId, state: 'delayed' as const });
      const timeout = setTimeout(() => { if (!settled) { settled = true; instance.close(); onState('delayed'); resolve(delayed()); } }, 300000);
      function finish(payment: Payment) { if (settled) return; settled = true; clearTimeout(timeout); onState(payment.state); resolve(payment); }
      async function reconcile(evidence?: ProviderResponse) {
        if (settled || reconciling) return; reconciling = true; onState('verifying');
        try {
          if (evidence) {
            if (evidence.razorpay_order_id !== checkout.providerOrderId) throw new Error('Payment association mismatch.');
            await verify({ orderId: checkout.orderId, razorpayOrderId: evidence.razorpay_order_id, razorpayPaymentId: evidence.razorpay_payment_id, razorpaySignature: evidence.razorpay_signature });
          }
          // A provider callback never establishes captured status. Reconcile with gateway.
          finish(await lookup(checkout.orderId));
        } catch { finish(delayed()); }
      }
      const instance = new window.Razorpay!({ key: checkout.publicKeyId, order_id: checkout.providerOrderId, amount: checkout.amount, currency: checkout.currency, name: 'RoboNest', handler: evidence => { void reconcile(evidence); }, modal: { ondismiss: () => { onState('dismissed'); void reconcile(); } } });
      instance.on('payment.failed', () => { void reconcile(); });
      try { onState('awaiting'); instance.open(); } catch(error) { clearTimeout(timeout); reject(error); }
    });
  }
}
