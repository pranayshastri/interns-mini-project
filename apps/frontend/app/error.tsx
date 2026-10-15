'use client';
import { ErrorState } from '../components/feedback/states';
export default function Error({ reset }: { reset: () => void }) { return <ErrorState error="This page could not load. Please try again." retry={reset}/>; }
