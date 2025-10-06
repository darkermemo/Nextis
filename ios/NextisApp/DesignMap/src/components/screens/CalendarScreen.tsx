import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MoreHorizontal } from 'lucide-react';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: 'study' | 'event' | 'break' | 'leisure' | 'quiz';
  date: Date;
  description?: string;
}

export function CalendarScreen() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  
  // Generate week dates
  const getWeekDates = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = currentDay === 0 ? -6 : 1 - currentDay; // Monday as first day
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  };

  const weekDates = getWeekDates();

  // Mock events data with proper dates
  const events: CalendarEvent[] = [
    { 
      id: '1', 
      title: 'Deep Work Session', 
      startTime: '9:00 AM', 
      endTime: '11:00 AM', 
      type: 'study',
      date: weekDates[0],
      description: 'Focus on project proposal'
    },
    { 
      id: '2', 
      title: 'Team Meeting', 
      startTime: '2:00 PM', 
      endTime: '3:00 PM', 
      type: 'event',
      date: weekDates[0],
      description: 'Weekly sync with the team'
    },
    { 
      id: '3', 
      title: 'Coffee Break', 
      startTime: '11:00 AM', 
      endTime: '11:15 AM', 
      type: 'break',
      date: weekDates[0]
    },
    { 
      id: '4', 
      title: 'Code Review', 
      startTime: '10:00 AM', 
      endTime: '11:30 AM', 
      type: 'study',
      date: weekDates[1],
      description: 'Review pending PRs'
    },
    { 
      id: '5', 
      title: 'Gym Workout', 
      startTime: '6:00 PM', 
      endTime: '7:00 PM', 
      type: 'leisure',
      date: weekDates[1]
    },
    { 
      id: '6', 
      title: 'React Quiz', 
      startTime: '3:00 PM', 
      endTime: '3:30 PM', 
      type: 'quiz',
      date: weekDates[2]
    },
    { 
      id: '7', 
      title: 'Lunch Break', 
      startTime: '12:30 PM', 
      endTime: '1:30 PM', 
      type: 'break',
      date: weekDates[2]
    },
  ];

  const typeColors = {
    study: { 
      bg: 'bg-blue-50 dark:bg-blue-950/30', 
      border: 'border-l-blue-500', 
      text: 'text-blue-600 dark:text-blue-400', 
      dot: 'bg-blue-500',
      icon: 'bg-blue-500'
    },
    event: { 
      bg: 'bg-purple-50 dark:bg-purple-950/30', 
      border: 'border-l-purple-500', 
      text: 'text-purple-600 dark:text-purple-400', 
      dot: 'bg-purple-500',
      icon: 'bg-purple-500'
    },
    break: { 
      bg: 'bg-green-50 dark:bg-green-950/30', 
      border: 'border-l-green-500', 
      text: 'text-green-600 dark:text-green-400', 
      dot: 'bg-green-500',
      icon: 'bg-green-500'
    },
    leisure: { 
      bg: 'bg-orange-50 dark:bg-orange-950/30', 
      border: 'border-l-orange-500', 
      text: 'text-orange-600 dark:text-orange-400', 
      dot: 'bg-orange-500',
      icon: 'bg-orange-500'
    },
    quiz: { 
      bg: 'bg-red-50 dark:bg-red-950/30', 
      border: 'border-l-red-500', 
      text: 'text-red-600 dark:text-red-400', 
      dot: 'bg-red-500',
      icon: 'bg-red-500'
    },
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatDayName = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const formatDayNumber = (date: Date) => {
    return date.getDate();
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSameDay = (date1: Date, date2: Date) => {
    return date1.toDateString() === date2.toDateString();
  };

  const getEventsForDate = (date: Date) => {
    return events
      .filter(event => isSameDay(event.date, date))
      .sort((a, b) => {
        const timeA = parseInt(a.startTime.split(':')[0]);
        const timeB = parseInt(b.startTime.split(':')[0]);
        return timeA - timeB;
      });
  };

  const hasEvents = (date: Date) => {
    return events.some(event => isSameDay(event.date, date));
  };

  const getEventsForWeek = () => {
    const grouped: { date: Date; events: CalendarEvent[] }[] = [];
    
    weekDates.forEach(date => {
      const dayEvents = getEventsForDate(date);
      if (dayEvents.length > 0) {
        grouped.push({ date, events: dayEvents });
      }
    });
    
    return grouped;
  };

  const weekEvents = getEventsForWeek();

  return (
    <div className="flex flex-col h-full">
      {/* Month Navigation */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{formatDate(selectedDate)}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent active:scale-95"
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() - 7);
                setSelectedDate(newDate);
              }}
            >
              <ChevronLeft size={18} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg bg-primary text-primary-foreground border-0 hover:bg-primary/90 active:scale-95"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg hover:bg-accent active:scale-95"
              onClick={() => {
                const newDate = new Date(selectedDate);
                newDate.setDate(newDate.getDate() + 7);
                setSelectedDate(newDate);
              }}
            >
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Week Days Selector */}
      <div className="px-2 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-around">
          {weekDates.map((date, index) => {
            const isSelected = isSameDay(date, selectedDate);
            const today = isToday(date);
            
            return (
              <button
                key={index}
                onClick={() => setSelectedDate(date)}
                className={`
                  flex flex-col items-center gap-1 py-2 px-2 rounded-xl transition-all min-w-[44px]
                  active:scale-95
                  ${isSelected 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'hover:bg-accent'}
                `}
              >
                <span className={`text-[11px] ${
                  isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                }`}>
                  {formatDayName(date)}
                </span>
                <span className={`text-[17px] font-medium ${
                  isSelected ? 'text-primary-foreground' : today ? 'text-primary' : ''
                }`}>
                  {formatDayNumber(date)}
                </span>
                {hasEvents(date) && (
                  <div className={`w-1 h-1 rounded-full ${
                    isSelected ? 'bg-primary-foreground' : 'bg-primary'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Events List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {getEventsForDate(selectedDate).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-5xl mb-3">📅</div>
              <p className="text-[15px] font-medium mb-1">No events</p>
              <p className="text-[13px] text-muted-foreground">
                {isToday(selectedDate) ? 'You have no events today' : 'No events on this day'}
              </p>
            </div>
          ) : (
            getEventsForDate(selectedDate).map((event) => {
              const colors = typeColors[event.type];
              
              return (
                <button
                  key={event.id}
                  className={`
                    w-full text-left p-4 rounded-xl border-l-4 transition-all
                    active:scale-[0.98] ios-shadow
                    ${colors.bg} ${colors.border} hover:shadow-md
                  `}
                  onClick={() => console.log('Event clicked:', event)}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-[15px] font-semibold flex-1">{event.title}</h3>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('More options:', event);
                      }}
                      className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all active:scale-95"
                    >
                      <MoreHorizontal size={16} className="text-muted-foreground" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-lg ${colors.icon} flex items-center justify-center`}>
                      <Clock size={14} className="text-white" />
                    </div>
                    <span className="text-[13px] text-muted-foreground">
                      {event.startTime} - {event.endTime}
                    </span>
                  </div>

                  {event.description && (
                    <p className="text-[13px] text-muted-foreground leading-relaxed mb-2">
                      {event.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {event.type}
                    </span>
                  </div>
                </button>
              );
            })
          )}

          {/* Week Overview */}
          {getEventsForDate(selectedDate).length > 0 && (
            <div className="pt-4 mt-4 border-t">
              <h3 className="text-[13px] font-semibold text-muted-foreground mb-3">This Week</h3>
              <div className="space-y-2">
                {weekEvents.map((day, index) => (
                  <div key={index} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-[13px] font-medium">
                        {formatDayName(day.date)}, {formatDayNumber(day.date)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {day.events.length} event{day.events.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {day.events.slice(0, 3).map((event, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 rounded-full ${typeColors[event.type].dot}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}