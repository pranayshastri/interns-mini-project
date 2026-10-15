import { ProductEditor } from '../../../../../features/seller/workspace';
export default async function Page({ params }: { params: Promise<{ productId: string }> }) { return <ProductEditor id={(await params).productId}/>; }
