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

  private parseEmailForActionItems(message: any): {
    category: 'invite' | 'deadline' | 'action' | 'pr_review' | 'other';
    subject: string;
    from: string;
    date: string;
    snippet: string;
  } {
    const headers = message.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
    const from = headers.find((h: any) => h.name === 'From')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';
    const snippet = message.snippet ? message.snippet.substring(0, 200) : '';

    const subjectLower = subject.toLowerCase();

    let category: 'invite' | 'deadline' | 'action' | 'pr_review' | 'other' = 'other';

    if (subjectLower.includes('pull request') || subjectLower.includes('review requested') || subjectLower.includes('[repo]')) {
      category = 'pr_review';
    } else if (subjectLower.includes('action required') || subjectLower.includes('follow up') || subjectLower.includes('reply') || subjectLower.includes('respond')) {
      category = 'action';
    } else if (subjectLower.includes('deadline') || subjectLower.includes('due') || subjectLower.includes('submit') || subjectLower.includes('by')) {
      category = 'deadline';
    } else if (subjectLower.includes('invitation') || subjectLower.includes('event') || subjectLower.includes('meeting') || subjectLower.includes('rsvp') || subjectLower.includes('calendar')) {
      category = 'invite';
    }

    return {
      category,
      subject,
      from,
      date,
      snippet,
    };
  }

  private convertToItem(userId: string, parsedEmail: any, timezone: string): InsertItem {
    const cleanSubject = parsedEmail.subject
      .replace(/^Re:\s*/i, '')
      .replace(/^Fwd:\s*/i, '')
      .trim();

    const notes = `From: ${parsedEmail.from}\nDate: ${parsedEmail.date}`;

    if (parsedEmail.category === 'invite') {
      return {
        userId,
        type: 'event',
        fixed: true,
        title: cleanSubject,
        tags: ['gmail', 'invite'],
        notes,
        priority: 'high',
      };
    }

    if (parsedEmail.category === 'deadline') {
      return {
        userId,
        type: 'task',
        fixed: false,
        title: cleanSubject,
        tags: ['gmail', 'deadline'],
        notes,
        priority: 'high',
      };
    }

    if (parsedEmail.category === 'action') {
      return {
        userId,
        type: 'task',
        fixed: false,
        title: cleanSubject,
        tags: ['gmail', 'action'],
        notes,
        priority: 'normal',
      };
    }

    if (parsedEmail.category === 'pr_review') {
      return {
        userId,
        type: 'task',
        durationMinutes: 45,
        title: cleanSubject,
        tags: ['gmail', 'code-review'],
        notes,
        priority: 'high',
      };
    }

    return {
      userId,
      type: 'task',
      title: cleanSubject,
      tags: ['gmail'],
      notes,
      priority: 'normal',
    };
  }

  async syncUserGmail(userId: string, timezone: string = 'Asia/Riyadh'): Promise<{
    itemsCreated: number;
    categories: Record<string, number>;
  }> {
    const gmail = await getUncachableGmailClient();
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'newer_than:7d',
      maxResults: 50
    });

    const messageIds = response.data.messages?.map(msg => msg.id as string) || [];
    
    const categories: Record<string, number> = {
      invite: 0,
      deadline: 0,
      action: 0,
      pr_review: 0,
    };

    let itemsCreated = 0;

    for (const messageId of messageIds) {
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
        metadataHeaders: ['Subject', 'From', 'Date']
      });

      const parsedEmail = this.parseEmailForActionItems(message.data);

      if (['invite', 'deadline', 'action', 'pr_review'].includes(parsedEmail.category)) {
        const item = this.convertToItem(userId, parsedEmail, timezone);
        await this.storage.createItem(item);
        
        categories[parsedEmail.category]++;
        itemsCreated++;
      }
    }

    const existingState = await this.storage.getGmailState(userId);
    const gmailStateData: InsertGmailState = {
      userId,
      historyId: existingState?.historyId || '0',
      watchSetAt: new Date(),
      emailAddress: existingState?.emailAddress || undefined,
    };
    await this.storage.upsertGmailState(gmailStateData);

    return {
      itemsCreated,
      categories,
    };
  }
}

export { getUncachableGmailClient };
