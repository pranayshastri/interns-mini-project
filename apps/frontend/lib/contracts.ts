// Baseline gateway types. Optional presentation fields are proposed extensions.
export type User = { id: string; fullName: string; phone?: string; email: string; role: string; shopId: string | null };
export type Product = { id: string; shopId: string; name: string; description: string; priceCents: number; availableStock: number; image?: string; category?: string; pack?: string; seller?: string };
export type CartItem = { productId: string; quantity: number };
export type OrderItem = CartItem & { shopId: string; unitPriceCents: number; name?: string };
export type Order = { id: string; customerId: string; status: string; totalAmountCents: number; createdAt: string; items?: OrderItem[]; shippingAddress?: string };
export type PaymentState = 'idle' | 'preparing' | 'provider-loading' | 'awaiting' | 'verifying' | 'captured' | 'failed' | 'dismissed' | 'delayed';
export type Payment = { orderId: string; state: PaymentState; reference?: string };
export type Quote = { items: OrderItem[]; subtotal: number; discount: number; delivery: number; tax: number; total: number; currency: 'INR'; expiresAt: string };
export type Notice = { id: string; title: string; body: string; createdAt: string; read: boolean; href: string };
export type Invoice = { id: string; orderId: string; seller: string; issuedAt: string; items: OrderItem[]; total: number; currency: 'INR'; billingAddress: string; paymentReference: string };
export type ProductInput = { name: string; description: string; priceCents: number; initialStock: number };
export type Config = { auth: boolean; capabilities: string[] };
export interface CommerceAdapter {
  products(): Promise<Product[]>;
  product(id: string): Promise<Product | null>;
  stock(id: string): Promise<number>;
  myProducts(): Promise<Product[]>;
  createProduct(input: ProductInput): Promise<Product>;
  updateProduct(id: string, input: Omit<ProductInput, 'initialStock'>): Promise<Product>;
  updateStock(id: string, delta: number): Promise<Product>;
  orders(seller?: boolean): Promise<Order[]>;
  order(id: string): Promise<Order | null>;
  createOrder(items: OrderItem[], shippingAddress: string): Promise<Order>;
  quote(items: CartItem[]): Promise<Quote>;
  payment(orderId: string): Promise<Payment>;
  pay(orderId: string, onState: (state: PaymentState) => void): Promise<Payment>;
  notifications(): Promise<Notice[]>;
  markRead(id: string): Promise<Notice>;
  invoices(orderId?: string): Promise<Invoice[]>;
  invoice(id: string): Promise<Invoice | null>;
}
export const money = (minor: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(minor / 100);
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
export function internalPath(value: string | null, fallback = '/profile') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || (value.includes('\\') || [...value].some(c => c.charCodeAt(0) <= 32))) return fallback;
  try { const url = new URL(value, 'https://robonest.invalid'); return url.origin === 'https://robonest.invalid' ? url.pathname + url.search + url.hash : fallback; } catch { return fallback; }
}
