import { ProductDetail } from '../../../features/catalog/catalog';
export default async function Page({ params }: { params: Promise<{ productId: string }> }) { return <ProductDetail id={(await params).productId}/>; }
