import { CheckoutResult } from '../../../features/payments/checkout';
export default async function Page({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) { const p = await searchParams; return <CheckoutResult orderId={typeof p.orderId === 'string' ? p.orderId : ''}/>; }
