import { Catalog } from '../../features/catalog/catalog';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) { const p = await searchParams; return <Catalog query={typeof p.q === 'string' ? p.q : ''} category={typeof p.category === 'string' ? p.category : ''}/>; }
