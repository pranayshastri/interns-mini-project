export class AccountError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); this.name = 'AccountError'; }
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export async function accountRequest<T>(query: string, variables: Record<string, JsonValue> = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/graphql', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    let result;
    try { result = await response.json(); }
    catch {
      if (controller.signal.aborted) throw new Error('The account service took too long. Please try again.');
      throw new Error('We could not reach the account service. Please try again.');
    }
    const code = result.errors?.[0]?.extensions?.code || (response.status === 429 ? 'RATE_LIMITED' : response.status === 403 ? 'FORBIDDEN' : undefined);
    if (code === 'UNAUTHENTICATED' && typeof window !== 'undefined') window.dispatchEvent(new Event('robonest:expired'));
    if (!response.ok || result.errors?.length) throw new AccountError(result.errors?.[0]?.message || 'Something went wrong. Please try again.', code);
    if (!result.data) throw new AccountError('No data was returned. Please try again.', 'INVALID_RESPONSE');
    return result.data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The account service took too long. Please try again.', { cause: error });
    if (error instanceof TypeError) throw new Error('Cannot connect to the account service. Please try again.', { cause: error });
    throw error;
  } finally { clearTimeout(timeout); }
}
