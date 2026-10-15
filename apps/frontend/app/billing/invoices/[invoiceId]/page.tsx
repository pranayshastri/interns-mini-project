import { InvoicePage } from '../../../../features/billing/billing';
export default async function Page({params}: {params:Promise<{invoiceId:string}>}){return <InvoicePage id={(await params).invoiceId}/>;}
