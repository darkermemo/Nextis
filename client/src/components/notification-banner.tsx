import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BellRing, X, Clock, CheckCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface NotificationPayload {
  itemId?: string;
  fromSlot?: string;
  toSlot?: string;
  message?: string;
}

interface Notification {
  id: string;
  userId: string;
  kind: "suggestStart" | "rescheduleMiss" | "sitBreak" | "water" | "bedtime";
  payload: NotificationPayload;
  scheduled: string;
  sentAt: string | null;
  createdAt: string;
}

export function NotificationBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Poll notifications every 2 minutes
  const { data, refetch } = useQuery<{ notifications: Notification[] }>({
    queryKey: ["/api/notifications"],
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  // Trigger notification check periodically
  const checkMutation = useMutation({
    mutationFn: () => apiRequest("/api/notifications/check", "POST", { timezone: "Asia/Riyadh" }),
    onSuccess: () => {
      refetch();
    },
  });

  // Check for new notifications every 2 minutes
  useEffect(() => {
    checkMutation.mutate();
    const interval = setInterval(() => {
      checkMutation.mutate();
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const acknowledgeMutation = useMutation({
    mutationFn: ({ notificationId, action }: { notificationId: string; action: "accept" | "dismiss" | "snooze" }) =>
      apiRequest("/api/notifications/ack", "POST", {
        notificationId,
        action,
        timezone: "Asia/Riyadh",
      }),
    onSuccess: (_, variables) => {
      // Invalidate queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/next"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      
      // Mark as dismissed locally for immediate UI update
      if (variables.action === "dismiss") {
        setDismissed(prev => new Set(Array.from(prev).concat(variables.notificationId)));
      }
    },
  });

  const handleAction = (notificationId: string, action: "accept" | "dismiss" | "snooze") => {
    acknowledgeMutation.mutate({ notificationId, action });
  };

  const activeNotifications = data?.notifications?.filter(n => !dismissed.has(n.id)) || [];

  if (activeNotifications.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 space-y-2" data-testid="notification-banner-container">
      {activeNotifications.map((notification) => (
        <Alert
          key={notification.id}
          className="bg-primary/10 border-primary/30 relative"
          data-testid={`notification-${notification.id}`}
        >
          <BellRing className="h-4 w-4 text-primary" />
          <AlertDescription className="ml-6 pr-24">
            <p className="text-sm text-foreground" data-testid={`notification-message-${notification.id}`}>
              {notification.payload.message}
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={() => handleAction(notification.id, "accept")}
                disabled={acknowledgeMutation.isPending}
                className="h-8 px-3"
                data-testid={`button-accept-${notification.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAction(notification.id, "snooze")}
                disabled={acknowledgeMutation.isPending}
                className="h-8 px-3"
                data-testid={`button-snooze-${notification.id}`}
              >
                <Clock className="h-3 w-3 mr-1" />
                Snooze
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction(notification.id, "dismiss")}
                disabled={acknowledgeMutation.isPending}
                className="h-8 px-3"
                data-testid={`button-dismiss-${notification.id}`}
              >
                <X className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
