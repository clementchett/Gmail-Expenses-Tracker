
export interface GmailMessage {
  id: string;
  snippet: string;
  body: string;
}

const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

export class GmailService {
  private accessToken: string | null = null;
  private client: any = null;

  constructor(private clientId: string) {}

  isLoaded(): boolean {
    return typeof window !== 'undefined' && !!(window as any).google?.accounts?.oauth2;
  }

  init(onTokenReceived: (token: string) => void, onError: (err: any) => void): boolean {
    if (!this.isLoaded()) return false;
    
    try {
      this.client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: this.clientId.trim(),
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            console.error("GSI Response Error:", response);
            onError(response);
            return;
          }
          if (response.access_token) {
            this.accessToken = response.access_token;
            onTokenReceived(response.access_token);
          }
        },
      });
      return true;
    } catch (e) {
      console.error("GSI Init Exception:", e);
      onError(e);
      return false;
    }
  }

  requestToken() {
    if (this.client) {
      try {
        // Using 'select_account' can help if multiple accounts are logged in
        this.client.requestAccessToken({ prompt: 'select_account' });
      } catch (e) {
        console.error("Token request failed", e);
      }
    }
  }

  private safeDecode(str: string): string {
    try {
      // Gmail uses URL-safe base64
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const binStr = atob(base64);
      const bytes = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (e) {
      console.warn("Base64 decode failed, falling back to raw string");
      return str;
    }
  }

  async fetchMessages(query: string = 'from:hdfcbank.net InstaAlert'): Promise<GmailMessage[]> {
    if (!this.accessToken) throw new Error('Not authenticated');

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=15`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    
    if (!listRes.ok) {
      const errorData = await listRes.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Gmail API error: ${listRes.status}`);
    }
    
    const listData = await listRes.json();
    if (!listData.messages) return [];

    const messages = await Promise.all(
      listData.messages.map(async (msg: any) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
            { headers: { Authorization: `Bearer ${this.accessToken}` } }
          );
          const detailData = await detailRes.json();
          
          let body = detailData.snippet;
          const extractBody = (payload: any): string => {
            if (payload.body?.data) return this.safeDecode(payload.body.data);
            if (payload.parts) {
              for (const part of payload.parts) {
                const b = extractBody(part);
                if (b) return b;
              }
            }
            return "";
          };

          const foundBody = extractBody(detailData.payload);
          return { id: msg.id, snippet: detailData.snippet, body: foundBody || detailData.snippet };
        } catch (e) {
          console.error(`Failed to fetch message details for ${msg.id}`, e);
          return null;
        }
      })
    );

    return messages.filter((m): m is GmailMessage => m !== null);
  }
}
