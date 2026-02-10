
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

  init(onTokenReceived: (token: string) => void): boolean {
    if (!this.isLoaded()) {
      console.warn("Google Identity Services script not yet loaded.");
      return false;
    }
    
    try {
      this.client = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            this.accessToken = response.access_token;
            onTokenReceived(response.access_token);
          }
        },
      });
      return true;
    } catch (e) {
      console.error("Failed to initialize Gmail Client", e);
      return false;
    }
  }

  requestToken() {
    if (this.client) {
      this.client.requestAccessToken();
    } else {
      console.error("Gmail client not initialized. Call init() first.");
    }
  }

  private safeDecode(str: string): string {
    try {
      // Handle URL-safe base64 and potential padding issues
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(escape(atob(base64)));
    } catch (e) {
      console.warn("Base64 decode failed, falling back to snippet", e);
      return "";
    }
  }

  async fetchMessages(query: string = 'from:hdfcbank.net InstaAlert'): Promise<GmailMessage[]> {
    if (!this.accessToken) throw new Error('Not authenticated');

    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=15`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );
    
    if (!listRes.ok) throw new Error(`Gmail API error: ${listRes.statusText}`);
    const listData = await listRes.json();
    
    if (!listData.messages) return [];

    const messages = await Promise.all(
      listData.messages.map(async (msg: any) => {
        try {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
            {
              headers: { Authorization: `Bearer ${this.accessToken}` },
            }
          );
          const detailData = await detailRes.json();
          
          let body = detailData.snippet;
          if (detailData.payload) {
            const getBody = (payload: any): string => {
              if (payload.body?.data) return this.safeDecode(payload.body.data);
              if (payload.parts) {
                for (const part of payload.parts) {
                  const b = getBody(part);
                  if (b) return b;
                }
              }
              return "";
            };
            const extracted = getBody(detailData.payload);
            if (extracted) body = extracted;
          }

          return {
            id: msg.id,
            snippet: detailData.snippet,
            body: body
          };
        } catch (e) {
          console.error(`Error fetching message ${msg.id}`, e);
          return null;
        }
      })
    );

    return messages.filter((m): m is GmailMessage => m !== null);
  }
}
