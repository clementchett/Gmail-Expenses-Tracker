
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

  init(onTokenReceived: (token: string) => void) {
    if (typeof window === 'undefined' || !(window as any).google) return;
    
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
  }

  requestToken() {
    if (this.client) {
      this.client.requestAccessToken();
    }
  }

  async fetchMessages(query: string = 'from:hdfcbank.net InstaAlert'): Promise<GmailMessage[]> {
    if (!this.accessToken) throw new Error('Not authenticated');

    // List messages
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );
    const listData = await listRes.json();
    
    if (!listData.messages) return [];

    // Fetch details for each message
    const messages = await Promise.all(
      listData.messages.map(async (msg: any) => {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
          {
            headers: { Authorization: `Bearer ${this.accessToken}` },
          }
        );
        const detailData = await detailRes.json();
        
        // Basic body extraction (handles simple text/plain parts)
        let body = detailData.snippet;
        if (detailData.payload && detailData.payload.parts) {
          const part = detailData.payload.parts.find((p: any) => p.mimeType === 'text/plain');
          if (part && part.body && part.body.data) {
            body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
        } else if (detailData.payload && detailData.payload.body && detailData.payload.body.data) {
           body = atob(detailData.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }

        return {
          id: msg.id,
          snippet: detailData.snippet,
          body: body
        };
      })
    );

    return messages;
  }
}
