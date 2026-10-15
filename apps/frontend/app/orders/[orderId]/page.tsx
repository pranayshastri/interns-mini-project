import { OrderDetail } from '../../../features/orders/orders';
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) { return <OrderDetail id={(await params).orderId}/>; }
