import { google } from 'googleapis';
import type { IStorage } from '../storage';
import dayjs from 'dayjs';
import type { InsertItem, InsertGmailState } from '@shared/schema';

async function getUncachableGmailClient() {
  let connectionSettings: any;

  async function getAccessToken() {
    if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
      return connectionSettings.settings.access_token;
    }
    
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      throw new Error('X_REPLIT_TOKEN not found for repl/depl');
    }

    connectionSettings = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    ).then(res => res.json()).then(data => data.items?.[0]);

    const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

    if (!connectionSettings || !accessToken) {
      throw new Error('Gmail not connected');
    }
    return accessToken;
  }

  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export class GmailService {
  constructor(private storage: IStorage) {}

  async fetchRecentEmails(userId: string, maxResults: number = 50): Promise<string[]> {
    const gmail = await getUncachableGmailClient();
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:7d',
      maxResults: maxResults
    });

    const messageIds = response.data.messages?.map(msg => msg.id as string) || [];
    return messageIds;
  }

  async getMessageDetails(userId: string, messageId: string) {
    const gmail = await getUncachableGmailClient();
    
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date', 'Content-Type']
    });

    return response.data;
  }

  async syncUserGmail(userId: string): Promise<string[]> {
    const gmail = await getUncachableGmailClient();
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:7d'
    });

    const messageIds = response.data.messages?.map(msg => msg.id as string) || [];
    return messageIds;
  }
}

export { getUncachableGmailClient };
