import { Search, X, Plus, MessageSquare, CheckSquare, Calendar, Clock, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Chip } from './Chip';

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddSheet({ open, onOpenChange }: QuickAddSheetProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'events', label: 'Events' },
    { id: 'habits', label: 'Habits' },
  ];

  const templates = [
    { id: '1', icon: CheckSquare, title: 'Quick Task', category: 'tasks', color: 'text-blue-500' },
    { id: '2', icon: Calendar, title: 'Meeting', category: 'events', color: 'text-purple-500' },
    { id: '3', icon: Clock, title: 'Deep Work', category: 'tasks', color: 'text-green-500' },
    { id: '4', icon: Dumbbell, title: 'Workout', category: 'habits', color: 'text-orange-500' },
    { id: '5', icon: MessageSquare, title: 'Follow-up', category: 'tasks', color: 'text-pink-500' },
    { id: '6', icon: Plus, title: 'Custom', category: 'all', color: 'text-muted-foreground' },
  ];

  const filteredTemplates = templates.filter(
    (t) =>
      (selectedCategory === 'all' || t.category === selectedCategory) &&
      t.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleTemplateClick = (template: typeof templates[0]) => {
    console.log('Selected template:', template);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] max-h-[600px]">
        <SheetHeader>
          <SheetTitle>Quick Add</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <Chip
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                selected={selectedCategory === category.id}
              >
                {category.label}
              </Chip>
            ))}
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-2 gap-3">
            {filteredTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  key={template.id}
                  onClick={() => handleTemplateClick(template)}
                  className="flex flex-col items-center gap-2 p-4 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  <Icon size={24} className={template.color} />
                  <span className="text-[13px]">{template.title}</span>
                </button>
              );
            })}
          </div>

          {filteredTemplates.length === 0 && (
            <div className="text-center py-8">
              <p className="text-[13px] text-muted-foreground">No templates found</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
