import { useState } from 'react';
import { TaskRow } from '../TaskRow';
import { Chip } from '../Chip';
import { EmptyState } from '../EmptyState';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  duration?: string;
  dueDate?: string;
  section?: 'now' | 'next' | 'later';
}

interface TasksScreenProps {
  onQuickAdd: () => void;
}

export function TasksScreen({ onQuickAdd }: TasksScreenProps) {
  const [activeView, setActiveView] = useState('today');
  const [filters, setFilters] = useState<string[]>([]);
  
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Review project proposal draft',
      completed: false,
      priority: 'high',
      duration: '2h',
      dueDate: '10:00 AM',
      section: 'now',
    },
    {
      id: '2',
      title: 'Prepare for team meeting',
      completed: false,
      priority: 'medium',
      duration: '30m',
      dueDate: '2:00 PM',
      section: 'next',
    },
    {
      id: '3',
      title: 'Review pull requests',
      completed: false,
      priority: 'low',
      duration: '1h',
      section: 'later',
    },
    {
      id: '4',
      title: 'Send weekly update email',
      completed: true,
      priority: 'medium',
      duration: '15m',
      section: 'now',
    },
  ]);

  const handleToggleTask = (id: string) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  const toggleFilter = (filter: string) => {
    setFilters(prev =>
      prev.includes(filter)
        ? prev.filter(f => f !== filter)
        : [...prev, filter]
    );
  };

  const filterOptions = ['Priority', 'Due', 'Type'];

  const todayTasks = tasks.filter(t => !t.completed);
  const sections = [
    { id: 'now', title: 'Now', tasks: todayTasks.filter(t => t.section === 'now') },
    { id: 'next', title: 'Next', tasks: todayTasks.filter(t => t.section === 'next') },
    { id: 'later', title: 'Later', tasks: todayTasks.filter(t => t.section === 'later') },
  ];

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeView} onValueChange={setActiveView} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4 pt-3">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            {filterOptions.map((filter) => (
              <Chip
                key={filter}
                onClick={() => toggleFilter(filter)}
                selected={filters.includes(filter)}
              >
                {filter}
              </Chip>
            ))}
          </div>
        </div>

        <TabsContent value="today" className="flex-1 overflow-y-auto m-0">
          {sections.map((section) => (
            section.tasks.length > 0 && (
              <div key={section.id} className="border-b border-border last:border-b-0">
                <div className="px-4 py-2 bg-accent/30">
                  <h3 className="text-[13px] text-muted-foreground">{section.title}</h3>
                </div>
                {section.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    {...task}
                    onToggle={handleToggleTask}
                    onPlay={(id) => console.log('Play task:', id)}
                    onMore={(id) => console.log('More options:', id)}
                  />
                ))}
              </div>
            )
          ))}
          
          {todayTasks.length === 0 && (
            <EmptyState
              emoji="✨"
              title="All done for today!"
              description="You've completed all your tasks. Great job!"
              actionLabel="Add a task"
              onAction={onQuickAdd}
            />
          )}
        </TabsContent>

        <TabsContent value="week" className="flex-1 overflow-y-auto m-0">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              {...task}
              onToggle={handleToggleTask}
              onPlay={(id) => console.log('Play task:', id)}
              onMore={(id) => console.log('More options:', id)}
            />
          ))}
        </TabsContent>

        <TabsContent value="all" className="flex-1 overflow-y-auto m-0">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              {...task}
              onToggle={handleToggleTask}
              onPlay={(id) => console.log('Play task:', id)}
              onMore={(id) => console.log('More options:', id)}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
