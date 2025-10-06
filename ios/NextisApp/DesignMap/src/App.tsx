import { useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { MoodPill } from './components/MoodPill';
import { NotificationBanner } from './components/NotificationBanner';
import { TabBar } from './components/TabBar';
import { QuickAddFAB } from './components/QuickAddFAB';
import { QuickAddSheet } from './components/QuickAddSheet';
import { PlanExplainerSheet } from './components/PlanExplainerSheet';
import { ChatScreen } from './components/screens/ChatScreen';
import { TasksScreen } from './components/screens/TasksScreen';
import { CalendarScreen } from './components/screens/CalendarScreen';
import { LearningScreen } from './components/screens/LearningScreen';
import { InsightsScreen } from './components/screens/InsightsScreen';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [isMoodPillOpen, setIsMoodPillOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isPlanExplainerOpen, setIsPlanExplainerOpen] = useState(false);

  const tabTitles: Record<string, string> = {
    chat: 'Chat',
    tasks: 'Tasks',
    calendar: 'Calendar',
    learning: 'Learning',
    insights: 'Insights',
  };

  const mockPlanEvent = {
    title: 'Deep Work Session',
    time: '9:00 - 11:00 AM',
    reason: 'Your most productive hours based on historical data',
    alternatives: [
      { time: '2:00 - 4:00 PM', reason: 'Secondary peak productivity window' },
      { time: '7:00 - 9:00 PM', reason: 'Evening focus time with fewer distractions' },
    ],
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'chat':
        return <ChatScreen onQuickAdd={() => setIsQuickAddOpen(true)} />;
      case 'tasks':
        return <TasksScreen onQuickAdd={() => setIsQuickAddOpen(true)} />;
      case 'calendar':
        return <CalendarScreen />;
      case 'learning':
        return <LearningScreen />;
      case 'insights':
        return <InsightsScreen />;
      default:
        return <ChatScreen onQuickAdd={() => setIsQuickAddOpen(true)} />;
    }
  };

  return (
    <div className="h-screen flex flex-col max-w-screen-lg mx-auto relative overflow-hidden">

      {/* Notification Banner */}
      <NotificationBanner
        message="You have a meeting in 15 minutes: Team Sync"
        onAccept={() => console.log('Accept')}
        onSnooze={() => console.log('Snooze')}
      />

      {/* Header */}
      <AppHeader
        title={tabTitles[activeTab]}
        onMoodClick={() => setIsMoodPillOpen(!isMoodPillOpen)}
      />

      {/* Mood Pill */}
      <MoodPill isOpen={isMoodPillOpen} onClose={() => setIsMoodPillOpen(false)} />

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderScreen()}
      </div>

      {/* Bottom Tab Bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Quick Add FAB */}
      <QuickAddFAB onClick={() => setIsQuickAddOpen(true)} />

      {/* Modals/Sheets */}
      <QuickAddSheet open={isQuickAddOpen} onOpenChange={setIsQuickAddOpen} />
      <PlanExplainerSheet
        open={isPlanExplainerOpen}
        onOpenChange={setIsPlanExplainerOpen}
        event={mockPlanEvent}
      />

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}
