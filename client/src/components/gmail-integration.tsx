import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Mail, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface GmailStatus {
  connected: boolean;
  emailAddress: string | null;
  lastSyncAt: string | null;
}

interface SyncResult {
  success: boolean;
  itemsCreated?: number;
  categories?: Record<string, number>;
  error?: string;
}

export function GmailIntegration() {
  const { toast } = useToast();

  const { data: statusData, isLoading: statusLoading } = useQuery<GmailStatus>({
    queryKey: ['/api/gmail/status'],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/gmail/sync', {});
      return res.json();
    },
    onSuccess: (data: SyncResult) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['/api/gmail/status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        queryClient.invalidateQueries({ queryKey: ['/api/calendar'] });
        
        let description = `Successfully synced Gmail.`;
        if (data.itemsCreated !== undefined) {
          description += ` Created ${data.itemsCreated} new item${data.itemsCreated !== 1 ? 's' : ''}.`;
        }
        
        toast({
          title: "Gmail synced",
          description,
        });
      } else {
        toast({
          title: "Sync failed",
          description: data.error || "Failed to sync Gmail. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to sync Gmail. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSync = () => {
    syncMutation.mutate();
  };

  if (statusLoading) {
    return <div data-testid="gmail-integration-loading">Loading Gmail integration...</div>;
  }

  const status = statusData;
  const isConnected = status?.connected ?? false;

  return (
    <div className="space-y-4" data-testid="gmail-integration">
      <Card data-testid="card-gmail-integration">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            Gmail Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Connection Status:</span>
            <Badge
              variant={isConnected ? "default" : "destructive"}
              className="flex items-center gap-1"
              data-testid="badge-connection-status"
            >
              {isConnected ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3" />
                  Not Connected
                </>
              )}
            </Badge>
          </div>

          {isConnected && status?.emailAddress && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="text-sm font-medium" data-testid="text-email-address">
                {status.emailAddress}
              </span>
            </div>
          )}

          {isConnected && status?.lastSyncAt && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Last Sync:</span>
              <span className="text-sm" data-testid="text-last-sync">
                {dayjs(status.lastSyncAt).fromNow()}
              </span>
            </div>
          )}

          {isConnected && (
            <Button
              onClick={handleSync}
              disabled={syncMutation.isPending}
              className="w-full"
              data-testid="button-sync-gmail"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync Gmail"}
            </Button>
          )}

          {!isConnected && (
            <p className="text-sm text-muted-foreground" data-testid="text-not-connected">
              Gmail is not connected. Please connect your Gmail account to enable syncing.
            </p>
          )}

          {syncMutation.isSuccess && syncMutation.data?.categories && (
            <div className="space-y-2 pt-2 border-t" data-testid="sync-result-breakdown">
              <span className="text-sm font-medium">Items Created:</span>
              <div className="space-y-1">
                {Object.entries(syncMutation.data.categories).map(([category, count]) => (
                  <div key={category} className="flex justify-between text-sm" data-testid={`category-${category}`}>
                    <span className="text-muted-foreground capitalize">{category}:</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
