import { MessageSquare, CheckSquare, Calendar, BookOpen, BarChart3 } from 'lucide-react';

interface TabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  const tabs = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'learning', label: 'Learning', icon: BookOpen },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 glass-heavy border-t z-50 pb-safe">
      <div className="flex items-center justify-around max-w-screen-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex flex-col items-center gap-1 py-2 px-4 min-w-[64px] transition-all active:scale-95"
            >
              <Icon 
                size={24} 
                className={`transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span className={`
                text-[10px] font-medium transition-colors
                ${isActive ? 'text-primary' : 'text-muted-foreground'}
              `}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
